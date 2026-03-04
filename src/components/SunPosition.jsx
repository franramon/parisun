import './SunPosition.css';

/**
 * Visual representation of sun position
 * Shows azimuth (compass direction) and altitude (height in sky)
 */
function SunPosition({ sunPosition }) {
  const { azimuth, altitude } = sunPosition;

  // Calculate sun position on the sky dome
  // Azimuth: 0° = North, 90° = East, 180° = South, 270° = West
  // Altitude: 0° = horizon, 90° = zenith

  const isNight = altitude <= 0;
  const displayAltitude = Math.max(0, Math.min(90, altitude));

  // Convert to polar coordinates for display
  // We want altitude 0° at edge, 90° at center
  const radius = 45 - (displayAltitude / 90) * 45; // 45px max radius
  const angleRad = ((azimuth - 90) * Math.PI) / 180; // -90 to start from top

  const sunX = 50 + radius * Math.cos(angleRad);
  const sunY = 50 + radius * Math.sin(angleRad);

  // Direction labels
  const getDirection = (az) => {
    if (az >= 337.5 || az < 22.5) return 'N';
    if (az >= 22.5 && az < 67.5) return 'NE';
    if (az >= 67.5 && az < 112.5) return 'E';
    if (az >= 112.5 && az < 157.5) return 'SE';
    if (az >= 157.5 && az < 202.5) return 'S';
    if (az >= 202.5 && az < 247.5) return 'SO';
    if (az >= 247.5 && az < 292.5) return 'O';
    return 'NO';
  };

  return (
    <div className="sun-position">
      <div className="sun-position-header">
        <span className="sun-icon">{isNight ? '🌙' : '☀️'}</span>
        <span className="sun-status">
          {isNight ? 'Soleil couché' : 'Soleil visible'}
        </span>
      </div>

      {!isNight && (
        <>
          {/* Sky dome visualization */}
          <div className="sun-dome">
            <svg viewBox="0 0 100 100" className="dome-svg">
              {/* Horizon circle */}
              <circle cx="50" cy="50" r="45" className="horizon-circle" />

              {/* Altitude circles */}
              <circle cx="50" cy="50" r="30" className="altitude-circle" opacity="0.3" />
              <circle cx="50" cy="50" r="15" className="altitude-circle" opacity="0.3" />

              {/* Cardinal directions */}
              <text x="50" y="8" textAnchor="middle" className="cardinal-label">N</text>
              <text x="92" y="53" textAnchor="middle" className="cardinal-label">E</text>
              <text x="50" y="97" textAnchor="middle" className="cardinal-label">S</text>
              <text x="8" y="53" textAnchor="middle" className="cardinal-label">O</text>

              {/* Sun position */}
              <circle
                cx={sunX}
                cy={sunY}
                r="4"
                className="sun-dot"
                fill="#FFD700"
                stroke="#FF8C00"
                strokeWidth="1"
              />

              {/* Line from center to sun */}
              <line
                x1="50"
                y1="50"
                x2={sunX}
                y2={sunY}
                className="sun-ray"
                stroke="#FFD700"
                strokeWidth="1"
                strokeDasharray="2,2"
                opacity="0.5"
              />
            </svg>
          </div>

          {/* Detailed info */}
          <div className="sun-details">
            <div className="sun-detail-item">
              <span className="detail-label">Azimut</span>
              <span className="detail-value">{azimuth.toFixed(0)}° ({getDirection(azimuth)})</span>
            </div>
            <div className="sun-detail-item">
              <span className="detail-label">Altitude</span>
              <span className="detail-value">{altitude.toFixed(1)}°</span>
            </div>
          </div>
        </>
      )}

      {isNight && (
        <div className="sun-details night">
          <p>Le soleil est sous l'horizon</p>
        </div>
      )}
    </div>
  );
}

export default SunPosition;
