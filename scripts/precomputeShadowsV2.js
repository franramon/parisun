/**
 * Script to precompute shadow data for all terraces
 * Uses the SAME shadow calculation logic as the frontend
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// SHADOW CALCULATION FUNCTIONS (COPIED FROM FRONTEND)
// ============================================================================

function lineSegmentsIntersect(p1, p2, p3, p4) {
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const [x3, y3] = p3;
  const [x4, y4] = p4;

  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return false; // Parallel

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

function rayIntersectsBuilding(terracePoint, sunVector, building, sunAltitude) {
  if (!building.geometry || sunAltitude <= 0) return false;

  const buildingHeight = building.properties?.height || 0;
  if (buildingHeight <= 0) return false;

  // Calculate ray end point (extended far enough)
  const rayLength = 0.01; // ~1km in degrees
  const rayEnd = [
    terracePoint[0] + sunVector[0] * rayLength,
    terracePoint[1] + sunVector[1] * rayLength
  ];

  // Check all building polygons
  const coordinates = building.geometry.coordinates;
  const polygons =
    building.geometry.type === 'Polygon' ? [coordinates] : coordinates;

  for (const polygon of polygons) {
    const ring = polygon[0]; // Outer ring

    // Check if ray intersects building footprint
    for (let i = 0; i < ring.length - 1; i++) {
      if (lineSegmentsIntersect(terracePoint, rayEnd, ring[i], ring[i + 1])) {
        // Ray intersects building footprint
        // Calculate distance to building
        const buildingCenter = ring.reduce(
          (acc, coord) => [acc[0] + coord[0], acc[1] + coord[1]],
          [0, 0]
        ).map(v => v / ring.length);

        const dx = buildingCenter[0] - terracePoint[0];
        const dy = buildingCenter[1] - terracePoint[1];
        const distanceDeg = Math.sqrt(dx * dx + dy * dy);
        const distanceMeters = distanceDeg * 111000; // Rough conversion

        // Calculate shadow length based on sun altitude and building height
        const sunAltitudeRad = (sunAltitude * Math.PI) / 180;
        const shadowLength = buildingHeight / Math.tan(sunAltitudeRad);

        // If terrace is within shadow length, it's in shadow
        if (distanceMeters < shadowLength) {
          return true;
        }
      }
    }
  }

  return false;
}

function createBuildingIndex(buildings, gridSize = 0.01) {
  const index = new Map();

  for (const building of buildings) {
    if (!building.geometry) continue;

    // Get building bounding box
    const coords = building.geometry.coordinates;
    const allCoords =
      building.geometry.type === 'Polygon'
        ? coords[0]
        : coords.flatMap(p => p[0]);

    const lngs = allCoords.map(c => c[0]);
    const lats = allCoords.map(c => c[1]);

    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    // Add building to all grid cells it overlaps
    const minGridX = Math.floor(minLng / gridSize);
    const maxGridX = Math.floor(maxLng / gridSize);
    const minGridY = Math.floor(minLat / gridSize);
    const maxGridY = Math.floor(maxLat / gridSize);

    for (let x = minGridX; x <= maxGridX; x++) {
      for (let y = minGridY; y <= maxGridY; y++) {
        const key = `${x},${y}`;
        if (!index.has(key)) {
          index.set(key, []);
        }
        index.get(key).push(building);
      }
    }
  }

  return { index, gridSize };
}

function getNearbyBuildings(spatialIndex, lng, lat, radius = 3) {
  const { index, gridSize } = spatialIndex;
  const buildings = new Set();

  const centerX = Math.floor(lng / gridSize);
  const centerY = Math.floor(lat / gridSize);

  for (let dx = -radius; dx <= radius; dx++) {
    for (let dy = -radius; dy <= radius; dy++) {
      const key = `${centerX + dx},${centerY + dy}`;
      const cellBuildings = index.get(key);
      if (cellBuildings) {
        cellBuildings.forEach(b => buildings.add(b));
      }
    }
  }

  return Array.from(buildings);
}

function isInShadow(terrace, sunPosition, buildingIndex) {
  if (sunPosition.altitude <= 0) return true; // Sun is down

  const terracePoint = [terrace.lng, terrace.lat];

  // Calculate sun direction vector (2D projection)
  const azimuthRad = (sunPosition.azimuth * Math.PI) / 180;
  const sunVector = [
    Math.sin(azimuthRad), // East-West
    Math.cos(azimuthRad) // North-South
  ];

  // Get nearby buildings
  const nearbyBuildings = getNearbyBuildings(
    buildingIndex,
    terrace.lng,
    terrace.lat,
    5 // Search radius
  );

  // Check if any building casts a shadow on this terrace
  for (const building of nearbyBuildings) {
    if (rayIntersectsBuilding(terracePoint, sunVector, building, sunPosition.altitude)) {
      return true;
    }
  }

  return false;
}

function calculateShadowFactor(terrace, sunPosition, buildingIndex) {
  if (sunPosition.altitude <= 0) return 0;

  const inShadow = isInShadow(terrace, sunPosition, buildingIndex);

  if (!inShadow) {
    return 1.0; // Full sun
  }

  // Partial shadow based on sun altitude
  const altitudeFactor = Math.min(1, sunPosition.altitude / 45);

  return altitudeFactor * 0.3; // In shadow, but not completely dark
}

// ============================================================================
// BUILDING LOADING
// ============================================================================

function loadBuildingIndex() {
  const indexPath = path.join(__dirname, '../public/buildings/index.json');
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

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

function getTileKey(lng, lat, index) {
  const { bounds, tileSize } = index;
  const x = Math.floor((lng - bounds.minLng) / tileSize);
  const y = Math.floor((lat - bounds.minLat) / tileSize);
  return `${x}_${y}`;
}

function isValidTile(tileKey, index) {
  return index.tiles.some(t => t.key === tileKey);
}

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

// ============================================================================
// MAIN PRECOMPUTATION
// ============================================================================

async function precomputeAllShadows() {
  console.log('🏗️  Starting shadow precomputation (V2 - with correct algorithm)...\n');

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
          shadows: null
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
          const sunPosition = { azimuth, altitude };
          const shadowFactor = calculateShadowFactor(terrace, sunPosition, spatialIndex);
          // Store as 0-100 integer
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
