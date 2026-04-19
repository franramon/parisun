/**
 * Shadow calculations using ray tracing from sun to terrace
 * with building obstruction detection
 */

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * @param {Array} point - [lng, lat]
 * @param {Array} polygon - Array of [lng, lat] coordinates
 * @returns {boolean}
 */
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Check if two line segments intersect
 * @param {Array} p1 - Start of first line [x, y]
 * @param {Array} p2 - End of first line [x, y]
 * @param {Array} p3 - Start of second line [x, y]
 * @param {Array} p4 - End of second line [x, y]
 * @returns {boolean}
 */
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

/**
 * Calculate if a ray from sun intersects with a building polygon
 * @param {Array} terracePoint - [lng, lat] of terrace
 * @param {Array} sunVector - [dx, dy] normalized direction from terrace to sun
 * @param {Object} building - Building feature with geometry and height
 * @param {number} sunAltitude - Sun altitude in degrees
 * @returns {boolean} - True if building blocks the sun
 */
function rayIntersectsBuilding(terracePoint, sunVector, building, sunAltitude) {
  if (!building.geometry || sunAltitude <= 0) return false;

  const buildingHeight = building.properties.height || 0;
  if (buildingHeight <= 0) return false;

  // Calculate ray end point (extended far enough)
  const rayLength = 0.01; // ~1km in degrees (approximate)
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
        // Now check if building is tall enough to cast shadow
        // This is a simplified check - in reality we'd need 3D ray tracing

        // Approximate: calculate distance to building
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

/**
 * Create a spatial index for buildings (simple grid-based)
 * @param {Array} buildings - Array of building features
 * @param {number} gridSize - Grid cell size in degrees
 * @returns {Object} - Spatial index
 */
export function createBuildingIndex(buildings, gridSize = 0.01) {
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

  console.log(`✓ Created spatial index with ${index.size} grid cells for ${buildings.length} buildings`);

  return { index, gridSize };
}

/**
 * Get nearby buildings from spatial index
 * @param {Object} spatialIndex - Result from createBuildingIndex
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {number} radius - Search radius in grid cells
 * @returns {Array} - Nearby buildings
 */
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

/**
 * Calculate if a terrace is in shadow
 * @param {Object} terrace - Terrace object with lat, lng
 * @param {Object} sunPosition - Sun position {altitude, azimuth} in degrees
 * @param {Object} buildingIndex - Spatial index from createBuildingIndex
 * @returns {boolean} - True if terrace is in shadow
 */
export function isInShadow(terrace, sunPosition, buildingIndex) {
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

/**
 * Calculate shadow factor (0 = full shadow, 1 = full sun)
 * Takes into account partial shadows, sun altitude, etc.
 * @param {Object} terrace - Terrace object
 * @param {Object} sunPosition - Sun position
 * @param {Object} buildingIndex - Building spatial index
 * @returns {number} - Shadow factor 0-1
 */
export function calculateShadowFactor(terrace, sunPosition, buildingIndex) {
  if (sunPosition.altitude <= 0) return 0;

  const inShadow = isInShadow(terrace, sunPosition, buildingIndex);

  if (!inShadow) {
    return 1.0; // Full sun
  }

  // Partial shadow based on sun altitude
  // Lower sun = deeper shadows
  const altitudeFactor = Math.min(1, sunPosition.altitude / 45);

  return altitudeFactor * 0.3; // In shadow, but not completely dark
}
