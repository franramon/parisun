/**
 * Script to precompute shadow data for all terraces
 * Generates a lookup table: terrace → (azimuth, altitude) → shadowFactor
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import shadow calculation utilities
// We'll need to adapt these for Node.js environment

/**
 * Load building tiles index
 */
function loadBuildingIndex() {
  const indexPath = path.join(__dirname, '../public/buildings/index.json');
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

/**
 * Load a specific building tile
 */
function loadBuildingTile(tileKey) {
  try {
    const tilePath = path.join(__dirname, `../public/buildings/${tileKey}.json`);
    if (!fs.existsSync(tilePath)) {
      return { type: 'FeatureCollection', features: [] };
    }
    return JSON.parse(fs.readFileSync(tilePath, 'utf-8'));
  } catch (error) {
    console.error(`Error loading tile ${tileKey}:`, error.message);
    return { type: 'FeatureCollection', features: [] };
  }
}

/**
 * Get tile key for coordinates
 */
function getTileKey(lng, lat, index) {
  const { bounds, tileSize } = index;
  const x = Math.floor((lng - bounds.minLng) / tileSize);
  const y = Math.floor((lat - bounds.minLat) / tileSize);
  return `${x}_${y}`;
}

/**
 * Check if tile is valid
 */
function isValidTile(tileKey, index) {
  return index.tiles.some(t => t.key === tileKey);
}

/**
 * Load buildings near a terrace
 */
function getBuildingsNear(lng, lat, index, radius = 1) {
  const centerKey = getTileKey(lng, lat, index);
  if (!centerKey) return [];

  const [centerX, centerY] = centerKey.split('_').map(Number);
  const buildings = [];

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const tileKey = `${centerX + dx}_${centerY + dy}`;

      if (isValidTile(tileKey, index)) {
        const tile = loadBuildingTile(tileKey);
        if (tile && tile.features) {
          buildings.push(...tile.features);
        }
      }
    }
  }

  return buildings;
}

/**
 * Create spatial index for buildings (simplified)
 */
function createBuildingIndex(buildings, gridSize = 0.001) {
  const index = new Map();

  for (const building of buildings) {
    if (!building.geometry || !building.geometry.coordinates) continue;

    // Get building bounds
    const coords = building.geometry.coordinates[0];
    if (!coords || coords.length === 0) continue;

    let minLng = Infinity, maxLng = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    for (const coord of coords) {
      const [lng, lat] = coord;
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }

    const height = building.properties?.HAUTEUR || building.properties?.hauteur || 10;

    // Add to grid cells
    const startX = Math.floor(minLng / gridSize);
    const endX = Math.floor(maxLng / gridSize);
    const startY = Math.floor(minLat / gridSize);
    const endY = Math.floor(maxLat / gridSize);

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const key = `${x}_${y}`;
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key).push({
          coords: coords,
          height: height,
          minLat, maxLat, minLng, maxLng
        });
      }
    }
  }

  return { index, gridSize };
}

/**
 * Calculate shadow factor for a terrace at given sun position
 * Simplified ray tracing
 */
function calculateShadowFactor(terrace, sunAzimuth, sunAltitude, buildingIndex) {
  if (sunAltitude <= 0) return 0; // Night

  const { index, gridSize } = buildingIndex;
  const terraceLng = terrace.lng;
  const terraceLat = terrace.lat;

  // Get grid cell
  const cellX = Math.floor(terraceLng / gridSize);
  const cellY = Math.floor(terraceLat / gridSize);

  // Check surrounding cells
  let maxShadow = 0;

  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const key = `${cellX + dx}_${cellY + dy}`;
      const buildings = index.get(key) || [];

      for (const building of buildings) {
        // Simple check: is building in shadow direction?
        const azimuthRad = (sunAzimuth - 180) * Math.PI / 180; // Opposite of sun

        // Building center
        const bldgLng = (building.minLng + building.maxLng) / 2;
        const bldgLat = (building.minLat + building.maxLat) / 2;

        // Vector from terrace to building
        const dLng = bldgLng - terraceLng;
        const dLat = bldgLat - terraceLat;
        const distance = Math.sqrt(dLng * dLng + dLat * dLat);

        if (distance < 0.0001) continue; // Same location

        // Angle from terrace to building
        const angleToBuilding = Math.atan2(dLat, dLng);
        const angleDiff = Math.abs(angleToBuilding - azimuthRad);

        // Is building in shadow direction? (within 30°)
        if (angleDiff < Math.PI / 6 || angleDiff > 2 * Math.PI - Math.PI / 6) {
          // Calculate shadow cast by this building
          const distanceKm = distance * 111; // Rough conversion to km
          const heightKm = building.height / 1000;
          const shadowAngle = Math.atan(heightKm / distanceKm) * 180 / Math.PI;

          if (shadowAngle > sunAltitude * 0.8) {
            // Building blocks sun
            const shadowIntensity = Math.min(1, shadowAngle / sunAltitude);
            maxShadow = Math.max(maxShadow, shadowIntensity);
          }
        }
      }
    }
  }

  return 1 - maxShadow;
}

/**
 * Main precomputation function
 */
async function precomputeAllShadows() {
  console.log('🏗️  Starting shadow precomputation...\n');

  // Load terraces
  console.log('📍 Loading terraces...');
  const terracesPath = path.join(__dirname, '../public/terraces-data.geojson');
  const terracesGeoJSON = JSON.parse(fs.readFileSync(terracesPath, 'utf-8'));

  const terraces = terracesGeoJSON.features.map((feature, index) => {
    const props = feature.properties || {};
    const [lng, lat] = feature.geometry.coordinates;
    return {
      id: index,
      name: props.nom_enseigne || props.nom_commerce || 'Sans nom',
      lng,
      lat
    };
  });

  console.log(`✓ Loaded ${terraces.length} terraces\n`);

  // Load building index
  console.log('🏢 Loading building index...');
  const buildingIndexData = loadBuildingIndex();
  console.log(`✓ Building index loaded (${buildingIndexData.tiles.length} tiles)\n`);

  // Define sun position grid
  // Azimuth: 0-360° every 15° (24 values)
  // Altitude: 5-70° every 5° (14 values)
  const azimuths = [];
  for (let az = 0; az < 360; az += 15) {
    azimuths.push(az);
  }

  const altitudes = [];
  for (let alt = 5; alt <= 70; alt += 5) {
    altitudes.push(alt);
  }

  console.log(`📊 Computing for ${azimuths.length} azimuths × ${altitudes.length} altitudes = ${azimuths.length * altitudes.length} positions\n`);

  // Result structure
  const shadowData = {
    azimuths,
    altitudes,
    terraces: []
  };

  // Process terraces in batches
  const batchSize = 100;

  for (let i = 0; i < terraces.length; i += batchSize) {
    const batch = terraces.slice(i, Math.min(i + batchSize, terraces.length));

    console.log(`Processing terraces ${i + 1}-${Math.min(i + batchSize, terraces.length)} of ${terraces.length}...`);

    for (const terrace of batch) {
      // Load buildings near this terrace
      const buildings = getBuildingsNear(terrace.lng, terrace.lat, buildingIndexData, 1);

      if (buildings.length === 0) {
        // No buildings nearby - always sunny
        shadowData.terraces.push({
          id: terrace.id,
          shadows: null // null means no shadows (always 1.0)
        });
        continue;
      }

      // Create spatial index for these buildings
      const spatialIndex = createBuildingIndex(buildings);

      // Compute shadow factor for each sun position
      const shadows = [];

      for (const altitude of altitudes) {
        const altRow = [];
        for (const azimuth of azimuths) {
          const shadowFactor = calculateShadowFactor(terrace, azimuth, altitude, spatialIndex);
          // Store as 0-100 integer to save space
          altRow.push(Math.round(shadowFactor * 100));
        }
        shadows.push(altRow);
      }

      shadowData.terraces.push({
        id: terrace.id,
        shadows
      });
    }

    // Progress update
    const progress = Math.round((Math.min(i + batchSize, terraces.length) / terraces.length) * 100);
    console.log(`  Progress: ${progress}%`);
  }

  // Save results
  console.log('\n💾 Saving shadow data...');
  const outputPath = path.join(__dirname, '../public/shadow-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(shadowData));

  const fileSizeMB = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
  console.log(`✓ Shadow data saved to shadow-data.json (${fileSizeMB} MB)`);

  console.log('\n✅ Precomputation complete!');
}

// Run
precomputeAllShadows().catch(error => {
  console.error('❌ Error during precomputation:', error);
  process.exit(1);
});
