import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';

function Map({ terraces, onTerraceClick, selectedTerrace }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView([48.8566, 2.3522], 13);

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OSM &amp; CARTO',
      maxZoom: 19
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update markers when terraces change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current;

    // Clear existing markers
    markersRef.current.forEach(marker => map.removeLayer(marker));
    markersRef.current = [];

    // Create icon based on sun class
    const makeIcon = (sunClass) => {
      const colors = {
        sunny: '#F5A623',  // Orange/jaune pour ensoleillé
        shaded: '#7F8C8D'  // Gris pour ombragé
      };
      const color = colors[sunClass] || '#999';

      return L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2)"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });
    };

    // Add markers for visible terraces (limit to first 1000 for performance)
    const visibleTerraces = terraces.slice(0, 1000);

    visibleTerraces.forEach(terrace => {
      const marker = L.marker([terrace.lat, terrace.lng], {
        icon: makeIcon(terrace.sunClass)
      })
        .bindPopup(
          `<div class="popup-name">${escapeHtml(terrace.name)}</div>
           <div class="popup-addr">${escapeHtml(terrace.address)} ${escapeHtml(terrace.arrondissement)}</div>
           <div class="popup-type">${escapeHtml(terrace.typologie)}</div>
           <div style="margin-top:4px;font-size:12px">${terrace.longueur}m × ${terrace.largeur}m — <strong>${terrace.sunLabel}</strong></div>`
        )
        .addTo(map);

      marker.on('click', () => {
        onTerraceClick(terrace);
      });

      markersRef.current.push(marker);
    });

  }, [terraces, onTerraceClick]);

  // Handle selected terrace
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedTerrace) return;

    const map = mapInstanceRef.current;
    map.setView([selectedTerrace.lat, selectedTerrace.lng], 17);

    // Find and open popup for selected marker
    const marker = markersRef.current.find(m => {
      const latlng = m.getLatLng();
      return latlng.lat === selectedTerrace.lat && latlng.lng === selectedTerrace.lng;
    });

    if (marker) {
      marker.openPopup();
    }

  }, [selectedTerrace]);

  return <div ref={mapRef} className="map"></div>;
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
