/**
 * Utilities for loading and using pre-computed shadow data
 */

let shadowData = null;
let shadowDataPromise = null;

/**
 * Load pre-computed shadow data
 * Uses singleton pattern to load only once
 * @param {Function} onProgress - Optional callback for download progress (0-100)
 * @returns {Promise<Object>} Shadow data structure
 */
export async function loadShadowData(onProgress = null) {
  if (shadowData) {
    return shadowData;
  }

  if (shadowDataPromise) {
    return shadowDataPromise;
  }

  shadowDataPromise = fetch('/shadow-data.json')
    .then(async response => {
      if (!response.ok) {
        throw new Error('Shadow data not found');
      }

      // Track download progress if callback provided
      if (onProgress && response.body) {
        const contentLength = response.headers.get('content-length');
        const total = parseInt(contentLength, 10);
        let loaded = 0;

        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;

          if (total && onProgress) {
            const progress = Math.round((loaded / total) * 100);
            onProgress(progress);
          }
        }

        // Combine chunks and parse
        const blob = new Blob(chunks);
        const text = await blob.text();
        return JSON.parse(text);
      }

      return response.json();
    })
    .then(data => {
      shadowData = data;
      console.log(`✓ Loaded pre-computed shadow data for ${data.terraces.length} terraces`);
      if (onProgress) onProgress(100);
      return data;
    })
    .catch(error => {
      console.warn('Could not load shadow data:', error);
      shadowDataPromise = null;
      return null;
    });

  return shadowDataPromise;
}

/**
 * Get shadow factor for a terrace at given sun position
 * Uses bilinear interpolation between grid points for smooth results
 * @param {number} terraceId - Terrace ID
 * @param {number} azimuth - Sun azimuth in degrees (0-360)
 * @param {number} altitude - Sun altitude in degrees
 * @returns {number|null} Shadow factor (0-1) or null if not available
 */
export function getShadowFactor(terraceId, azimuth, altitude) {
  if (!shadowData) {
    return null;
  }

  // Find terrace data
  const terraceData = shadowData.terraces.find(t => t.id === terraceId);
  if (!terraceData || !terraceData.shadows) {
    // No shadow data (no nearby buildings) - return 1.0 (full sun)
    return 1.0;
  }

  // Handle low altitude - sun is below horizon or very low
  if (altitude <= 0) {
    return 0;
  }

  // Find surrounding grid points for interpolation
  const { azimuths, altitudes } = shadowData;

  // Find azimuth bounds (with wrapping for 0/360)
  const azIdx = findGridIndices(azimuth, azimuths, true);
  const altIdx = findGridIndices(altitude, altitudes, false);

  // Get the 4 corner values
  const shadows = terraceData.shadows;

  // Handle edge cases
  if (altIdx.index1 === null || altIdx.index2 === null) {
    // Altitude outside grid - use nearest
    const altIndex = altitude < altitudes[0] ? 0 : altitudes.length - 1;
    const azIndex = azIdx.index1;
    return shadows[altIndex][azIndex] / 100;
  }

  // Get 4 corner shadow values
  const s11 = shadows[altIdx.index1][azIdx.index1] / 100;
  const s12 = shadows[altIdx.index1][azIdx.index2] / 100;
  const s21 = shadows[altIdx.index2][azIdx.index1] / 100;
  const s22 = shadows[altIdx.index2][azIdx.index2] / 100;

  // Bilinear interpolation
  const tAz = azIdx.fraction;
  const tAlt = altIdx.fraction;

  const s1 = s11 * (1 - tAz) + s12 * tAz;
  const s2 = s21 * (1 - tAz) + s22 * tAz;
  const shadowFactor = s1 * (1 - tAlt) + s2 * tAlt;

  return shadowFactor;
}

/**
 * Find grid indices for interpolation
 * @param {number} value - Value to find
 * @param {Array<number>} grid - Grid values
 * @param {boolean} wrap - Whether to wrap around (for azimuth)
 * @returns {Object} - {index1, index2, fraction}
 */
function findGridIndices(value, grid, wrap) {
  // Find the two surrounding grid points
  let index1 = null;
  let index2 = null;
  let fraction = 0;

  for (let i = 0; i < grid.length - 1; i++) {
    if (value >= grid[i] && value <= grid[i + 1]) {
      index1 = i;
      index2 = i + 1;
      fraction = (value - grid[i]) / (grid[i + 1] - grid[i]);
      break;
    }
  }

  // Handle wrapping for azimuth (0° = 360°)
  if (wrap && index1 === null) {
    if (value > grid[grid.length - 1]) {
      // Between last point and 360°/0°
      index1 = grid.length - 1;
      index2 = 0;
      const range = 360 - grid[grid.length - 1];
      fraction = (value - grid[grid.length - 1]) / range;
    } else if (value < grid[0]) {
      // Between 0° and first point (approaching from 360°)
      index1 = grid.length - 1;
      index2 = 0;
      const range = 360 - grid[grid.length - 1] + grid[0];
      fraction = (360 - grid[grid.length - 1] + value) / range;
    }
  }

  // If still not found, use nearest
  if (index1 === null) {
    if (value < grid[0]) {
      index1 = 0;
      index2 = 0;
      fraction = 0;
    } else {
      index1 = grid.length - 1;
      index2 = grid.length - 1;
      fraction = 0;
    }
  }

  return { index1, index2, fraction };
}

/**
 * Enrich terraces with shadow factors from pre-computed data
 * @param {Array} terraces - Array of terraces
 * @param {Object} sunPosition - Sun position {altitude, azimuth}
 * @returns {Array} - Terraces with shadowFactor added
 */
export function enrichTerracesWithShadows(terraces, sunPosition) {
  if (!shadowData) {
    console.warn('Shadow data not loaded yet');
    return terraces;
  }

  return terraces.map(terrace => {
    const shadowFactor = getShadowFactor(terrace.id, sunPosition.azimuth, sunPosition.altitude);
    return {
      ...terrace,
      shadowFactor
    };
  });
}
