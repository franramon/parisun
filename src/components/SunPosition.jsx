import './SunPosition.css';

function SunPosition({ sunPosition, weatherInfo }) {
  const { azimuth, altitude } = sunPosition;
  const isNight = altitude <= 0;
  const isSunny = !isNight && (weatherInfo ? weatherInfo.sunny : true);
  const isBad = !isNight && weatherInfo && !weatherInfo.sunny;

  // Sky dome: altitude 0° at edge, 90° at center
  const displayAltitude = Math.max(0, Math.min(90, altitude));
  const radius = 45 - (displayAltitude / 90) * 45;
  const angleRad = ((azimuth - 90) * Math.PI) / 180;
  const sunX = 50 + radius * Math.cos(angleRad);
  const sunY = 50 + radius * Math.sin(angleRad);

  // Theme
  let theme = 'sunny';
  if (isNight) theme = 'night';
  else if (isBad) theme = 'bad';

  const themes = {
    sunny: {
      bg: 'linear-gradient(to bottom, #5BB8F5 0%, #C8EAFF 100%)',
      circle: '#3498db',
      cardinalFill: '#1a4a6e',
      sunFill: '#FFD700',
      sunStroke: '#FF8C00',
      rayStroke: '#FFD700',
      borderTop: 'rgba(52,152,219,0.2)',
    },
    bad: {
      bg: 'linear-gradient(to bottom, #8E9EAB 0%, #C8D6DF 100%)',
      circle: '#607D8B',
      cardinalFill: '#37474F',
      sunFill: '#B0BEC5',
      sunStroke: '#78909C',
      rayStroke: '#90A4AE',
      borderTop: 'rgba(96,125,139,0.2)',
    },
    night: {
      bg: 'linear-gradient(to bottom, #0d1b2a 0%, #1a2e45 100%)',
      circle: '#2c4a6e',
      cardinalFill: '#7fa8cc',
      sunFill: '#C8D8E8',
      sunStroke: '#9BB8D4',
      rayStroke: '#7fa8cc',
      borderTop: 'rgba(100,140,180,0.2)',
    },
  };

  const t = themes[theme];

  // Status label
  let statusLabel;
  if (isNight) statusLabel = 'Soleil couché';
  else if (isBad) statusLabel = weatherInfo.label;
  else statusLabel = 'Soleil levé';

  // Status icon
  let statusIcon;
  if (isNight) statusIcon = '🌙';
  else if (isBad) statusIcon = weatherInfo.icon;
  else statusIcon = '☀️';

  // Weather detail line (temp if available)
  const weatherDetail = weatherInfo
    ? `${weatherInfo.label} · ${Math.round(weatherInfo.temperature)}°C`
    : null;

  return (
    <div className={`sun-position theme-${theme}`} style={{ background: t.bg }}>
      <div className="sun-position-header">
        <span className="sun-icon">{statusIcon}</span>
        <div className="sun-status-block">
          <span className="sun-status">{statusLabel}</span>
          {weatherDetail && <span className="sun-weather-detail">{weatherDetail}</span>}
        </div>
      </div>

      {/* Sky dome */}
      <div className="sun-dome">
        <svg viewBox="0 0 100 100" className="dome-svg">
          {/* Rain animation for bad weather */}
          {isBad && (
            <g className="rain-group">
              {[12, 28, 44, 60, 76, 20, 36, 52, 68, 84].map((x, i) => (
                <line
                  key={i}
                  x1={x} y1={10 + (i % 3) * 8}
                  x2={x - 3} y2={22 + (i % 3) * 8}
                  stroke="rgba(100,160,210,0.5)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  className="raindrop"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </g>
          )}

          <circle cx="50" cy="50" r="45"
            fill="rgba(255,255,255,0.15)"
            stroke={t.circle} strokeWidth="1.5" />
          <circle cx="50" cy="50" r="30"
            fill="none" stroke={t.circle} strokeWidth="0.5" opacity="0.3" />
          <circle cx="50" cy="50" r="15"
            fill="none" stroke={t.circle} strokeWidth="0.5" opacity="0.3" />

          <text x="50" y="8"  textAnchor="middle" fontSize="8" fontWeight="bold" fill={t.cardinalFill}>N</text>
          <text x="92" y="53" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t.cardinalFill}>E</text>
          <text x="50" y="97" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t.cardinalFill}>S</text>
          <text x="8"  y="53" textAnchor="middle" fontSize="8" fontWeight="bold" fill={t.cardinalFill}>O</text>

          {!isNight && (
            <>
              <line x1="50" y1="50" x2={sunX} y2={sunY}
                stroke={t.rayStroke} strokeWidth="1"
                strokeDasharray="2,2" opacity="0.5" />
              <circle cx={sunX} cy={sunY} r="5"
                fill={t.sunFill} stroke={t.sunStroke} strokeWidth="1"
                className={isSunny ? 'sun-dot-glow' : 'sun-dot-muted'} />
            </>
          )}

          {isNight && (
            /* Moon crescent */
            <>
              <circle cx={sunX} cy={sunY} r="5" fill="#C8D8E8" />
              <circle cx={sunX + 3} cy={sunY - 1} r="4" fill={t.bg.includes('0d1b') ? '#0d1b2a' : '#1a2e45'} />
            </>
          )}
        </svg>
      </div>

      <div className="sun-details" style={{ borderTopColor: t.borderTop }}>
        <div className="sun-detail-item">
          <span className="detail-label" style={{ color: isNight ? '#7fa8cc' : isBad ? '#546E7A' : '#555' }}>
            Direction
          </span>
          <span className="detail-value" style={{ color: isNight ? '#C8D8E8' : isBad ? '#37474F' : '#2c3e50' }}>
            {getDirection(azimuth)}
          </span>
        </div>
        <div className="sun-detail-item">
          <span className="detail-label" style={{ color: isNight ? '#7fa8cc' : isBad ? '#546E7A' : '#555' }}>
            Hauteur
          </span>
          <span className="detail-value" style={{ color: isNight ? '#C8D8E8' : isBad ? '#37474F' : '#2c3e50' }}>
            {isNight ? '—' : `${altitude.toFixed(0)}°`}
          </span>
        </div>
      </div>
    </div>
  );
}

function getDirection(az) {
  if (az >= 337.5 || az < 22.5)  return 'Nord';
  if (az < 67.5)  return 'Nord-Est';
  if (az < 112.5) return 'Est';
  if (az < 157.5) return 'Sud-Est';
  if (az < 202.5) return 'Sud';
  if (az < 247.5) return 'Sud-Ouest';
  if (az < 292.5) return 'Ouest';
  return 'Nord-Ouest';
}

export default SunPosition;
