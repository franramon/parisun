import SunFilter from './SunFilter';
import SunPosition from './SunPosition';
import { getSunnyUntil } from '../utils/solarCalculations';
import './TerraceList.css';

function TerraceList({ terraces, onTerraceClick, selectedTerrace, loading, loadingProgress, loadingStage, sunFilters, onFiltersChange, terraceCounts, sunPosition, weatherInfo, inView, listOpen, onListClose, selectedDate, selectedHour, onDateChange, onHourChange }) {
  if (loading) {
    const percentage = typeof loadingProgress === 'number'
      ? loadingProgress
      : (loadingProgress?.total ? Math.round((loadingProgress.loaded / loadingProgress.total) * 100) : 0);

    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Résultats</h2>
        </div>
        <div className="loading">
          <div className="spinner"></div>
          <div className="loading-text">
            <div>{loadingStage || 'Chargement...'}</div>
            {percentage > 0 && (
              <>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${percentage}%` }}></div>
                </div>
                <div className="progress-info">
                  {percentage}%
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const shortType = (type) => {
    if (!type) return '';
    return type
      .replace(/CONTRE TERRASSE/i, 'C-Terrasse')
      .replace(/TERRASSE/i, 'Terrasse')
      .replace(/ESTIVALE/i, 'est.')
      .replace(/SUR TROTTOIR/i, 'trottoir')
      .replace(/SUR STATIONNEMENT/i, 'statio.')
      .replace(/FACE À LA DEVANTURE/i, '')
      .replace(/OUVERTES/i, 'ouv.')
      .replace(/FERMÉES/i, 'ferm.')
      .trim();
  };

  const formatHour = (hour) => {
    const h = Math.floor(hour);
    const m = Math.round((hour - h) * 60);
    return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <div className={`sidebar${listOpen ? ' open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <h2>Résultats</h2>
          <span className="sidebar-count">{inView ? `${terraces.length} dans la zone` : `${terraces.length} terrasses`}</span>
          <button className="sidebar-close" onClick={onListClose}>✕</button>
        </div>
        <div className="sidebar-controls">
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
              min="6" max="22" step="0.25"
              value={selectedHour}
              onChange={(e) => onHourChange(parseFloat(e.target.value))}
            />
            <div className="hour-display">{formatHour(selectedHour)}</div>
          </div>
        </div>
      </div>
      <SunPosition sunPosition={sunPosition} weatherInfo={weatherInfo} />
      <SunFilter
        activeFilters={sunFilters}
        onChange={onFiltersChange}
        terraceCounts={terraceCounts}
        compact={false}
      />
      <div className="terrace-list">
        {terraces.slice(0, 500).map((terrace, index) => (
          <div
            key={index}
            className={`terrace-card ${selectedTerrace === terrace ? 'active' : ''}`}
            onClick={() => onTerraceClick(terrace)}
          >
            <div className="terrace-name">{terrace.name}</div>
            <div className="terrace-address">
              {terrace.address} {terrace.arrondissement}
            </div>
            <div className="terrace-meta">
              <span className="tag">
                {terrace.longueur}×{terrace.largeur}m
              </span>
              <span className={`sun-badge ${terrace.sunClass}`}>
                {terrace.sunLabel}
              </span>
              {terrace.sunClass === 'sunny' && (() => {
                const until = getSunnyUntil(terrace, selectedDate, selectedHour);
                if (!until) return null;
                const h = Math.floor(until);
                const m = Math.round((until - h) * 60);
                const label = m > 0 ? `jusqu'à ${h}h${String(m).padStart(2,'0')}` : `jusqu'à ${h}h`;
                return <span className="sun-until">☀️ {label}</span>;
              })()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TerraceList;
