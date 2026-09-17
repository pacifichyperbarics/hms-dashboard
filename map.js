window.HMSHomeMap = (() => {
  let map;
  const markers = new Map();
  const color = clinic => clinic.category === 'Buildout' ? (clinic.indicator === 'red' ? '#c2414b' : '#b7791f') : '#18795f';
  function destroy(){ if(map) map.remove(); map = null; markers.clear(); }
  function fit(clinics){ if(map && clinics.length) map.fitBounds(clinics.map(c => [c.lat,c.lng]), {padding:[28,28]}); }
  function init(element, clinics, onSelect){
    destroy();
    if(!element) return;
    if(!window.L){ element.innerHTML='<div class="map-fallback">Map unavailable. The clinic cards remain available.</div>'; return; }
    map=L.map(element,{scrollWheelZoom:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    clinics.forEach(clinic=>{
      const icon=L.divIcon({className:'',html:'<span class="map-marker" style="--marker:'+color(clinic)+'"></span>',iconSize:[20,20],iconAnchor:[10,10]});
      const marker=L.marker([clinic.lat,clinic.lng],{icon}).addTo(map);
      marker.bindPopup('<strong>'+window.HMSHome.escape(clinic.name)+'</strong><br><span>'+window.HMSHome.escape(clinic.stage)+'</span><br><small>Lead: '+window.HMSHome.escape(clinic.lead)+'</small>');
      marker.on('click',()=>onSelect(clinic.name));
      markers.set(clinic.name,marker);
    });
    fit(clinics);
    setTimeout(()=>map && map.invalidateSize(),0);
  }
  function focus(name,clinic){ if(!map||!clinic)return; map.setView([clinic.lat,clinic.lng],Math.max(map.getZoom(),8)); const marker=markers.get(name); if(marker)marker.openPopup(); }
  return {init,fit,focus,destroy};
})();

