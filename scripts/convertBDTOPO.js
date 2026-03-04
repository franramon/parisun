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
const OUTPUT_PATH = '../public/buildings.geojson';

async function convertShapefile() {
  console.log('🏗️  Converting BD TOPO shapefile to GeoJSON...');

  const features = [];
  let count = 0;

  try {
    const source = await shapefile.open(
      path.resolve(process.cwd(), SHAPEFILE_PATH)
    );

    let result = await source.read();

    while (!result.done) {
      const feature = result.value;

      // Extract relevant building data
      if (feature && feature.geometry && feature.properties) {
        // Keep only buildings with height information
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

          features.push({
            type: 'Feature',
            geometry: convertedGeometry,
            properties: {
              height: hauteur,
              nature: feature.properties.NATURE || feature.properties.nature,
              usage1: feature.properties.USAGE1 || feature.properties.usage1
            }
          });

          count++;

          if (count % 1000 === 0) {
            console.log(`  Processed ${count} buildings...`);
          }
        }
      }

      result = await source.read();
    }

    console.log(`✓ Processed ${count} buildings with height data`);

    // Create GeoJSON
    const geojson = {
      type: 'FeatureCollection',
      features: features
    };

    // Write to file
    const outputFile = path.resolve(process.cwd(), OUTPUT_PATH);
    await fs.writeFile(outputFile, JSON.stringify(geojson));

    const stats = await fs.stat(outputFile);
    console.log(`✓ Saved to ${OUTPUT_PATH} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  }
}

convertShapefile();
