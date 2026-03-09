import SunCalc from 'suncalc';
import { getShadowFactor } from './precomputedShadows';

const PARIS_LAT = 48.8566;
const PARIS_LNG = 2.3522;

/**
 * Find until what hour a terrace stays sunny on a given date
 * Returns null if already shaded, or the hour (e.g. 17.5 = 17h30)
 */
/**
 * Returns { until: hour|null, sunset: hour|null }
 * until  = hour when terrace becomes shaded (null = stays sunny until sunset/22h)
 * sunset = hour of sunset (null if after 22h)
 */
export function getSunnyUntil(terrace, selectedDate, fromHour) {
  if (terrace.shadowFactor === undefined) return { until: null, sunset: null };

  let sunsetHour = null;

  for (let h = fromHour; h <= 22; h += 0.25) {
    const hour = Math.floor(h);
    const min = Math.round((h - hour) * 60);
    const dt = new Date(`${selectedDate}T${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}:00`);
    const pos = getSolarPosition(dt, PARIS_LAT, PARIS_LNG);

    if (pos.altitude <= 0) {
      sunsetHour = h;
      break;
    }

    const sf = getShadowFactor(terrace.id, pos.azimuth, pos.altitude);
    if (sf < 0.5) {
      const prev = h - 0.25;
      return { until: prev <= fromHour ? null : prev, sunset: null };
    }
  }

  return { until: null, sunset: sunsetHour };
}

/**
 * Get solar position for a given date, time, and location
 * @param {Date} date - The date and time
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} - Solar position with altitude and azimuth in degrees
 */
export function getSolarPosition(date, lat, lng) {
  const position = SunCalc.getPosition(date, lat, lng);

  return {
    altitude: position.altitude * (180 / Math.PI), // Convert from radians to degrees
    azimuth: ((position.azimuth * (180 / Math.PI)) + 180) % 360 // Convert and normalize to 0-360
  };
}

/**
 * Get sun times (sunrise, sunset, etc.) for a given date and location
 * @param {Date} date - The date
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} - Sun times
 */
export function getSunTimes(date, lat, lng) {
  return SunCalc.getTimes(date, lat, lng);
}

/**
 * Calculate sun exposure score based on sun position, weather, terrace type, and building shadows
 * @param {Object} sun - Solar position {altitude, azimuth}
 * @param {Object} terrace - Terrace data with optional shadowFactor
 * @param {number} weatherFactor - Weather factor (0-1, where 1 is clear sky)
 * @returns {Object} - Score, label, and class
 */
export function calculateSunScore(sun, terrace, weatherFactor = 0.8) {
  // Night time
  if (sun.altitude <= 0) {
    return { score: 0, label: 'Nuit', class: 'none' };
  }

  // Base score from sun altitude (0° to 90°)
  // Use a more generous scale for better distribution
  let score = Math.min(1, sun.altitude / 50); // Normalized to 50° instead of 60°

  // Bonus for high sun (more direct sunlight)
  if (sun.altitude > 50) {
    score = Math.min(1, score + 0.1);
  } else if (sun.altitude > 35) {
    score = Math.min(1, score + 0.05);
  }

  // Apply weather factor
  score *= weatherFactor;

  // Apply building shadow factor (from ray tracing if available)
  if (terrace.shadowFactor !== undefined) {
    // shadowFactor comes from ray-tracing with real building data
    // It's already a value between 0 and 1
    score *= terrace.shadowFactor;
  } else {
    // Fallback: simulate urban environment with simple approximation
    const locationSeed = Math.abs(Math.sin((terrace.lat || 0) * 1000 + (terrace.lng || 0) * 1000));

    // Lower altitude = more shadows from buildings
    if (sun.altitude < 30) {
      // Low sun: more shadows (50-90% of light)
      score *= (0.5 + locationSeed * 0.4);
    } else if (sun.altitude < 50) {
      // Medium sun: some shadows (70-95% of light)
      score *= (0.7 + locationSeed * 0.25);
    } else {
      // High sun: minimal shadows (85-100% of light)
      score *= (0.85 + locationSeed * 0.15);
    }
  }

  // Clamp score
  score = Math.min(1, Math.max(0, score));

  // Determine label and class based on shadow factor (building shadow),
  // not the combined score (which also depends on sun altitude).
  // shadowFactor=1 means no building shadow, shadowFactor=0 means full shadow.
  let label, className;
  const shadowFactor = terrace.shadowFactor !== undefined ? terrace.shadowFactor : 1.0;
  if (shadowFactor >= 0.5) {
    label = 'Ensoleillé';
    className = 'sunny';
  } else {
    label = 'Ombragé';
    className = 'shaded';
  }

  return { score, label, class: className };
}
