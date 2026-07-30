(function (global) {
  "use strict";
  const PALETTES = Object.freeze({
    osm: { main: "#2457d6", center: "#173f9f", centerFill: "#fff", line: "#82c8ed", projectText: "#fff" },
    sat: { main: "#FFD400", center: "#FFD400", centerFill: "#FFF3A6", line: "#FFD400", projectText: "#111" }
  });
  const frames=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  async function waitForLeafletMapReady(map,timeout=10000){
    if(!map?.getContainer)throw new Error("Mapa Leaflet no inicializado"); const container=map.getContainer(); const started=Date.now();
    while(Date.now()-started<timeout){
      const rect=container.getBoundingClientRect(); const tiles=[...container.querySelectorAll(".leaflet-tile")]; const loadedTiles=tiles.filter(tile=>tile.complete&&tile.naturalWidth!==0); const vectors=container.querySelectorAll(".leaflet-marker-icon, .leaflet-overlay-pane svg path, .leaflet-overlay-pane canvas");
      if(rect.width>0&&rect.height>0&&loadedTiles.length>0&&vectors.length>0){await frames();await new Promise(resolve=>setTimeout(resolve,500));return {width:rect.width,height:rect.height,tileCount:loadedTiles.length,vectorLayerCount:vectors.length};}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw new Error("Tiempo de espera agotado antes de que el mapa, sus teselas y capas estuvieran listos");
  }
  function labelNode(title, detail) { const node=document.createElement("div"); const strong=document.createElement("strong"); strong.textContent=title; node.append(strong); if(detail){node.append(document.createElement("br"),document.createTextNode(detail));} return node; }
  function projectIcon(index, mode) { const p=PALETTES[mode]; return L.divIcon({className:`project-number-label${mode === "sat" ? " is-sat" : ""}`,html:`<span style="--sector-color:${p.main};color:${p.projectText}">${index+1}</span>`,iconSize:null,iconAnchor:[7,7]}); }
  function render(result, basemap) {
    const initial=basemap === "sat" ? "sat" : "osm";
    const map=L.map("map",{scrollWheelZoom:false,zoomSnap:.25});
    const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:20,crossOrigin:true,attribution:"&copy; OpenStreetMap"});
    const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,crossOrigin:true,attribution:"Tiles &copy; Esri"});
    (initial === "sat" ? sat : osm).addTo(map); L.control.layers({OSM:osm,SAT:sat},null,{collapsed:false}).addTo(map); L.control.scale({metric:true,imperial:false}).addTo(map);
    const query=[result.query.lat,result.query.lon]; map.setView(query,10);
    const queryLayer=L.circleMarker(query,{radius:10,color:"#fff",weight:3,fillOpacity:1}).addTo(map).bindPopup(labelNode("Punto consultado"));
    const projectLayers=result.base.map((item,index)=>L.marker([item.lat,item.lon],{icon:projectIcon(index,initial)}).addTo(map).bindPopup(labelNode(String(item.feature.properties?.nombre_proyecto||"Proyecto"),`${GeoQueryAnalysis.normalizeSector(item.feature.properties?.sector)} · ${GeoQueryRender.km(item.distance_km)}`)));
    const circle=Number.isFinite(result.radiusMeters)?L.circle(query,{radius:result.radiusMeters,weight:2,fillOpacity:.08}).addTo(map):null;
    let centroid=null,nearestLine=null;
    if(result.base.length){ const center=[result.base.reduce((s,p)=>s+p.lat,0)/result.base.length,result.base.reduce((s,p)=>s+p.lon,0)/result.base.length]; centroid=L.circleMarker(center,{radius:7,weight:2,fillOpacity:1}).addTo(map).bindTooltip("Centroide visual del grupo"); const nearest=result.base[0]; nearestLine=L.polyline([query,[nearest.lat,nearest.lon]],{dashArray:"7 6",weight:2}).addTo(map).bindTooltip(`Proyecto más cercano: ${GeoQueryRender.km(nearest.distance_km)}`); }
    const legend=L.control({position:"bottomright"}); legend.onAdd=()=>{const div=L.DomUtil.create("div","map-legend"); [["query","Punto consultado"],["project","Proyecto aprobado"],["centroid","Centroide visual"]].forEach(([c,t])=>{const row=document.createElement("div"); row.className="legend-item"; const dot=document.createElement(c==="project"?"span":"i"); dot.className=c==="project"?"legend-symbol legend-project":c; row.append(dot,document.createTextNode(t)); div.appendChild(row);}); return div;}; legend.addTo(map);
    function applyPalette(mode) { const p=PALETTES[mode]; queryLayer.setStyle?.({color:"#fff",fillColor:p.main}); circle?.setStyle?.({color:p.main,fillColor:p.main}); centroid?.setStyle?.({color:p.center,fillColor:p.centerFill}); nearestLine?.setStyle?.({color:p.line}); projectLayers.forEach((layer,index)=>layer.setIcon?.(projectIcon(index,mode))); const legendNode=map.getContainer().querySelector?.(".map-legend"); legendNode?.classList.toggle("is-sat",mode === "sat"); map.currentBasemap=mode; if(document.documentElement)document.documentElement.dataset.basemap=mode; if(global.geoQueryState){global.geoQueryState.basemap=mode; global.geoQueryState.mapState={...(global.geoQueryState.mapState||{}),basemap:mode};} }
    applyPalette(initial);
    map.on?.("baselayerchange",event=>applyPalette(event.layer === sat ? "sat" : "osm"));
    enableTouchGuard(map,map.getContainer());
    if(circle){ map.invalidateSize(true); requestAnimationFrame(()=>map.fitBounds(circle.getBounds(),{padding:[20,20],maxZoom:15,animate:false})); }
    global.geoQueryLeafletMap=map;
    global.geoQueryMapReady=false; global.geoQueryMapReadyPromise=(async()=>{await frames();map.invalidateSize(true);await frames();if(circle)map.fitBounds(circle.getBounds(),{padding:[20,20],maxZoom:15,animate:false});await frames();await waitForLeafletMapReady(map);global.geoQueryMapReady=true;global.geoQueryReady=Boolean(global.geoQueryMapReady&&global.geoQueryChartsReady);global.GeoEvaPdfExport?.bindGeoEvaPdfButtonOnce?.();return true;})().catch(error=>{global.geoQueryMapReady=false;global.geoQueryReady=false;console.error("GeoQuery: el mapa no alcanzó el estado listo",error);throw error;});
    return map;
  }
  function enableTouchGuard(map,container){if(!matchMedia("(pointer: coarse)").matches&&!navigator.maxTouchPoints)return; map.dragging.disable(); const hint=document.createElement("span"); hint.className="touch-hint"; hint.textContent="Usa dos dedos para mover el mapa"; container.appendChild(hint); container.addEventListener("touchstart",e=>{const two=e.touches.length>1; two?map.dragging.enable():map.dragging.disable(); hint.classList.toggle("visible",!two);},{passive:true}); container.addEventListener("touchend",()=>{map.dragging.disable();hint.classList.remove("visible");},{passive:true});}
  global.GeoQueryMap={render,PALETTES,waitForLeafletMapReady};
})(window);
