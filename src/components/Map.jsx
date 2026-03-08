import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';

const MAX_MARKERS = 500;

function makeIcons(isNight, isBadWeather) {
  const dull = isNight || isBadWeather;

  const colors = dull
    ? { sunny: '#7B9BAD', shaded: '#5A7280' }
    : { sunny: '#F5A623', shaded: '#7F8C8D' };

  const dot = (color) =>
    `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>`;

  return {
    sunny:   L.divIcon({ className: '', html: dot(colors.sunny),  iconSize: [12, 12], iconAnchor: [6, 6] }),
    shaded:  L.divIcon({ className: '', html: dot(colors.shaded), iconSize: [12, 12], iconAnchor: [6, 6] }),
    default: L.divIcon({ className: '', html: dot('#999'),        iconSize: [12, 12], iconAnchor: [6, 6] }),
  };
}

function Map({ terraces, onTerraceClick, selectedTerrace, onBoundsChange, isNight, isBadWeather, onMapClick }) {
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState(false);
  const userMarkerRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const terracesRef = useRef(terraces);
  const onTerraceClickRef = useRef(onTerraceClick);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const suppressBoundsRef = useRef(false); // prevent re-render loop during setView
  const conditionsRef = useRef({ isNight, isBadWeather });

  // Keep refs in sync to avoid stale closures in event listeners
  useEffect(() => { terracesRef.current = terraces; }, [terraces]);
  useEffect(() => { onTerraceClickRef.current = onTerraceClick; }, [onTerraceClick]);
  useEffect(() => { onBoundsChangeRef.current = onBoundsChange; }, [onBoundsChange]);
  useEffect(() => { conditionsRef.current = { isNight, isBadWeather }; }, [isNight, isBadWeather]);

  const pendingPopupRef = useRef(null); // lat/lng to open popup after next render

  const renderMarkersInView = useCallback((notifyParent = true) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const bounds = map.getBounds();

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Filter terraces in current view
    const inView = terracesRef.current.filter(t =>
      t.lat >= bounds.getSouth() &&
      t.lat <= bounds.getNorth() &&
      t.lng >= bounds.getWest() &&
      t.lng <= bounds.getEast()
    );

    // Notify parent with plain bounds object (not the terrace array) to avoid render loops
    if (notifyParent && !suppressBoundsRef.current && onBoundsChangeRef.current) {
      onBoundsChangeRef.current({
        south: bounds.getSouth(),
        north: bounds.getNorth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
      });
    }

    // Cap at MAX_MARKERS for performance (already sorted by score desc)
    const toRender = inView.slice(0, MAX_MARKERS);
    const icons = makeIcons(conditionsRef.current.isNight, conditionsRef.current.isBadWeather);

    toRender.forEach(terrace => {
      const marker = L.marker([terrace.lat, terrace.lng], {
        icon: icons[terrace.sunClass] || icons.default
      })
        .bindPopup(
          `<div class="popup-name">${escapeHtml(terrace.name)}</div>
           <div class="popup-addr">${escapeHtml(terrace.address)} ${escapeHtml(terrace.arrondissement)}</div>
           <div class="popup-type">${escapeHtml(terrace.typologie)}</div>
           <div style="margin-top:4px;font-size:12px">${terrace.longueur}m × ${terrace.largeur}m — <strong>${terrace.sunLabel}</strong></div>`
        )
        .addTo(map);

      marker.on('click', () => onTerraceClickRef.current(terrace));
      markersRef.current.push(marker);
    });

    // Open popup if one was requested (after markers were recreated)
    if (pendingPopupRef.current) {
      const { lat, lng } = pendingPopupRef.current;
      pendingPopupRef.current = null;
      const marker = markersRef.current.find(m => {
        const ll = m.getLatLng();
        return ll.lat === lat && ll.lng === lng;
      });
      if (marker && marker._map) marker.openPopup();
    }
  }, []);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const parisBounds = L.latLngBounds(
      L.latLng(48.815, 2.224),
      L.latLng(48.902, 2.470)
    );

    const map = L.map(mapRef.current, {
      zoomControl: false,
      minZoom: 12,
      maxZoom: 21,
      maxBounds: parisBounds,
      maxBoundsViscosity: 1.0,
    }).setView([48.8566, 2.3522], 13);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM &amp; CARTO',
      maxZoom: 21,
      maxNativeZoom: 19,
    }).addTo(map);

    map.on('moveend zoomend', () => renderMarkersInView(true));
    map.on('click', () => { if (onMapClick) onMapClick(); });

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [renderMarkersInView]);

  // Re-render markers when terraces or weather conditions change
  useEffect(() => {
    renderMarkersInView(false);
  }, [terraces, isNight, isBadWeather, renderMarkersInView]);

  // Handle selected terrace
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedTerrace) return;

    const map = mapInstanceRef.current;

    // Schedule popup to open after markers are recreated by moveend
    pendingPopupRef.current = { lat: selectedTerrace.lat, lng: selectedTerrace.lng };

    // Suppress bounds callback during programmatic navigation
    suppressBoundsRef.current = true;
    const targetZoom = Math.max(map.getZoom(), 17);
    map.setView([selectedTerrace.lat, selectedTerrace.lng], targetZoom);
    setTimeout(() => { suppressBoundsRef.current = false; }, 500);

  }, [selectedTerrace]);

  const handleLocate = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    setLocError(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        if (!map) return;

        // Remove previous user marker
        if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);

        const dot = L.divIcon({
          className: '',
          html: `<div style="width:14px;height:14px;border-radius:50%;background:#4A90D9;border:2px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.3)"></div>`,
          iconSize: [14, 14], iconAnchor: [7, 7],
        });
        userMarkerRef.current = L.marker([latitude, longitude], { icon: dot })
          .bindPopup('<div class="popup-name">Vous êtes ici</div>')
          .addTo(map);

        map.setView([latitude, longitude], 16);
        setLocating(false);
      },
      () => { setLocating(false); setLocError(true); setTimeout(() => setLocError(false), 3000); },
      { timeout: 8000 }
    );
  };

  return (
    <div style={{ position: 'relative', flex: 1, height: '100%' }}>
      <div ref={mapRef} className="map"></div>
      <button className="locate-btn" onClick={handleLocate} title="Autour de moi">
        {locating ? '⏳' : locError ? '✕' : '📍'}
      </button>
    </div>
  );
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

export default Map;
