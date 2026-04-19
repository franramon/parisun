import { useState, useEffect, useMemo, useRef } from 'react';
import { loadBuildingIndex, getBuildingsNear } from '../api/buildings';
import { createBuildingIndex, calculateShadowFactor } from '../utils/shadowCalculations';

/**
 * Hook to manage building data and shadow calculations
 * OPTIMISÉ: Charge uniquement les bâtiments pour les 100 premières terrasses
 * @param {Array} terraces - Array of terraces (doit être déjà trié par score!)
 * @param {Object} sunPosition - Sun position {altitude, azimuth}
 * @returns {Object} - Shadow calculation state and functions
 */
export function useBuildingShadows(terraces, sunPosition) {
  const [buildingIndex, setBuildingIndex] = useState(null);
  const [buildingsLoaded, setBuildingsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [processedTerraceIds, setProcessedTerraceIds] = useState(new Set());
  const loadingRef = useRef(false);

  // Load building index on mount (just the index, not the buildings)
  useEffect(() => {
    loadBuildingIndex()
      .then(index => {
        console.log('📍 Building index loaded');
      })
      .catch(error => {
        console.error('Failed to load building index:', error);
      });
  }, []);

  // Load buildings ONLY for top 100 terraces when they change
  useEffect(() => {
    // Prevent concurrent loads
    if (loadingRef.current || !terraces.length) return;

    // Take only first 100 terraces (should already be sorted by score in App.jsx)
    const topTerraces = terraces.slice(0, 100);

    // Check if we need to reload (different terraces or sun position changed significantly)
    const terraceIds = new Set(topTerraces.map(t => `${t.lat.toFixed(4)}_${t.lng.toFixed(4)}`));
    const sunKey = `${Math.floor(sunPosition.altitude / 5)}_${Math.floor(sunPosition.azimuth / 10)}`;

    async function loadBuildings() {
      loadingRef.current = true;
      try {
        setBuildingsLoaded(false);
        setLoadingProgress(0);

        console.log(`🏗️  Loading buildings for ${topTerraces.length} terraces...`);

        // Group terraces by location (0.01° ~ 1km) to reduce tile requests
        const locationGroups = new Map();
        for (const terrace of topTerraces) {
          const key = `${terrace.lng.toFixed(2)}_${terrace.lat.toFixed(2)}`;
          if (!locationGroups.has(key)) {
            locationGroups.set(key, { lng: terrace.lng, lat: terrace.lat });
          }
        }

        console.log(`📍 ${locationGroups.size} unique locations to process`);

        // Load buildings for each location
        const buildingsMap = new Map();
        let loaded = 0;

        for (const coord of locationGroups.values()) {
          const buildings = await getBuildingsNear(coord.lng, coord.lat, 1);

          for (const building of buildings) {
            const id = JSON.stringify(building.geometry.coordinates);
            buildingsMap.set(id, building);
          }

          loaded++;
          setLoadingProgress((loaded / locationGroups.size) * 100);
        }

        // Create spatial index
        const buildingsArray = Array.from(buildingsMap.values());
        const spatialIndex = createBuildingIndex(buildingsArray, 0.001);

        setBuildingIndex(spatialIndex);
        setBuildingsLoaded(true);
        setProcessedTerraceIds(terraceIds);

        console.log(`✓ Loaded ${buildingsArray.length} buildings for shadow calculations`);

      } catch (error) {
        console.error('Error loading buildings:', error);
        setBuildingsLoaded(false);
      } finally {
        loadingRef.current = false;
      }
    }

    loadBuildings();
  }, [terraces, sunPosition.altitude, sunPosition.azimuth]);

  // Calculate shadow factors for ALL terraces, but only those with loaded buildings get accurate data
  const terracesWithShadows = useMemo(() => {
    if (!buildingsLoaded || !buildingIndex || !buildingIndex.index) {
      // No buildings loaded yet - return terraces as-is (will use approximation)
      return terraces;
    }

    // Calculate shadow factor for terraces
    return terraces.map(terrace => {
      const shadowFactor = calculateShadowFactor(terrace, sunPosition, buildingIndex);
      return {
        ...terrace,
        shadowFactor
      };
    });
  }, [terraces, sunPosition, buildingIndex, buildingsLoaded]);

  return {
    terraces: terracesWithShadows,
    buildingsLoaded,
    loadingProgress: Math.round(loadingProgress)
  };
}
