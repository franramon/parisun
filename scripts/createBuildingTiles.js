import shapefile from 'shapefile';
import fs from 'fs/promises';
import path from 'path';
import proj4 from 'proj4';

// Lambert 93 to WGS84 conversion
proj4.defs([
  ['EPSG:2154', '+proj=lcc +lat_1=49 +lat_2=44 +lat_0=46.5 +lon_0=3 +x_0=700000 +y_0=6600000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'],
  ['EPSG:4326', '+proj=longlat +datum=WGS84 +no_defs']
]);

const SHAPEFILE_PATH = '../BDTOPO_3-5_TOUSTHEMES_SHP_LAMB93_D075_2025-12-15/BDTOPO/1_DONNEES_LIVRAISON_2025-12-00073/BDT_3-5_SHP_LAMB93_D075_ED2025-12-15/BATI/BATIMENT.shp';
const OUTPUT_DIR = '../public/buildings';

// Paris bounding box (approximate)
const PARIS_BOUNDS = {
  minLng: 2.224,
  maxLng: 2.470,
  minLat: 48.815,
  maxLat: 48.902
};

// Tile size in degrees (smaller = more tiles, faster loading)
const TILE_SIZE = 0.01; // ~1km

/**
 * Get tile key for a coordinate
 */
function getTileKey(lng, lat) {
  const x = Math.floor((lng - PARIS_BOUNDS.minLng) / TILE_SIZE);
  const y = Math.floor((lat - PARIS_BOUNDS.minLat) / TILE_SIZE);
  return `${x}_${y}`;
}

/**
 * Get bounding box for a tile
 */
function getTileBounds(tileKey) {
  const [x, y] = tileKey.split('_').map(Number);
  return {
    minLng: PARIS_BOUNDS.minLng + x * TILE_SIZE,
    maxLng: PARIS_BOUNDS.minLng + (x + 1) * TILE_SIZE,
    minLat: PARIS_BOUNDS.minLat + y * TILE_SIZE,
    maxLat: PARIS_BOUNDS.minLat + (y + 1) * TILE_SIZE
  };
}

async function createBuildingTiles() {
  console.log('🏗️  Creating building tiles from BD TOPO...');

  // Create output directory
  await fs.mkdir(path.resolve(process.cwd(), OUTPUT_DIR), { recursive: true });

  const tiles = new Map();
  let totalCount = 0;
  let processedCount = 0;

  try {
    const source = await shapefile.open(
      path.resolve(process.cwd(), SHAPEFILE_PATH)
    );

    let result = await source.read();

    while (!result.done) {
      const feature = result.value;

      if (feature && feature.geometry && feature.properties) {
        const hauteur = feature.properties.HAUTEUR || feature.properties.hauteur || 0;

        if (hauteur > 0) {
          // Convert geometry from Lambert 93 to WGS84
          let convertedGeometry = { ...feature.geometry };

          if (feature.geometry.type === 'Polygon') {
            convertedGeometry.coordinates = feature.geometry.coordinates.map(ring =>
              ring.map(coord => proj4('EPSG:2154', 'EPSG:4326', coord))
            );
          } else if (feature.geometry.type === 'MultiPolygon') {
            convertedGeometry.coordinates = feature.geometry.coordinates.map(polygon =>
              polygon.map(ring =>
                ring.map(coord => proj4('EPSG:2154', 'EPSG:4326', coord))
              )
            );
          }

          // Get building center/bounds
          const coords = convertedGeometry.coordinates;
          const allCoords =
            convertedGeometry.type === 'Polygon'
              ? coords[0]
              : coords.flatMap(p => p[0]);

          const lngs = allCoords.map(c => c[0]);
          const lats = allCoords.map(c => c[1]);

          const centerLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
          const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;

          // Only include if within Paris bounds
          if (
            centerLng >= PARIS_BOUNDS.minLng &&
            centerLng <= PARIS_BOUNDS.maxLng &&
            centerLat >= PARIS_BOUNDS.minLat &&
            centerLat <= PARIS_BOUNDS.maxLat
          ) {
            const tileKey = getTileKey(centerLng, centerLat);

            if (!tiles.has(tileKey)) {
              tiles.set(tileKey, []);
            }

            tiles.get(tileKey).push({
              type: 'Feature',
              geometry: convertedGeometry,
              properties: {
                height: hauteur
              }
            });

            processedCount++;
          }

          totalCount++;

          if (totalCount % 5000 === 0) {
            console.log(`  Processed ${totalCount} buildings (${processedCount} in Paris)...`);
          }
        }
      }

      result = await source.read();
    }

    console.log(`\n✓ Processed ${totalCount} total buildings`);
    console.log(`✓ Found ${processedCount} buildings in Paris`);
    console.log(`✓ Created ${tiles.size} tiles\n`);

    // Write tiles to disk
    let savedTiles = 0;
    for (const [tileKey, features] of tiles.entries()) {
      const geojson = {
        type: 'FeatureCollection',
        features: features
      };

      const filePath = path.resolve(process.cwd(), OUTPUT_DIR, `${tileKey}.json`);
      await fs.writeFile(filePath, JSON.stringify(geojson));

      savedTiles++;
      if (savedTiles % 10 === 0) {
        console.log(`  Saved ${savedTiles}/${tiles.size} tiles...`);
      }
    }

    // Create tile index
    const tileIndex = {
      bounds: PARIS_BOUNDS,
      tileSize: TILE_SIZE,
      tiles: Array.from(tiles.keys()).map(key => ({
        key,
        bounds: getTileBounds(key),
        count: tiles.get(key).length
      }))
    };

    await fs.writeFile(
      path.resolve(process.cwd(), OUTPUT_DIR, 'index.json'),
      JSON.stringify(tileIndex, null, 2)
    );

    console.log(`\n✓ Saved ${tiles.size} building tiles`);
    console.log(`✓ Created tile index at ${OUTPUT_DIR}/index.json`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

createBuildingTiles();
