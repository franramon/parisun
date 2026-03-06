import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Header from './components/Header';
import Map from './components/Map';
import TerraceList from './components/TerraceList';
import { loadLocalTerraces, fetchAllTerraces } from './api/terraces';
import { fetchWeatherForecast, fetchArchiveWeather, getWeatherForTime } from './api/weather';
import { getSolarPosition, calculateSunScore } from './utils/solarCalculations';
import { loadShadowData, enrichTerracesWithShadows } from './utils/precomputedShadows';
import './App.css';

const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;

const formatHour = (hour) => {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
};

function WeatherBanner({ sunPosition, weatherInfo }) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismiss when conditions change
  const key = `${sunPosition.altitude < 0}-${weatherInfo?.sunny}`;
  const prevKey = useRef(key);
  if (prevKey.current !== key) {
    prevKey.current = key;
    // conditions changed — show again
    if (dismissed) setDismissed(false);
  }

  if (dismissed) return null;

  let message = null;
  if (sunPosition.altitude <= 0) {
    message = { icon: '🌙', text: 'Le soleil est couché — revenez demain pour trouver votre terrasse ensoleillée !' };
  } else if (weatherInfo && !weatherInfo.sunny) {
    message = { icon: weatherInfo.icon, text: `${weatherInfo.label} sur Paris en ce moment — les terrasses sont là, mais prévoyez un imperméable !` };
  }

  if (!message) return null;

  return (
    <div style={{
      position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
      zIndex: 900, display: 'flex', alignItems: 'flex-start', gap: 10,
      background: 'rgba(44, 36, 22, 0.88)', backdropFilter: 'blur(8px)',
      color: '#FFF3D6', borderRadius: 16, padding: '12px 16px 12px 14px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)', fontSize: 13, fontWeight: 500,
      maxWidth: 380, width: 'calc(100vw - 48px)',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{message.icon}</span>
      <span style={{ flex: 1, lineHeight: 1.5 }}>{message.text}</span>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', color: 'rgba(255,243,214,0.5)',
        cursor: 'pointer', fontSize: 16, padding: '0 0 0 8px', lineHeight: 1,
        flexShrink: 0,
      }}>✕</button>
    </div>
  );
}

function App() {
  // State
  const [allTerraces, setAllTerraces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [loadingStage, setLoadingStage] = useState(''); // New: track what's loading
  const [weatherData, setWeatherData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTerrace, setSelectedTerrace] = useState(null);
  const [sunFilters, setSunFilters] = useState(new Set(['sunny', 'shaded']));
  const [terracesInView, setTerracesInView] = useState(null); // array of terraces visible on map
  const boundsRef = useRef(null); // current map bounds, stored without triggering re-renders
  const [listOpen, setListOpen] = useState(false); // mobile bottom sheet

  // Date and time state
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return now.toISOString().slice(0, 10);
  });

  const [selectedHour, setSelectedHour] = useState(() => {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    return hour >= 6 && hour <= 22 ? hour : 14;
  });
  // Debounced hour: heavy calculations only fire 150ms after slider stops
  const [debouncedHour, setDebouncedHour] = useState(selectedHour);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedHour(selectedHour), 150);
    return () => clearTimeout(t);
  }, [selectedHour]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setLoadingProgress(0);

        // Load terraces
        setLoadingStage('Chargement des terrasses...');
        let terraces;
        try {
          terraces = await loadLocalTerraces((progress) => {
            setLoadingProgress(Math.round(progress * 0.4)); // 0-40%
          });
        } catch (localError) {
          console.warn('Local data not available, falling back to API:', localError);
          terraces = await fetchAllTerraces((progress) => {
            setLoadingProgress(Math.round(progress * 0.4));
          });
        }

        // Load shadow data
        setLoadingStage('Chargement des données d\'ombres...');
        const shadowDataPromise = loadShadowData((progress) => {
          setLoadingProgress(40 + Math.round(progress * 0.5)); // 40-90%
        });

        // Load weather
        setLoadingStage('Chargement de la météo...');
        const weatherPromise = fetchWeatherForecast();

        // Wait for shadows and weather
        const [, weather] = await Promise.all([shadowDataPromise, weatherPromise]);

        setLoadingProgress(100);
        setLoadingStage('Calcul des scores solaires...');

        setAllTerraces(terraces);
        setWeatherData(weather);

        // Small delay to show final stage
        setTimeout(() => {
          setLoading(false);
          setLoadingStage('');
        }, 300);

      } catch (error) {
        console.error('Error loading data:', error);
        setLoading(false);
        setLoadingStage('');
      }
    };

    loadData();
  }, []);

  // Calculate sun position (debounced — only recomputes 150ms after slider stops)
  const sunPosition = useMemo(() => {
    const hour = Math.floor(debouncedHour);
    const minute = Math.round((debouncedHour - hour) * 60);
    const dateTime = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);

    return getSolarPosition(dateTime, PARIS_LAT, PARIS_LNG);
  }, [selectedDate, debouncedHour]);

  // Fetch archive weather when selected date is outside forecast range
  useEffect(() => {
    if (!weatherData) return;

    const hour = Math.floor(debouncedHour);
    const found = getWeatherForTime(weatherData, selectedDate, hour);
    if (found) return; // already covered by forecast

    // Date not in forecast — fetch from archive API
    fetchArchiveWeather(selectedDate).then(archiveData => {
      if (!archiveData) return;
      // Merge archive data into weatherData by appending its hourly arrays
      setWeatherData(prev => {
        if (!prev) return archiveData;
        return {
          ...prev,
          hourly: {
            time: [...prev.hourly.time, ...archiveData.hourly.time],
            temperature_2m: [...prev.hourly.temperature_2m, ...archiveData.hourly.temperature_2m],
            weather_code: [...prev.hourly.weather_code, ...archiveData.hourly.weather_code],
            cloud_cover: [...prev.hourly.cloud_cover, ...archiveData.hourly.cloud_cover],
          }
        };
      });
    });
  }, [selectedDate, weatherData, debouncedHour]);

  // Get weather for selected time
  const weatherInfo = useMemo(() => {
    if (!weatherData) return null;

    const hour = Math.floor(debouncedHour);
    return getWeatherForTime(weatherData, selectedDate, hour);
  }, [weatherData, selectedDate, debouncedHour]);

  // Filter terraces by search query first
  const searchFiltered = useMemo(() => {
    if (!searchQuery.trim()) return allTerraces;

    const query = searchQuery.toLowerCase().trim();
    return allTerraces.filter(terrace =>
      terrace.name.toLowerCase().includes(query) ||
      terrace.address.toLowerCase().includes(query) ||
      terrace.arrondissement.toLowerCase().includes(query) ||
      terrace.typologie.toLowerCase().includes(query)
    );
  }, [allTerraces, searchQuery]);

  // Enrich terraces with pre-computed shadow data and calculate scores
  const terracesWithScores = useMemo(() => {
    if (searchFiltered.length === 0) return [];

    const weatherFactor = weatherInfo?.weatherFactor ?? 0.8;

    // Add shadow factors from pre-computed data
    const terracesWithShadows = enrichTerracesWithShadows(searchFiltered, sunPosition);

    // Calculate scores with shadow data
    const withScores = terracesWithShadows.map(terrace => {
      const score = calculateSunScore(sunPosition, terrace, weatherFactor);
      return {
        ...terrace,
        sunScore: score.score,
        sunLabel: score.label,
        sunClass: score.class
      };
    });

    // Sort by score
    withScores.sort((a, b) => b.sunScore - a.sunScore);

    return withScores;
  }, [searchFiltered, sunPosition, weatherInfo]);

  // Calculate terrace counts by sun class
  const terraceCounts = useMemo(() => {
    const counts = { sunny: 0, shaded: 0, none: 0 };
    terracesWithScores.forEach(t => {
      if (counts[t.sunClass] !== undefined) {
        counts[t.sunClass]++;
      }
    });
    return counts;
  }, [terracesWithScores]);

  // Apply sun filter
  const filteredTerraces = useMemo(() => {
    if (sunFilters.size === 0) return terracesWithScores;

    return terracesWithScores.filter(t => sunFilters.has(t.sunClass));
  }, [terracesWithScores, sunFilters]);

  // Stable callback for Map — receives bounds object, no array, no re-render cascade
  const handleBoundsChange = useCallback((bounds) => {
    boundsRef.current = bounds;
    const inView = filteredTerraces.filter(t =>
      t.lat >= bounds.south &&
      t.lat <= bounds.north &&
      t.lng >= bounds.west &&
      t.lng <= bounds.east
    );
    setTerracesInView(inView);
  }, [filteredTerraces]);

  // Recompute sidebar list when filteredTerraces changes (time/filter change) using last known bounds
  useEffect(() => {
    if (!boundsRef.current) return;
    const b = boundsRef.current;
    const inView = filteredTerraces.filter(t =>
      t.lat >= b.south && t.lat <= b.north &&
      t.lng >= b.west && t.lng <= b.east
    );
    setTerracesInView(inView);
  }, [filteredTerraces]);

  return (
    <div className="app">
      <Header
        selectedDate={selectedDate}
        onDateChange={setSelectedDate}
        selectedHour={selectedHour}
        onHourChange={setSelectedHour}
        sunPosition={sunPosition}
        weatherInfo={weatherInfo}
        onSearch={setSearchQuery}
        sunFilters={sunFilters}
        onFiltersChange={setSunFilters}
        terraceCounts={terraceCounts}
      />

      <main className="main">
        <WeatherBanner sunPosition={sunPosition} weatherInfo={weatherInfo} />
        <Map
          terraces={filteredTerraces}
          onTerraceClick={(t) => { setSelectedTerrace(t); setListOpen(false); }}
          selectedTerrace={selectedTerrace}
          onBoundsChange={handleBoundsChange}
          isNight={sunPosition.altitude <= 0}
          isBadWeather={weatherInfo ? !weatherInfo.sunny : false}
        />

        <TerraceList
          terraces={terracesInView ?? filteredTerraces}
          onTerraceClick={(t) => { setSelectedTerrace(t); setListOpen(false); }}
          selectedTerrace={selectedTerrace}
          loading={loading}
          loadingProgress={loadingProgress}
          loadingStage={loadingStage}
          sunFilters={sunFilters}
          onFiltersChange={setSunFilters}
          terraceCounts={terraceCounts}
          sunPosition={sunPosition}
          weatherInfo={weatherInfo}
          inView={terracesInView !== null}
          listOpen={listOpen}
          onListClose={() => setListOpen(false)}
        />

        {/* Mobile bottom controls bar */}
        <div className="mobile-controls">
          <input
            type="date"
            className="date-input"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
          <div className="hour-control">
            <input
              type="range"
              className="hour-slider"
              min="6" max="22" step="0.25"
              value={selectedHour}
              onChange={(e) => setSelectedHour(parseFloat(e.target.value))}
            />
            <div className="hour-display">{formatHour(selectedHour)}</div>
          </div>
          <button
            className={`filter-chip sunny ${sunFilters.has('sunny') ? 'active' : ''}`}
            onClick={() => {
              const s = new Set(sunFilters);
              s.has('sunny') ? s.delete('sunny') : s.add('sunny');
              setSunFilters(s);
            }}
          >☀️</button>
          <button
            className={`filter-chip shaded ${sunFilters.has('shaded') ? 'active' : ''}`}
            onClick={() => {
              const s = new Set(sunFilters);
              s.has('shaded') ? s.delete('shaded') : s.add('shaded');
              setSunFilters(s);
            }}
          >🌑</button>
        </div>

        {/* Mobile FAB — toggle list */}
        <button
          className="fab-list"
          onClick={() => setListOpen(o => !o)}
          aria-label="Afficher la liste"
        >
          {listOpen ? '✕' : `Liste · ${(terracesInView ?? filteredTerraces).length}`}
        </button>
      </main>

      <footer className="status-bar">
        <span>Terrasses : <strong>opendata.paris.fr</strong></span>
        <span>Bâtiments : <strong>IGN BD TOPO</strong></span>
        <span>Météo : <strong>Open-Meteo</strong></span>
      </footer>
    </div>
  );
}

export default App;
