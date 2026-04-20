import './SunFilter.css';

const FILTER_OPTIONS = [
  { class: 'sunny', label: 'Ensoleillé', icon: '☀️' },
  { class: 'shaded', label: 'Ombragé', icon: '⛱️' }
];

function SunFilter({ activeFilters, onChange, terraceCounts, compact = false }) {
  const toggleFilter = (filterClass) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(filterClass)) {
      newFilters.delete(filterClass);
    } else {
      newFilters.add(filterClass);
    }
    onChange(newFilters);
  };

  const selectAll = () => {
    onChange(new Set(['sunny', 'shaded']));
  };

  const clearAll = () => {
    onChange(new Set());
  };

  const allSelected = activeFilters.size === 2;
  const noneSelected = activeFilters.size === 0;

  if (compact) {
    return (
      <div className="sun-filter compact">
        {FILTER_OPTIONS.map(option => {
          const isActive = activeFilters.has(option.class);
          const count = terraceCounts?.[option.class] || 0;

          return (
            <button
              key={option.class}
              className={`filter-chip ${option.class} ${isActive ? 'active' : ''}`}
              onClick={() => toggleFilter(option.class)}
              title={`${option.label} (${count})`}
            >
              <span className="filter-icon">{option.icon}</span>
              {count > 0 && <span className="filter-count">{count}</span>}
            </button>
          );
        })}
        {!allSelected && (
          <button className="filter-clear" onClick={selectAll} title="Tout afficher">
            ✓
          </button>
        )}
        {!noneSelected && (
          <button className="filter-clear" onClick={clearAll} title="Tout masquer">
            ✕
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="sun-filter detailed">
      <div className="filter-header">
        <h3>Filtre par ensoleillement</h3>
        <div className="filter-actions">
          {!allSelected && (
            <button className="filter-action-button" onClick={selectAll}>
              Tout
            </button>
          )}
          {!noneSelected && (
            <button className="filter-action-button" onClick={clearAll}>
              Aucun
            </button>
          )}
        </div>
      </div>
      <div className="filter-options">
        {FILTER_OPTIONS.map(option => {
          const isActive = activeFilters.has(option.class);
          const count = terraceCounts?.[option.class] || 0;

          return (
            <button
              key={option.class}
              className={`filter-option ${option.class} ${isActive ? 'active' : ''}`}
              onClick={() => toggleFilter(option.class)}
            >
              <span className="filter-icon">{option.icon}</span>
              <span className="filter-label">{option.label}</span>
              <span className="filter-badge">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SunFilter;
