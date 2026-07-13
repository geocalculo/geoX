const GEOQUERY_BASE_URL = new URL("../capas_geoquery/", window.location.href);
const caches = { json: new Map() };
const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? "—").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function num(params, key) { const v = Number(params.get(key)); return Number.isFinite(v) ? v : null; }
function validLatLon(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
function dms(value, type) { const a=Math.abs(value); let d=Math.floor(a), mf=(a-d)*60, m=Math.floor(mf), s=Number(((mf-m)*60).toFixed(2)); if(s>=60){s=0;m++} if(m>=60){m=0;d++} return `${d}° ${m}' ${s.toFixed(2)}" ${type==="lat"?(value>=0?"N":"S"):(value>=0?"E":"W")}`; }
function field(props, names) { for (const n of names || []) { const v = props?.[n]; if (v !== null && v !== undefined && String(v).trim() !== "") return v; } return null; }
function normText(v) { return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatDistance(km) { return !Number.isFinite(km) ? "—" : km < 1 ? `${fmt.format(km * 1000)} m` : `${fmt.format(km)} km`; }
function formatDistanceKm(km) { return Number.isFinite(km) ? `${fmtKm.format(km)} km` : null; }
function formatAreaM2(value) { const n = Number(value); return Number.isFinite(n) ? `${fmt.format(n)} m²` : null; }
function cleanText(v) { const text = String(v ?? "").replace(/\s+/g, " ").trim(); return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null; }
function displayRelaveTitle(r) { return cleanText(r.siteName) || cleanText(r.company) || cleanText(r.idRelave) || "Relave sin nombre informado"; }
function rows(items) { return `<dl class="details">${items.map(([k,v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`; }
async function fetchJson(url) { const href = url.toString(); if (!caches.json.has(href)) caches.json.set(href, fetch(href, {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(`${r.status} ${r.url}`); return r.json(); })); return caches.json.get(href); }
function safeLayerFile(file) { return typeof file === "string" && file.trim() && !file.startsWith("/") && !/^[a-z][\w+.-]*:/i.test(file) && !file.split(/[\\/]+/).includes(".."); }
function getGroupBase(entry) { return new URL(`${entry.carpeta}/`, GEOQUERY_BASE_URL); }
function parseViewport(params) { const west=num(params,"viewWest"), south=num(params,"viewSouth"), east=num(params,"viewEast"), north=num(params,"viewNorth"); if ([west,south,east,north].every(Number.isFinite) && west < east && south < north) return { west,south,east,north,bbox:[west,south,east,north], polygon:turf.bboxPolygon([west,south,east,north]), source:"url_bbox"}; const lat=num(params,"viewLat")??num(params,"mapCenterLat")??num(params,"lat"), lon=num(params,"viewLon")??num(params,"mapCenterLon")??num(params,"lon"), z=num(params,"zoom")??num(params,"mapZoom")??14; if(!validLatLon(lat,lon)) return null; const scale=256*2**Math.max(0,Math.min(20,z)), lonPx=360/scale, latPx=lonPx/Math.max(.15,Math.cos(lat*Math.PI/180)); return {west:lon-640*lonPx,east:lon+640*lonPx,south:lat-360*latPx,north:lat+360*latPx,source:"fallback_center_zoom"}; }
function featureIntersectsViewport(feature, viewport) { if (!viewport || !feature?.geometry) return false; try { return turf.booleanIntersects(feature, viewport.polygon || turf.bboxPolygon([viewport.west,viewport.south,viewport.east,viewport.north])); } catch { try { const b=turf.bbox(feature); return !(b[2] < viewport.west || b[0] > viewport.east || b[3] < viewport.south || b[1] > viewport.north); } catch { return false; } } }
function pointCoords(feature, props, cfg) { const c = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null; if (Array.isArray(c) && validLatLon(Number(c[1]), Number(c[0]))) return [Number(c[0]), Number(c[1])]; const lon = Number(field(props, cfg.campos?.longitud)); const lat = Number(field(props, cfg.campos?.latitud)); return validLatLon(lat, lon) ? [lon, lat] : null; }
function normalizeRelave(feature, layer, cfg, i) { const p=feature.properties||{}, c=pointCoords(feature,p,cfg); const res=field(p,cfg.campos.recurso); return {groupId:"relaves",sourceFile:layer.archivo,layerId:layer.id,featureId:field(p,cfg.campos.id)??`${layer.id}-${i}`,idRelave:field(p,cfg.campos.id),company:field(p,cfg.campos.empresa),siteName:field(p,cfg.campos.faena),depositType:field(p,cfg.campos.tipo_deposito),resourceOriginal:res,resourceNormalized:normText(res),commune:field(p,cfg.campos.comuna),areaM2:field(p,cfg.campos.area_m2),constructionMethod:field(p,cfg.campos.metodo_constructivo),coordinates:c,originalProperties:p,feature:{type:"Feature",properties:p,geometry:feature.geometry}}; }
function pollutant(p,cfg){ const rule=cfg.regla_contaminante||{}, ignore=(rule.ignorar||[]).map(v=>v===null?null:normText(v)); for(const key of [rule.principal,rule.fallback]) { const v=p?.[key]; if(v!==null&&v!==undefined&&!ignore.includes(normText(v))) return v; } return null; }
function normalizeZona(feature, layer, cfg, i) { const p=feature.properties||{}; return {groupId:"zonas",sourceFile:layer.archivo,layerId:layer.id,featureId:field(p,cfg.campos.id)??`${layer.id}-${i}`,name:field(p,cfg.campos.nombre),condition:field(p,cfg.campos.condicion),pollutant:pollutant(p,cfg),saturatedValue:field(p,cfg.campos.saturado),latentValue:field(p,cfg.campos.latente),decree:field(p,cfg.campos.decreto),link:field(p,cfg.campos.link),regionCode:field(p,cfg.campos.region),officialArea:field(p,cfg.campos.superficie),originalProperties:p,feature:{type:"Feature",properties:p,geometry:feature.geometry}}; }
function nearestOnBoundary(feature, queryPoint) { const line = turf.polygonToLine(feature); const snap = turf.nearestPointOnLine(line, queryPoint, {units:"kilometers"}); return { snap, distanceKm: snap.properties.dist }; }
function analyzeRelaves(items, queryPoint, rules) { const max=rules.regla_busqueda?.cantidad_maxima || 10; const ranked=items.filter(x=>x.coordinates).map(x=>({...x,distanceKm:turf.distance(queryPoint,turf.point(x.coordinates),{units:"kilometers"})})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,max); return {groupId:"relaves", status: ranked.length?"resolved":"empty", relation:"nearest_n", items:ranked, distanceKm:ranked[0]?.distanceKm??null, radiusKm:ranked.at(-1)?.distanceKm??null}; }
function analyzeZonas(items, queryPoint) { const containing=[]; for(const item of items){ try{ if(turf.booleanPointInPolygon(queryPoint,item.feature)) containing.push(item); }catch{} } if(containing.length) return {groupId:"zonas",status:"resolved",relation:"intersects",items:containing,distanceKm:0}; let nearest=null; for(const item of items){ try{ const n=nearestOnBoundary(item.feature,queryPoint); if(!nearest||n.distanceKm<nearest.distanceKm) nearest={...item,...n}; }catch{} } return nearest ? {groupId:"zonas",status:"resolved",relation:"nearest",items:[nearest],distanceKm:nearest.distanceKm,nearestPoint:nearest.snap} : {groupId:"zonas",status:"empty",relation:"none",items:[]}; }
function renderRelaveMetadataItem(r, idx) {
  const details = [
    ["Empresa", cleanText(r.company)],
    ["Recurso", cleanText(r.resourceOriginal)],
    ["Tipo depósito", cleanText(r.depositType)],
    ["Comuna", cleanText(r.commune)],
    ["Método", cleanText(r.constructionMethod)],
    ["ID", cleanText(r.idRelave)],
    ["Área", formatAreaM2(r.areaM2)],
    ["Distancia", formatDistanceKm(r.distanceKm)]
  ].filter(([, value]) => value);
  const detailHtml = details.map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`).join("");
  return `<article class="metadata-project-item metadata-relave-item"><div class="metadata-project-main"><span class="project-expediente-badge" aria-label="Ranking ${idx + 1}">${idx + 1}</span><strong class="metadata-project-title">${escapeHtml(displayRelaveTitle(r))}</strong></div><div class="metadata-project-details">${detailHtml}</div></article>`;
}
function dominantResource(items) {
  const counts = new Map();
  for (const item of items) {
    const resource = cleanText(item.resourceOriginal);
    if (!resource) continue;
    const key = normText(resource);
    const current = counts.get(key) || { resource, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  let best = null;
  for (const value of counts.values()) if (!best || value.count > best.count) best = value;
  return best;
}
function dominantResourceRelaves(items, dominant) {
  if (!dominant) return [];
  const key = normText(dominant.resource);
  return items.filter(item => normText(cleanText(item.resourceOriginal)) === key);
}
function mean(values) { return values.length ? values.reduce((a,b)=>a+b,0) / values.length : null; }
function pairDistanceStats(items) {
  const distances = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].coordinates && items[j].coordinates) distances.push(turf.distance(turf.point(items[i].coordinates), turf.point(items[j].coordinates), {units:"kilometers"}));
    }
  }
  return { meanKm: mean(distances), minKm: distances.length ? Math.min(...distances) : null };
}
function pointDistanceStats(items) {
  const distances = items.map(item => item.distanceKm).filter(Number.isFinite);
  return { meanKm: mean(distances), minKm: distances.length ? Math.min(...distances) : null };
}
function renderAnalysisCategory(title, detailRows) {
  return `<div class="subpanel analysis-category"><h4>${escapeHtml(title)}</h4>${rows(detailRows.filter(([,v])=>v!==null&&v!==undefined&&v!==""))}</div>`;
}
function relaveContext(result) {
  const selectedRelaves = result.items || [];
  const dominant = dominantResource(selectedRelaves);
  const dominantRelaves = dominantResourceRelaves(selectedRelaves, dominant);
  return { selectedRelaves, dominant, dominantRelaves };
}
function renderRelatedRelaves(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const resourceCount = new Set(selectedRelaves.map(item => cleanText(item.resourceOriginal)).filter(Boolean).map(normText)).size;
  const missingResourceCount = selectedRelaves.filter(item => !cleanText(item.resourceOriginal)).length;
  const share = dominant && selectedRelaves.length ? `${fmt.format((dominant.count / selectedRelaves.length) * 100)}%` : null;
  const compositionRows = [["Total de relaves seleccionados", selectedRelaves.length], ["Recursos diferentes", resourceCount], ["Relaves del recurso dominante", dominantRelaves.length]];
  if (missingResourceCount) compositionRows.push(["Relaves sin recurso informado", missingResourceCount]);
  return `<section class="panel group-section"><h2>Relaves relacionados</h2>${renderAnalysisCategory("Clúster base", [["Relaves más cercanos", selectedRelaves.length], ["Radio del clúster", formatDistanceKm(result.radiusKm)], ["Recurso dominante", dominant?.resource || "N/D"], ["Participación del recurso dominante", share || "N/D"]])}${renderAnalysisCategory("Composición del clúster", compositionRows)}</section>`;
}
function renderGeometryDescriptors(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const selectedStats = pairDistanceStats(selectedRelaves);
  const dominantStats = pairDistanceStats(dominantRelaves);
  const dominantTitle = dominant ? `Recurso dominante · ${dominant.resource} · ${dominantRelaves.length} relaves` : "Recurso dominante · N/D · 0 relaves";
  return `<section class="panel group-section"><h2>Descriptores geométricos</h2><dl class="details analysis-summary">${rows([["Radio del clúster", formatDistanceKm(result.radiusKm) || "N/D"]]).replace(/^<dl class="details">|<\/dl>$/g, "")}</dl>${renderAnalysisCategory(`Relaves seleccionados · ${selectedRelaves.length}`, [["Distancia media entre relaves", formatDistanceKm(selectedStats.meanKm) || "N/D"], ["Distancia mínima entre relaves", formatDistanceKm(selectedStats.minKm) || "N/D"]])}${renderAnalysisCategory(dominantTitle, [["Distancia media entre relaves", formatDistanceKm(dominantStats.meanKm) || "N/D"], ["Distancia mínima entre relaves", formatDistanceKm(dominantStats.minKm) || "N/D"]])}</section>`;
}
function renderSpatialIndicators(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const selectedStats = pointDistanceStats(selectedRelaves);
  const dominantStats = pointDistanceStats(dominantRelaves);
  const dominantTitle = dominant ? `Recurso dominante · ${dominant.resource} · ${dominantRelaves.length} relaves` : "Recurso dominante · N/D · 0 relaves";
  return `<section class="panel group-section"><h2>Indicadores de relación espacial</h2><dl class="details analysis-summary">${rows([["Tipo de relación","Cercanía al punto consultado"]]).replace(/^<dl class="details">|<\/dl>$/g, "")}</dl>${renderAnalysisCategory(`Relaves seleccionados · ${selectedRelaves.length}`, [["Distancia media desde el punto consultado", formatDistanceKm(selectedStats.meanKm) || "N/D"], ["Distancia mínima al punto consultado", formatDistanceKm(selectedStats.minKm) || "N/D"]])}${renderAnalysisCategory(dominantTitle, [["Distancia media desde el punto consultado", formatDistanceKm(dominantStats.meanKm) || "N/D"]])}</section>`;
}
function renderRelaveMetadata(result) {
  const intro = "Relaves más cercanos usados para construir el clúster base.";
  const metadataItems = (result.items || []).map((r,idx)=>renderRelaveMetadataItem(r,idx)).join("");
  return `<section class="panel group-section"><div class="group-header"><div><h2>Metadata de relaves</h2><p class="placeholder-text">${intro}</p></div><span class="status-pill">${(result.items || []).length} relaves más cercanos</span></div><div class="metadata-project-list metadata-relave-list">${metadataItems || '<p>Sin relaves seleccionados disponibles.</p>'}</div></section>`;
}
function renderRelaves(result,cfg,meta){
  if(result.status==="empty") return `<div class="relaves-report-grid"><section class="panel group-section"><h2>Relaves relacionados</h2><p class="placeholder-text">No existen relaves presentes en el viewport consultado.</p></section>${renderGeometryDescriptors({items:[],distanceKm:null,radiusKm:null})}${renderSpatialIndicators({items:[],distanceKm:null,radiusKm:null})}${renderRelaveMetadata({items:[]})}</div>`;
  return `<div class="relaves-report-grid">${renderRelatedRelaves(result)}${renderGeometryDescriptors(result)}${renderSpatialIndicators(result)}${renderRelaveMetadata(result)}</div>`;
}
function renderZonas(result,cfg,meta){ if(result.status==="empty") return `<section class="panel group-section"><h2>Grupo ${escapeHtml(cfg.nombre)}</h2><p class="placeholder-text">${escapeHtml(cfg.textos?.sin_resultados || "Sin resultados en el viewport original.")}</p>${renderMeta(meta)}</section>`; const z=result.items[0]; const label=result.relation==="intersects"?"Dentro de zona":"Zona más cercana"; return `<section class="panel group-section"><div class="group-header"><div><h2>Grupo ${escapeHtml(cfg.nombre)}</h2><p class="placeholder-text">${escapeHtml(cfg.nombre_largo)}</p></div><span class="status-pill">${label}</span></div><div class="group-grid"><div class="subpanel"><h4>Zona relacionada</h4>${rows([["Nombre",z.name],["Condición",z.condition],["Contaminante",z.pollutant],["Saturado",z.saturatedValue],["Latente",z.latentValue],["Decreto",z.decree],["Región CUT",z.regionCode],["Superficie",z.officialArea],["Distancia",formatDistance(result.distanceKm)]])}${z.link?`<p><a href="${escapeHtml(z.link)}" target="_blank" rel="noopener">Ver enlace normativo</a></p>`:""}</div></div>${renderMeta(meta)}</section>`; }
function renderMeta(meta){ return `<div class="subpanel"><h4>Metadata técnica</h4>${rows([["Features cargadas",meta.loaded],["Features en viewport original",meta.inViewport],["Universo",meta.universe],["Fuente viewport",meta.viewportSource]])}</div>`; }
function buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon){ const p=new URLSearchParams({from:"geoquery",lat:String(lat),lon:String(lon),zoom:String(zoom||14),basemap:basemap||"osm"}); if(Number.isFinite(viewLat)&&Number.isFinite(viewLon)){p.set("viewLat",viewLat);p.set("viewLon",viewLon)} return `../index.html?${p}`; }
async function analyzeGroup(entry, queryPoint, viewport){ const base=getGroupBase(entry); const cfg=await fetchJson(new URL(entry.config,GEOQUERY_BASE_URL)); const rules=await fetchJson(new URL(entry.listado_query || `${entry.carpeta}/listado_query.json`, GEOQUERY_BASE_URL)); let loaded=0, normalized=[]; for(const layer of (rules.capas||[]).filter(l=>l.activo && safeLayerFile(l.archivo))){ const gj=await fetchJson(new URL(layer.archivo,base)); const feats=Array.isArray(gj.features)?gj.features:[]; loaded += feats.length; const visible=feats.filter(f=>featureIntersectsViewport(f,viewport)); normalized.push(...visible.map((f,i)=> cfg.id==="relaves"?normalizeRelave(f,layer,cfg,i):normalizeZona(f,layer,cfg,i))); }
 const meta={loaded,inViewport:normalized.length,universe:rules.regla_busqueda?.universo,viewportSource:viewport?.source||"no_disponible"}; const result=cfg.id==="relaves"?analyzeRelaves(normalized,queryPoint,rules):analyzeZonas(normalized,queryPoint,rules); return {entry,cfg,rules,result,meta}; }
function drawResult(map,layers,group){ const cfg=group.cfg, res=group.result; const style=cfg.estilo||{}; if(cfg.id==="relaves"){ res.items.forEach(r=>{ L.circleMarker([r.coordinates[1],r.coordinates[0]],{radius:6,color:style.color||"#ea580c",fillColor:style.fillColor||"#f97316",fillOpacity:.85,weight:2}).bindPopup(`${r.siteName||"Relave"}<br>${formatDistance(r.distanceKm)}`).addTo(layers.results); }); if(Number.isFinite(res.radiusKm)&&res.items[0]) L.circle([queryLat,queryLon],{radius:res.radiusKm*1000,color:style.color||"#ea580c",dashArray:"4 8",fill:false,weight:2}).addTo(layers.results); } else if(res.items[0]) { L.geoJSON(res.items[0].feature,{style:{color:style.color||"#7c2d12",fillColor:style.fillColor||"#fb923c",fillOpacity:style.fillOpacity??.25,weight:style.weight||2}}).addTo(layers.results); if(res.nearestPoint){ const c=res.nearestPoint.geometry.coordinates; L.polyline([[queryLat,queryLon],[c[1],c[0]]],{color:"#7c2d12",dashArray:"4 6"}).addTo(layers.results); } } }
let queryLat, queryLon;
(async function init(){ const params=new URLSearchParams(location.search); const lat=num(params,"lat"), lon=num(params,"lon"); queryLat=lat; queryLon=lon; const viewLat=num(params,"viewLat")??num(params,"mapCenterLat"), viewLon=num(params,"viewLon")??num(params,"mapCenterLon"), zoom=num(params,"zoom")??14, basemap=(params.get("basemap")||"osm").toLowerCase()==="sat"?"sat":"osm"; const els={back:$("back-link"),status:$("card-status"),groups:$("geoquery-groups"),summary:$("executive-summary"),load:$("groups-load-status")}; if(els.back) els.back.href=validLatLon(lat,lon)?buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon):"../index.html"; [[$("card-lat"),lat?.toFixed(6)],[$("card-lon"),lon?.toFixed(6)],[$("card-site"),(params.get("site")||"geonoxa").toUpperCase()],[$("lat-decimal"),lat?.toFixed(6)],[$("lon-decimal"),lon?.toFixed(6)],[$("lat-dms"),Number.isFinite(lat)?dms(lat,"lat"):"—"],[$("lon-dms"),Number.isFinite(lon)?dms(lon,"lon"):"—"]].forEach(([e,v])=>{if(e)e.textContent=v||"—"}); if(!validLatLon(lat,lon)){ if(els.status) els.status.textContent="Coordenada inválida"; return; }
 const map=L.map("geoquery-map",{tap:true,scrollWheelZoom:true}); const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}); const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:"Tiles &copy; Esri"}); (basemap==="sat"?sat:osm).addTo(map); map.setView([lat,lon],zoom); const layers={results:L.layerGroup().addTo(map)}; L.circleMarker([lat,lon],{radius:7,weight:3,color:"#111827",fillColor:"#facc15",fillOpacity:.95}).bindPopup("Punto consultado").addTo(map); L.control.scale({metric:true,imperial:false}).addTo(map);
 const viewport=parseViewport(params); const registry=await fetchJson(new URL("listado.json",GEOQUERY_BASE_URL)); const entries=(registry.grupos||[]).filter(g=>g.activo).sort((a,b)=>(a.orden||0)-(b.orden||0)); const queryPoint=turf.point([lon,lat]); const groups=await Promise.all(entries.map(e=>analyzeGroup(e,queryPoint,viewport))); window.geoQueryState={site:"geonoxa",lat,lon,basemap,originalViewport:viewport,groupResults:groups}; groups.forEach(g=>drawResult(map,layers,g)); if(els.groups) els.groups.innerHTML=groups.map(g=>g.cfg.id==="relaves"?renderRelaves(g.result,g.cfg,g.meta):renderZonas(g.result,g.cfg,g.meta)).join(""); const resolved=groups.filter(g=>g.result.status==="resolved"); if(els.summary) els.summary.textContent=resolved.length?resolved.map(g=>g.cfg.id==="relaves"?`${g.result.items.length} relaves evaluados; más cercano a ${formatDistance(g.result.distanceKm)}`:`${g.result.relation==="intersects"?"Intersección con":"Más cercana:"} ${g.result.items[0]?.name||"zona"} (${formatDistance(g.result.distanceKm)})`).join(". "):"No se encontraron elementos de GeoNOXA dentro del viewport original."; if(els.status){ els.status.textContent="Análisis completado"; els.status.classList.add("status-ok"); } if(els.load) els.load.textContent=`${groups.length} grupos cargados desde listado.json; análisis limitado al viewport original (${viewport?.source || "sin viewport"}).`; setTimeout(()=>map.invalidateSize(),150); })().catch(err=>{ console.error(err); const s=$("card-status"); if(s){s.textContent="Error de análisis";s.classList.add("status-error");} const g=$("geoquery-groups"); if(g) g.innerHTML=`<section class="panel"><p class="placeholder-text">${escapeHtml(err.message)}</p></section>`; });
