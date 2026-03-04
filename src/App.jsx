import { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Map from './components/Map';
import TerraceList from './components/TerraceList';
import { loadLocalTerraces, fetchAllTerraces } from './api/terraces';
import { fetchWeatherForecast, getWeatherForTime } from './api/weather';
import { getSolarPosition, calculateSunScore } from './utils/solarCalculations';
import { loadShadowData, enrichTerracesWithShadows } from './utils/precomputedShadows';
import './App.css';

const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;

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

  // Calculate sun position
  const sunPosition = useMemo(() => {
    const hour = Math.floor(selectedHour);
    const minute = Math.round((selectedHour - hour) * 60);
    const dateTime = new Date(`${selectedDate}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);

    return getSolarPosition(dateTime, PARIS_LAT, PARIS_LNG);
  }, [selectedDate, selectedHour]);

  // Get weather for selected time
  const weatherInfo = useMemo(() => {
    if (!weatherData) return null;

    const hour = Math.floor(selectedHour);
    return getWeatherForTime(weatherData, selectedDate, hour);
  }, [weatherData, selectedDate, selectedHour]);

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
    const counts = { high: 0, mid: 0, low: 0, none: 0 };
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
        <Map
          terraces={filteredTerraces}
          onTerraceClick={setSelectedTerrace}
          selectedTerrace={selectedTerrace}
        />

        <TerraceList
          terraces={filteredTerraces}
          onTerraceClick={setSelectedTerrace}
          selectedTerrace={selectedTerrace}
          loading={loading}
          loadingProgress={loadingProgress}
          loadingStage={loadingStage}
          sunFilters={sunFilters}
          onFiltersChange={setSunFilters}
          terraceCounts={terraceCounts}
          sunPosition={sunPosition}
        />
      </main>

      <footer className="status-bar">
        <span>Source : <strong>opendata.paris.fr</strong> — Terrasses et étalages autorisées</span>
        <span>
          {sunPosition.altitude > 0
            ? `Soleil : altitude ${sunPosition.altitude.toFixed(1)}° — azimut ${sunPosition.azimuth.toFixed(0)}°`
            : 'Soleil couché'}
        </span>
      </footer>
    </div>
  );
}

export default App;
