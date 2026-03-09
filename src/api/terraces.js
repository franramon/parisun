const API_BASE_URL = 'https://opendata.paris.fr/api/explore/v2.1/catalog/datasets/terrasses-autorisations/records';

/**
 * Load terraces from local GeoJSON file
 * This bypasses the API 10,000 limit and loads all 24k+ terraces instantly
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<Array>} - Array of terrace objects
 */
export async function loadLocalTerraces(onProgress = null) {
  try {
    console.log('📂 Loading terraces from local file...');

    const response = await fetch('/terraces-data.geojson');
    if (!response.ok) {
      throw new Error(`Failed to load local data: ${response.status}`);
    }

    const geojson = await response.json();

    if (!geojson || !geojson.features) {
      throw new Error('Invalid GeoJSON format');
    }

    const terraces = [];
    for (let index = 0; index < geojson.features.length; index++) {
      const feature = geojson.features[index];
      if (!feature.geometry || !feature.geometry.coordinates) continue;

      const props = feature.properties || {};
      const [lng, lat] = feature.geometry.coordinates;

      // Keep only actual terraces (must contain "terrasse")
      const typologie = props.typologie || '';
      const typLower = typologie.toLowerCase();
      if (!typLower.includes('terrasse')) continue;

      terraces.push({
        id: index, // GeoJSON feature index = shadow data id
        name: props.nom_enseigne || props.nom_commerce || 'Sans nom',
        address: props.adresse || '',
        arrondissement: props.arrondissement || '',
        typologie: typologie,
        longueur: props.longueur || 0,
        largeur: props.largeur || 0,
        lat,
        lng
      });

      // Update progress every 1000 terraces
      if (onProgress && terraces.length % 1000 === 0) {
        onProgress({
          loaded: terraces.length,
          total: geojson.features.length
        });
      }
    }

    // Final progress update
    if (onProgress) {
      onProgress({
        loaded: terraces.length,
        total: terraces.length
      });
    }

    console.log(`✓ Loaded ${terraces.length} terraces from local file`);
    return terraces;

  } catch (error) {
    console.error('Error loading local terraces:', error);
    throw error;
  }
}

/**
 * Fetch a single batch of terraces from API
 * @param {number} offset - Starting offset
 * @param {number} limit - Number of records to fetch
 * @returns {Promise<Object>} - Response data
 */
async function fetchBatch(offset, limit) {
  const url = `${API_BASE_URL}?limit=${limit}&offset=${offset}&select=nom_enseigne,adresse,arrondissement,typologie,longueur,largeur,geo_point_2d`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Process raw API records into terrace objects
 * @param {Array} records - Raw API records
 * @returns {Array} - Processed terrace objects
 */
function processRecords(records) {
  const terraces = [];
  for (const record of records) {
    if (!record.geo_point_2d) continue;

    // Filter out closed terraces (fermée)
    const typologie = record.typologie || '';
    if (typologie.toLowerCase().includes('fermée') || typologie.toLowerCase().includes('fermee')) {
      continue;
    }

    terraces.push({
      name: record.nom_enseigne || 'Sans nom',
      address: record.adresse || '',
      arrondissement: record.arrondissement || '',
      typologie: typologie,
      longueur: record.longueur || 0,
      largeur: record.largeur || 0,
      lat: record.geo_point_2d.lat,
      lng: record.geo_point_2d.lon
    });
  }
  return terraces;
}

/**
 * Fetch all terraces from OpenData Paris API with parallel requests
 * API limit is 100 per request, so we use parallel batches for speed
 * @param {Function} onProgress - Callback for progress updates
 * @returns {Promise<Array>} - Array of terrace objects
 */
export async function fetchAllTerraces(onProgress = null) {
  const limit = 100; // API maximum per request
  const maxTotal = 10000; // API maximum total results
  const parallelRequests = 10; // Fetch 10 batches in parallel = 1000 per round

  try {
    // First request to get total count
    const firstBatch = await fetchBatch(0, limit);
    const totalCount = Math.min(firstBatch.total_count || 0, maxTotal);

    console.log(`📊 Total terraces available: ${firstBatch.total_count || 0} (loading ${totalCount} max due to API limit)`);

    let allTerraces = processRecords(firstBatch.results || []);

    if (onProgress) {
      onProgress({
        loaded: allTerraces.length,
        total: totalCount
      });
    }

    // Calculate remaining batches
    let offset = limit;

    while (offset < totalCount) {
      // Create parallel batch requests
      const batchPromises = [];
      for (let i = 0; i < parallelRequests && offset < totalCount; i++) {
        batchPromises.push(fetchBatch(offset, limit));
        offset += limit;
      }

      // Wait for all parallel requests to complete
      const results = await Promise.allSettled(batchPromises);

      // Process successful results
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.results) {
          const terraces = processRecords(result.value.results);
          allTerraces.push(...terraces);
        } else if (result.status === 'rejected') {
          console.error('Batch fetch failed:', result.reason);
        }
      }

      // Update progress
      if (onProgress) {
        onProgress({
          loaded: allTerraces.length,
          total: totalCount
        });
      }

      console.log(`📍 Loaded ${allTerraces.length} / ${totalCount} terraces`);
    }

    console.log(`✓ Successfully loaded ${allTerraces.length} terraces`);
    return allTerraces;

  } catch (error) {
    console.error('Error fetching terraces:', error);
    throw error;
  }
}
