/**
 * API for loading building data tiles
 */

let buildingIndex = null;
const loadedTiles = new Map();

/**
 * Load building tile index
 * @returns {Promise<Object>} - Tile index
 */
export async function loadBuildingIndex() {
  if (buildingIndex) return buildingIndex;

  try {
    const response = await fetch('/buildings/index.json');
    if (!response.ok) {
      throw new Error('Failed to load building index');
    }

    buildingIndex = await response.json();
    console.log(`✓ Loaded building index: ${buildingIndex.tiles.length} tiles available`);

    return buildingIndex;
  } catch (error) {
    console.error('Error loading building index:', error);
    // Return empty index if buildings not available
    return { bounds: {}, tileSize: 0.01, tiles: [] };
  }
}

/**
 * Get tile key for a coordinate
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {Object} index - Building index
 * @returns {string} - Tile key
 */
function getTileKey(lng, lat, index) {
  if (!index || !index.bounds) return null;

  const { bounds, tileSize } = index;
  const x = Math.floor((lng - bounds.minLng) / tileSize);
  const y = Math.floor((lat - bounds.minLat) / tileSize);

  return `${x}_${y}`;
}

/**
 * Load a specific building tile
 * @param {string} tileKey - Tile identifier
 * @returns {Promise<Object>} - GeoJSON FeatureCollection
 */
async function loadTile(tileKey) {
  if (loadedTiles.has(tileKey)) {
    return loadedTiles.get(tileKey);
  }

  try {
    const response = await fetch(`/buildings/${tileKey}.json`);
    if (!response.ok) {
      console.warn(`Tile ${tileKey} not found`);
      return { type: 'FeatureCollection', features: [] };
    }

    const data = await response.json();
    loadedTiles.set(tileKey, data);

    return data;
  } catch (error) {
    console.error(`Error loading tile ${tileKey}:`, error);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Check if a tile key is valid (exists in the index)
 * @param {string} tileKey - Tile key to check
 * @param {Object} index - Building index
 * @returns {boolean} - True if tile exists
 */
function isValidTile(tileKey, index) {
  if (!index || !index.tiles) return false;
  return index.tiles.some(t => t.key === tileKey);
}

/**
 * Get buildings near a point
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {number} radius - Search radius in tiles
 * @returns {Promise<Array>} - Array of building features
 */
export async function getBuildingsNear(lng, lat, radius = 2) {
  const index = await loadBuildingIndex();
  if (!index || !index.bounds) return [];

  const centerKey = getTileKey(lng, lat, index);
  if (!centerKey) return [];

  const [centerX, centerY] = centerKey.split('_').map(Number);
  const buildings = [];

  // Load tiles in radius - only if they exist in the index
  const tilePromises = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const tileKey = `${centerX + dx}_${centerY + dy}`;

      // Only load if tile exists in index
      if (isValidTile(tileKey, index)) {
        tilePromises.push(loadTile(tileKey));
      }
    }
  }

  const tiles = await Promise.all(tilePromises);

  for (const tile of tiles) {
    if (tile && tile.features) {
      buildings.push(...tile.features);
    }
  }

  return buildings;
}

/**
 * Preload tiles for an array of terraces
 * @param {Array} terraces - Array of terrace objects with lat/lng
 * @returns {Promise<void>}
 */
export async function preloadTilesForTerraces(terraces) {
  const index = await loadBuildingIndex();
  if (!index || !index.bounds) return;

  // Get unique tile keys for all terraces
  const tileKeys = new Set();
  for (const terrace of terraces) {
    const key = getTileKey(terrace.lng, terrace.lat, index);
    if (key) {
      tileKeys.add(key);

      // Also add adjacent tiles
      const [x, y] = key.split('_').map(Number);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          tileKeys.add(`${x + dx}_${y + dy}`);
        }
      }
    }
  }

  console.log(`Preloading ${tileKeys.size} building tiles...`);

  // Load tiles in batches
  const batchSize = 20;
  const keys = Array.from(tileKeys);

  for (let i = 0; i < keys.length; i += batchSize) {
    const batch = keys.slice(i, i + batchSize);
    await Promise.all(batch.map(key => loadTile(key)));

    if ((i + batchSize) % 100 === 0) {
      console.log(`  Loaded ${Math.min(i + batchSize, keys.length)}/${keys.length} tiles`);
    }
  }

  console.log(`✓ Preloaded ${tileKeys.size} building tiles`);
}
