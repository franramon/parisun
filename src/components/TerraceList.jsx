import SunFilter from './SunFilter';
import SunPosition from './SunPosition';
import './TerraceList.css';

function TerraceList({ terraces, onTerraceClick, selectedTerrace, loading, loadingProgress, loadingStage, sunFilters, onFiltersChange, terraceCounts, sunPosition }) {
  if (loading) {
    const percentage = typeof loadingProgress === 'number'
      ? loadingProgress
      : (loadingProgress?.total ? Math.round((loadingProgress.loaded / loadingProgress.total) * 100) : 0);

    return (
      <div className="sidebar">
        <div className="sidebar-header">
          <h2>Terrasses</h2>
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

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Terrasses</h2>
        <span>{terraces.length} terrasses</span>
      </div>
      <SunPosition sunPosition={sunPosition} />
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
              <span>{shortType(terrace.typologie)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TerraceList;
