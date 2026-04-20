import { useState, useRef, useEffect } from 'react';
import SunFilter from './SunFilter';
import './Header.css';

function Header({
  selectedDate,
  onDateChange,
  selectedHour,
  onHourChange,
  sunPosition,
  weatherInfo,
  onSearch,
  sunFilters,
  onFiltersChange,
  terraceCounts,
  suggestions = [],
  onSuggestionSelect
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );
  const searchWrapRef = useRef(null);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch(value);
  };

  const query = searchQuery.trim().toLowerCase();
  const topSuggestions = query.length > 0
    ? suggestions
        .filter(t =>
          t.name.toLowerCase().includes(query) ||
          t.address.toLowerCase().includes(query) ||
          t.arrondissement.toLowerCase().includes(query)
        )
        .slice(0, 20)
    : [];

  const handleSelectSuggestion = (t) => {
    onSuggestionSelect?.(t);
    setSearchQuery('');
    onSearch('');
    setFocused(false);
  };

  const formatHour = (hour) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  };

  return (
    <header className="header">
      <div className="logo">
        <img src="/cocktail_cropped.png" alt="logo" width="32" height="32" style={{ objectFit: 'contain' }} />
        <h1>Un verre au soleil ?</h1>
      </div>

      <div className="search-wrap" ref={searchWrapRef}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder={isMobile ? 'Rechercher une terrasse' : 'Rechercher une terrasse, rue, quartier...'}
          value={searchQuery}
          onChange={handleSearchChange}
          onFocus={() => setFocused(true)}
        />
        {weatherInfo && (
          <div className="weather-inline" title={weatherInfo.label}>
            <span className="weather-icon">{weatherInfo.icon}</span>
            <div className="weather-text">
              <span className="weather-temp">{Math.round(weatherInfo.temperature)}°</span>
              {(weatherInfo.tempMin != null || weatherInfo.tempMax != null) && (
                <span className="weather-range">
                  {weatherInfo.tempMin != null && <span className="temp-min">{Math.round(weatherInfo.tempMin)}°</span>}
                  {weatherInfo.tempMin != null && weatherInfo.tempMax != null && <span className="temp-sep">/</span>}
                  {weatherInfo.tempMax != null && <span className="temp-max">{Math.round(weatherInfo.tempMax)}°</span>}
                </span>
              )}
            </div>
          </div>
        )}
        {focused && topSuggestions.length > 0 && (
          <ul className="search-suggestions">
            {topSuggestions.map((t, i) => (
              <li
                key={i}
                className="search-suggestion"
                onMouseDown={(e) => { e.preventDefault(); handleSelectSuggestion(t); }}
              >
                <span className="suggestion-name">{t.name}</span>
                <span className="suggestion-meta">
                  {t.address} · {t.arrondissement}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {weatherInfo && (
        <div className="weather-indicator weather-indicator-desktop">
          <span className="weather-icon">{weatherInfo.icon}</span>
          <div className="weather-text">
            <span className="weather-temp">{Math.round(weatherInfo.temperature)}°</span>
            {(weatherInfo.tempMin != null || weatherInfo.tempMax != null) && (
              <span className="weather-range">
                {weatherInfo.tempMin != null && <span className="temp-min">{Math.round(weatherInfo.tempMin)}°</span>}
                {weatherInfo.tempMin != null && weatherInfo.tempMax != null && <span className="temp-sep">/</span>}
                {weatherInfo.tempMax != null && <span className="temp-max">{Math.round(weatherInfo.tempMax)}°</span>}
              </span>
            )}
          </div>
          <span className="weather-label">{weatherInfo.label}</span>
        </div>
      )}

      <div className="time-controls">
        <input
          type="date"
          className="date-input"
          value={selectedDate}
          onChange={(e) => onDateChange(e.target.value)}
        />

        <div className="hour-control">
          <input
            type="range"
            className="hour-slider"
            min="6"
            max="22"
            step="0.25"
            value={selectedHour}
            onChange={(e) => onHourChange(parseFloat(e.target.value))}
          />
          <div className="hour-display">{formatHour(selectedHour)}</div>
        </div>

        <SunFilter
          activeFilters={sunFilters}
          onChange={onFiltersChange}
          terraceCounts={terraceCounts}
          compact={true}
        />
      </div>
    </header>
  );
}

export default Header;
