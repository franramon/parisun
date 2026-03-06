import { useState } from 'react';
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
  terraceCounts
}) {
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchChange = (e) => {
    const value = e.target.value;
    setSearchQuery(value);
    onSearch(value);
  };

  const formatHour = (hour) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  };

  return (
    <header className="header">
      <div className="logo">
        <svg viewBox="0 0 32 32" fill="none" width="32" height="32">
          <circle cx="16" cy="16" r="10" fill="#E8A020"/>
          <circle cx="16" cy="16" r="6" fill="#F5C84C"/>
          <line x1="16" y1="2" x2="16" y2="6" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="16" y1="26" x2="16" y2="30" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="2" y1="16" x2="6" y2="16" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="26" y1="16" x2="30" y2="16" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="6.1" y1="6.1" x2="8.9" y2="8.9" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="23.1" y1="23.1" x2="25.9" y2="25.9" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="25.9" y1="6.1" x2="23.1" y2="8.9" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
          <line x1="8.9" y1="23.1" x2="6.1" y2="25.9" stroke="#E8A020" strokeWidth="2" strokeLinecap="round"/>
        </svg>
        <h1>A beer by the sun</h1>
      </div>

      <div className="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="Rechercher une terrasse, rue, quartier..."
          value={searchQuery}
          onChange={handleSearchChange}
        />
      </div>

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

        {weatherInfo && (
          <div className="weather-indicator">
            <span className="weather-icon">{weatherInfo.icon}</span>
            <span>{weatherInfo.label} · {Math.round(weatherInfo.temperature)}°C</span>
          </div>
        )}

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
