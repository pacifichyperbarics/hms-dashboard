window.HMSMap = (() => {
  let map = null;
  let layer = null;
  const markers = new Map();

  function color(clinic) {
    if (clinic.category !== 'Buildout') return '#23835b';
    return clinic.indicator === 'red' ? '#b6404b' : '#a66a13';
  }

  function destroy() {
    if (map) map.remove();
    map = null;
    layer = null;
    markers.clear();
  }

  function fit(clinics) {
    if (!map || !clinics.length) return;
    map.fitBounds(clinics.map(c => [c.lat, c.lng]), {padding:[24,24]});
  }

  function init({element, clinics, onSelect}) {
    destroy();
    if (!element) return {ok:false, reason:'missing-element'};
    if (!window.L) {
      element.innerHTML = '<div class="map-fallback">Map library unavailable. Clinic list remains available.</div>';
      return {ok:false, reason:'leaflet-unavailable'};
    }
    map = L.map(element, {scrollWheelZoom:true, zoomControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:18,
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    layer = L.layerGroup().addTo(map);
    clinics.forEach(clinic => {
      const icon = L.divIcon({
        className:'',
        html:`<div class="map-marker" style="--marker:${color(clinic)}"></div>`,
        iconSize:[18,18],
        iconAnchor:[9,9]
      });
      const marker = L.marker([clinic.lat, clinic.lng], {icon}).addTo(layer).bindPopup(
        `<div class="popup-title">${window.HMSUI.escape(clinic.name)}</div>` +
        `<div class="popup-meta">${window.HMSUI.escape(clinic.stage)} · Lead: ${window.HMSUI.escape(clinic.lead)}</div>` +
        `<div class="popup-next"><b>Next:</b> ${window.HMSUI.escape(clinic.next)}</div>` +
        `<div class="popup-note">${window.HMSUI.escape(clinic.positionNote || '')}</div>`
      );
      marker.on('click', () => onSelect(clinic.name, false));
      markers.set(clinic.name, marker);
    });
    fit(clinics);
    setTimeout(() => map && map.invalidateSize(), 0);
    return {ok:true};
  }

  function focus(clinic) {
    if (!map || !clinic) return;
    map.setView([clinic.lat, clinic.lng], Math.max(map.getZoom(), 8), {animate:true});
    const marker = markers.get(clinic.name);
    if (marker) marker.openPopup();
  }

  return {init, fit, focus, destroy};
})();
