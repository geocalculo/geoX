const GEOQUERY_BASE_URL = new URL("../capas_geoquery/", window.location.href);
const caches = { json: new Map() };
const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GEOQUERY_DEBUG = false;

function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? "—").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c])); }
function num(params, key) { const v = Number(params.get(key)); return Number.isFinite(v) ? v : null; }
function validLatLon(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
function dms(value, type) { const a=Math.abs(value); let d=Math.floor(a), mf=(a-d)*60, m=Math.floor(mf), s=Number(((mf-m)*60).toFixed(2)); if(s>=60){s=0;m++} if(m>=60){m=0;d++} return `${d}° ${m}' ${s.toFixed(2)}" ${type==="lat"?(value>=0?"N":"S"):(value>=0?"E":"W")}`; }
function field(props, names) { for (const n of names || []) { const v = props?.[n]; if (v !== null && v !== undefined && String(v).trim() !== "") return v; } return null; }
function normText(v) { return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatDistance(km) { return !Number.isFinite(km) ? "—" : km < 1 ? `${fmt.format(km * 1000)} m` : `${fmt.format(km)} km`; }
function formatDistanceKm(km) { return Number.isFinite(km) ? `${fmtKm.format(km)} km` : "N/D"; }
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
function buildRelavesResult(selectedRelaves, rules) {
  const clusterRadiusKm = selectedRelaves.at(-1)?.distanceKm ?? null;
  const dominant = dominantResource(selectedRelaves);
  const dominantResourceRelavesList = dominantResourceRelaves(selectedRelaves, dominant);
  const pointRelationStats = pointDistanceStats(selectedRelaves);
  const pairwiseStats = pairDistanceStats(selectedRelaves);
  const dominantPointRelationStats = pointDistanceStats(dominantResourceRelavesList);
  const dominantPairwiseStats = pairDistanceStats(dominantResourceRelavesList);
  return {
    groupId: "relaves",
    status: selectedRelaves.length > 0 ? "resolved" : "empty",
    relation: selectedRelaves.length > 0 ? "nearest_n" : "none",
    selectedRelaves,
    selectedCount: selectedRelaves.length,
    clusterRadiusKm,
    dominantResource: dominant?.resource || null,
    dominantResourceCount: dominant?.count || 0,
    dominantResourcePercentage: dominant && selectedRelaves.length ? (dominant.count / selectedRelaves.length) * 100 : null,
    dominantResourceRelaves: dominantResourceRelavesList,
    pointRelationStats,
    pairwiseStats,
    dominantPointRelationStats,
    dominantPairwiseStats,
    sourceFile: selectedRelaves[0]?.sourceFile || rules?.capas?.find(layer => layer?.activo)?.archivo || null,
    items: selectedRelaves,
    distanceKm: pointRelationStats.minKm,
    radiusKm: clusterRadiusKm,
    error: null
  };
}
function analyzeRelaves(items, queryPoint, rules) { const max=rules.regla_busqueda?.cantidad_maxima || 10; const ranked=items.filter(x=>x.coordinates).map(x=>({...x,distanceKm:turf.distance(queryPoint,turf.point(x.coordinates),{units:"kilometers"})})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,max); return buildRelavesResult(ranked, rules); }
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
  const selectedRelaves = Array.isArray(result?.selectedRelaves) ? result.selectedRelaves : (Array.isArray(result?.items) ? result.items : []);
  const dominant = result?.dominantResource ? { resource: result.dominantResource, count: result.dominantResourceCount || dominantResource(selectedRelaves)?.count || 0 } : dominantResource(selectedRelaves);
  const dominantRelaves = Array.isArray(result?.dominantResourceRelaves) ? result.dominantResourceRelaves : dominantResourceRelaves(selectedRelaves, dominant);
  return { selectedRelaves, dominant, dominantRelaves };
}
function shouldRenderRelaves(result) {
  return Boolean(result && result.status === "resolved" && Array.isArray(result.selectedRelaves) && result.selectedRelaves.length > 0);
}
function safeRenderPanel(factory, label, result) {
  try { return factory(); }
  catch (error) { console.error(`[GeoNOXA][relaves][panel:${label}]`, error); if (result) result.renderError = error; return ""; }
}
function renderRelatedRelaves(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const resourceCount = new Set(selectedRelaves.map(item => cleanText(item.resourceOriginal)).filter(Boolean).map(normText)).size;
  const missingResourceCount = selectedRelaves.filter(item => !cleanText(item.resourceOriginal)).length;
  const share = Number.isFinite(result.dominantResourcePercentage) ? `${fmt.format(result.dominantResourcePercentage)}%` : (dominant && selectedRelaves.length ? `${fmt.format((dominant.count / selectedRelaves.length) * 100)}%` : "N/D");
  const compositionRows = [["Total de relaves seleccionados", selectedRelaves.length], ["Recursos diferentes", resourceCount]];
  if (dominant) compositionRows.push(["Relaves del recurso dominante", dominantRelaves.length]);
  if (missingResourceCount) compositionRows.push(["Relaves sin recurso informado", missingResourceCount]);
  return `<section class="panel group-section"><h2>Relaves relacionados</h2>${renderAnalysisCategory("Clúster base", [["Relaves más cercanos", selectedRelaves.length], ["Radio del clúster", formatDistanceKm(result.radiusKm)], ["Recurso dominante", dominant?.resource], ["Participación del recurso dominante", share]])}${renderAnalysisCategory("Composición del clúster", compositionRows)}</section>`;
}
function renderGeometryDescriptors(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const selectedStats = pairDistanceStats(selectedRelaves);
  const dominantStats = pairDistanceStats(dominantRelaves);
  const dominantPanel = dominant ? renderAnalysisCategory(`Recurso dominante · ${dominant.resource} · ${dominantRelaves.length} relaves`, [["Distancia media entre relaves", formatDistanceKm(dominantStats.meanKm)], ["Distancia mínima entre relaves", formatDistanceKm(dominantStats.minKm)]]) : "";
  return `<section class="panel group-section"><h2>Descriptores geométricos</h2><dl class="details analysis-summary">${rows([["Radio del clúster", formatDistanceKm(result.radiusKm)]]).replace(/^<dl class="details">|<\/dl>$/g, "")}</dl>${renderAnalysisCategory(`Relaves seleccionados · ${selectedRelaves.length}`, [["Distancia media entre relaves", formatDistanceKm(selectedStats.meanKm)], ["Distancia mínima entre relaves", formatDistanceKm(selectedStats.minKm)]])}${dominantPanel}</section>`;
}
function renderSpatialIndicators(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const selectedStats = pointDistanceStats(selectedRelaves);
  const dominantStats = pointDistanceStats(dominantRelaves);
  const dominantPanel = dominant ? renderAnalysisCategory(`Recurso dominante · ${dominant.resource} · ${dominantRelaves.length} relaves`, [["Distancia media desde el punto consultado", formatDistanceKm(dominantStats.meanKm)]]) : "";
  return `<section class="panel group-section"><h2>Indicadores de relación espacial</h2><dl class="details analysis-summary">${rows([["Tipo de relación","Cercanía al punto consultado"]]).replace(/^<dl class="details">|<\/dl>$/g, "")}</dl>${renderAnalysisCategory(`Relaves seleccionados · ${selectedRelaves.length}`, [["Distancia media desde el punto consultado", formatDistanceKm(selectedStats.meanKm)], ["Distancia mínima al punto consultado", formatDistanceKm(selectedStats.minKm)]])}${dominantPanel}</section>`;
}
function renderRelaveMetadata(result) {
  const selectedRelaves = Array.isArray(result?.selectedRelaves) ? result.selectedRelaves : (result.items || []);
  const intro = "Relaves más cercanos usados para construir el clúster base.";
  const metadataItems = selectedRelaves.map((r,idx)=>renderRelaveMetadataItem(r,idx)).join("");
  return `<section class="panel group-section"><div class="group-header"><div><h2>Metadata de relaves</h2><p class="placeholder-text">${intro}</p></div><span class="status-pill">${selectedRelaves.length} relaves más cercanos</span></div><div class="metadata-project-list metadata-relave-list">${metadataItems || '<p>Sin relaves seleccionados disponibles.</p>'}</div></section>`;
}
function renderRelaves(result,cfg,meta){
  if(!shouldRenderRelaves(result)) return "";
  return `<div class="relaves-report-grid">${safeRenderPanel(()=>renderRelatedRelaves(result), "relacionados", result)}${safeRenderPanel(()=>renderGeometryDescriptors(result), "geometria", result)}${safeRenderPanel(()=>renderSpatialIndicators(result), "indicadores", result)}${safeRenderPanel(()=>renderRelaveMetadata(result), "metadata", result)}${GEOQUERY_DEBUG ? renderMetaPanel(meta) : ""}</div>`;
}
function renderZonas(result,cfg,meta){
  if(result.status!=="resolved") return "";
  const z=result.items[0];
  const label=result.relation==="intersects"?"Dentro de zona":"Zona más cercana";
  const distanceLabel = result.relation==="intersects" ? "Dentro de zona" : formatDistance(result.distanceKm);
  return `<div class="zonas-report-grid"><section class="panel group-section"><div class="group-header"><div><h2>Feature relacionada</h2><p class="placeholder-text">${escapeHtml(cfg.nombre_largo || cfg.nombre || "Zona saturada o latente")}</p></div><span class="status-pill">${label}</span></div>${rows([["Nombre",z.name],["Condición",z.condition],["Contaminante",z.pollutant],["Distancia",distanceLabel]])}</section><section class="panel group-section"><h2>Descriptores geométricos</h2>${rows([["Relación espacial",result.relation==="intersects"?"Intersección con el punto consultado":"Zona más cercana al punto consultado"],["Superficie oficial",z.officialArea],["Región CUT",z.regionCode]])}</section><section class="panel group-section"><h2>Metadata normativa</h2>${rows([["Saturado",z.saturatedValue],["Latente",z.latentValue],["Decreto",z.decree]])}${z.link?`<p><a href="${escapeHtml(z.link)}" target="_blank" rel="noopener">Ver enlace normativo</a></p>`:""}</section><section class="panel group-section"><h2>Indicadores de relación espacial</h2>${rows([["Tipo de relación",label],["Distancia al perímetro",distanceLabel]])}</section>${GEOQUERY_DEBUG ? renderMetaPanel(meta) : ""}</div>`;
}
function renderMetaPanel(meta){ return `<section class="panel group-section"><h2>Metadata técnica</h2>${rows([["Features cargadas",meta.loaded],["Features en viewport original",meta.inViewport],["Universo",meta.universe],["Fuente viewport",meta.viewportSource]])}</section>`; }
function buildRelavesSummary(result){
  if (!shouldRenderRelaves(result)) return "";
  const { selectedRelaves } = relaveContext(result);
  const fragments = [`Se analizaron ${selectedRelaves.length} relaves presentes en el viewport.`];
  if (result.dominantResource) fragments.push(`El recurso dominante es ${result.dominantResource}${Number.isFinite(result.dominantResourcePercentage) ? `, con una participación del ${fmt.format(result.dominantResourcePercentage)} %.` : "."}`);
  if (Number.isFinite(result.pointRelationStats?.minKm)) fragments.push(`El relave más cercano se encuentra a ${formatDistanceKm(result.pointRelationStats.minKm)} del punto consultado.`);
  return fragments.join(" ");
}
function buildZonasSummary(result){
  const z = result.items?.[0];
  if (!z) return "";
  const name = cleanText(z.name) || "sin nombre informado";
  const pollutantText = cleanText(z.pollutant) ? `, asociada al contaminante ${cleanText(z.pollutant)}` : "";
  if (result.relation === "intersects") return `El punto consultado se encuentra dentro de la zona saturada o latente ${name}${pollutantText}.`;
  return `La zona saturada o latente más cercana es ${name}, ubicada a ${formatDistanceKm(result.distanceKm)} del punto consultado.`;
}
function buildExecutiveSummary({ relavesResult, zonasResult }){
  const fragments=[];
  if(relavesResult?.status==="resolved") { try { fragments.push(buildRelavesSummary(relavesResult)); } catch(error) { console.error("[GeoNOXA][relaves][summary]", error); relavesResult.summaryError = error; } }
  if(zonasResult?.status==="resolved") { try { fragments.push(buildZonasSummary(zonasResult)); } catch(error) { console.error("[GeoNOXA][zonas][summary]", error); zonasResult.summaryError = error; } }
  if(fragments.length===0 && relavesResult?.status==="empty" && zonasResult?.status==="empty") return "No se identificaron relaves ni zonas saturadas o latentes dentro del viewport consultado.";
  if(fragments.length===0) return "No se identificaron elementos territoriales dentro del viewport consultado.";
  return fragments.filter(Boolean).join(" ");
}
function deriveOverallStatus(relaves, zonas){
  const results=[relaves,zonas];
  const resolvedCount=results.filter(item=>item?.status==="resolved").length;
  const emptyCount=results.filter(item=>item?.status==="empty").length;
  const errorCount=results.filter(item=>item?.status==="error").length;
  if(resolvedCount>0 && errorCount===0) return { code:"resolved", label:"Resuelto" };
  if(resolvedCount>0 && errorCount>0) return { code:"partial", label:"Resuelto parcialmente" };
  if(resolvedCount===0 && emptyCount===2) return { code:"empty", label:"Sin resultados en el viewport" };
  return { code:"error", label:"Error de análisis" };
}

function setupMobileMapGesture(map, mapEl) {
  if (!mapEl) return;
  const isTouchDevice = window.matchMedia?.("(pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;
  map.dragging.disable();
  const hint = document.createElement("div");
  hint.className = "map-touch-hint";
  hint.textContent = "Usa dos dedos para mover el mapa";
  mapEl.appendChild(hint);
  let hintTimer = null;
  function showHint() { clearTimeout(hintTimer); hint.classList.add("visible"); hintTimer = setTimeout(() => hint.classList.remove("visible"), 1400); }
  mapEl.addEventListener("touchstart", (event) => { if (event.touches.length >= 2) { map.dragging.enable(); hint.classList.remove("visible"); } else { map.dragging.disable(); showHint(); } }, { passive: true });
  mapEl.addEventListener("touchmove", (event) => { if (event.touches.length >= 2) map.dragging.enable(); else map.dragging.disable(); }, { passive: true });
  mapEl.addEventListener("touchend", (event) => { if (event.touches.length < 2) map.dragging.disable(); }, { passive: true });
  mapEl.addEventListener("touchcancel", () => map.dragging.disable(), { passive: true });
}

function buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon){ const p=new URLSearchParams({from:"geoquery",lat:String(lat),lon:String(lon),zoom:String(zoom||14),basemap:basemap||"osm"}); if(Number.isFinite(viewLat)&&Number.isFinite(viewLon)){p.set("viewLat",viewLat);p.set("viewLon",viewLon)} return `../index.html?${p}`; }
async function analyzeGroup(entry, queryPoint, viewport){ const base=getGroupBase(entry); const cfg=await fetchJson(new URL(entry.config,GEOQUERY_BASE_URL)); const rules=await fetchJson(new URL(entry.listado_query || `${entry.carpeta}/listado_query.json`, GEOQUERY_BASE_URL)); let loaded=0, normalized=[]; for(const layer of (rules.capas||[]).filter(l=>l.activo && safeLayerFile(l.archivo))){ const gj=await fetchJson(new URL(layer.archivo,base)); const feats=Array.isArray(gj.features)?gj.features:[]; loaded += feats.length; const visible=feats.filter(f=>featureIntersectsViewport(f,viewport)); normalized.push(...visible.map((f,i)=> cfg.id==="relaves"?normalizeRelave(f,layer,cfg,i):normalizeZona(f,layer,cfg,i))); }
 const meta={loaded,inViewport:normalized.length,universe:rules.regla_busqueda?.universo,viewportSource:viewport?.source||"no_disponible"}; const result=cfg.id==="relaves"?analyzeRelaves(normalized,queryPoint,rules):analyzeZonas(normalized,queryPoint,rules); return {entry,cfg,rules,result,meta}; }
async function analyzeGroupSafe(entry, queryPoint, viewport){ try { return await analyzeGroup(entry, queryPoint, viewport); } catch(error) { const id = String(entry.id || entry.carpeta || "grupo").includes("zona") ? "zonas" : "relaves"; console.error(`[GeoNOXA][${id}] No fue posible resolver el grupo`, error); return {entry,cfg:{id,nombre:entry.nombre || id},rules:null,result:{groupId:id,status:"error",relation:"error",items:[],error},meta:{loaded:0,inViewport:0,universe:null,viewportSource:viewport?.source||"no_disponible"}}; } }
function drawResult(map,layers,group){ const cfg=group.cfg, res=group.result; if(res.status!=="resolved") return; const style=cfg.estilo||{}; if(cfg.id==="relaves"){ (res.selectedRelaves || res.items || []).forEach(r=>{ L.circleMarker([r.coordinates[1],r.coordinates[0]],{radius:6,color:style.color||"#ea580c",fillColor:style.fillColor||"#f97316",fillOpacity:.85,weight:2}).bindPopup(`${r.siteName||"Relave"}<br>${formatDistance(r.distanceKm)}`).addTo(layers.results); }); if(Number.isFinite(res.clusterRadiusKm ?? res.radiusKm)&&(res.selectedRelaves || res.items || [])[0]) L.circle([queryLat,queryLon],{radius:(res.clusterRadiusKm ?? res.radiusKm)*1000,color:style.color||"#ea580c",dashArray:"4 8",fill:false,weight:2}).addTo(layers.results); } else if(res.items[0]) { L.geoJSON(res.items[0].feature,{style:{color:style.color||"#7c2d12",fillColor:style.fillColor||"#fb923c",fillOpacity:style.fillOpacity??.25,weight:style.weight||2}}).addTo(layers.results); if(res.nearestPoint){ const c=res.nearestPoint.geometry.coordinates; L.polyline([[queryLat,queryLon],[c[1],c[0]]],{color:"#7c2d12",dashArray:"4 6"}).addTo(layers.results); } } }
let queryLat, queryLon;
(async function init(){ const params=new URLSearchParams(location.search); const lat=num(params,"lat"), lon=num(params,"lon"); queryLat=lat; queryLon=lon; const viewLat=num(params,"viewLat")??num(params,"mapCenterLat"), viewLon=num(params,"viewLon")??num(params,"mapCenterLon"), zoom=num(params,"zoom")??num(params,"mapZoom")??14, from=params.get("from"), basemap=(params.get("basemap")||"osm").toLowerCase()==="sat"?"sat":"osm"; const els={back:$("back-link"),status:$("card-status"),groups:$("geoquery-groups"),summary:$("executive-summary"),load:$("groups-load-status")}; if(els.back) els.back.href=validLatLon(lat,lon)?buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon):"../index.html"; [[$("card-lat"),lat?.toFixed(6)],[$("card-lon"),lon?.toFixed(6)],[$("card-site"),(params.get("site")||"geonoxa").toUpperCase()],[$("lat-decimal"),lat?.toFixed(6)],[$("lon-decimal"),lon?.toFixed(6)],[$("lat-dms"),Number.isFinite(lat)?dms(lat,"lat"):"—"],[$("lon-dms"),Number.isFinite(lon)?dms(lon,"lon"):"—"]].forEach(([e,v])=>{if(e)e.textContent=v||"—"}); if(!validLatLon(lat,lon)){ if(els.status) els.status.textContent="Coordenada inválida"; return; }
 const map=L.map("geoquery-map",{tap:true,scrollWheelZoom:true}); const mapEl=$("geoquery-map"); const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}); const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:"Tiles &copy; Esri"}); let currentBasemap=basemap; function setBasemapButtonActive(type){$("geoquery-osm-btn")?.classList.toggle("active",type==="osm");$("geoquery-sat-btn")?.classList.toggle("active",type==="sat");} function setBasemap(type){if(map.hasLayer(osm))map.removeLayer(osm);if(map.hasLayer(sat))map.removeLayer(sat);currentBasemap=type==="sat"?"sat":"osm";(currentBasemap==="sat"?sat:osm).addTo(map);setBasemapButtonActive(currentBasemap);if(window.geoQueryState){window.geoQueryState.basemap=currentBasemap;window.geoQueryState.mapState.basemap=currentBasemap;window.geoQueryState.queryContext.originalViewport.basemap=currentBasemap;if(els.back)els.back.href=buildReturnUrl(lat,lon,zoom,currentBasemap,viewLat,viewLon);}} const toggle=L.DomUtil.create("div","map-toggle"); toggle.innerHTML=`<button id="geoquery-osm-btn" class="map-toggle-btn" type="button" data-map="osm">OSM</button><button id="geoquery-sat-btn" class="map-toggle-btn" type="button" data-map="sat">SAT</button>`; mapEl?.appendChild(toggle); L.DomEvent.disableClickPropagation(toggle); L.DomEvent.disableScrollPropagation(toggle); toggle.querySelector('[data-map="osm"]')?.addEventListener("click",()=>setBasemap("osm")); toggle.querySelector('[data-map="sat"]')?.addEventListener("click",()=>setBasemap("sat")); setBasemap(currentBasemap); map.setView([lat,lon],zoom); const layers={results:L.featureGroup().addTo(map)}; L.circleMarker([lat,lon],{radius:7,weight:3,color:"#111827",fillColor:"#facc15",fillOpacity:.95}).bindPopup("Punto consultado").addTo(map); L.control.scale({metric:true,imperial:false}).addTo(map); setupMobileMapGesture(map, mapEl);
 const viewport=parseViewport(params); const registry=await fetchJson(new URL("listado.json",GEOQUERY_BASE_URL)); const entries=(registry.grupos||[]).filter(g=>g.activo).sort((a,b)=>(a.orden||0)-(b.orden||0)); const queryPoint=turf.point([lon,lat]); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Inicio análisis"); const groups=await Promise.all(entries.map(e=>analyzeGroupSafe(e,queryPoint,viewport))); const relavesGroup=groups.find(g=>g.cfg.id==="relaves"); const zonasGroup=groups.find(g=>g.cfg.id==="zonas"); const relavesResult=relavesGroup?.result; const zonasResult=zonasGroup?.result; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado relaves calculado", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado zonas calculado", zonasResult); window.geoQueryState={site:"geonoxa",queryContext:{site:"geonoxa",queryPoint:{lat,lon},originalViewport:{centerLat:viewLat,centerLon:viewLon,zoom,west:viewport?.west,south:viewport?.south,east:viewport?.east,north:viewport?.north,basemap:currentBasemap},from},status:"loading",executiveSummary:"",groupResults:{relaves:relavesResult,zonas:zonasResult},mapState:{basemap:currentBasemap,viewportSource:viewport?.source||"sin viewport"},exportState:{pdfEnabled:false,kmlEnabled:false},lat,lon,basemap:currentBasemap,originalViewport:viewport,groups}; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] relavesResult:", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] zonasResult:", zonasResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] groupResults:", window.geoQueryState?.groupResults); groups.forEach(g=>drawResult(map,layers,g)); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderAnalysisResults"); if(els.groups) { els.groups.replaceChildren(); const html=[]; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderRelavesPanels"); if(relavesGroup) { try { html.push(renderRelaves(relavesResult,relavesGroup.cfg,relavesGroup.meta)); } catch(error) { console.error("[GeoNOXA][relaves][render]", error); if(relavesResult) relavesResult.renderError = error; } } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderZonasPanels"); if(zonasGroup) { try { html.push(renderZonas(zonasResult,zonasGroup.cfg,zonasGroup.meta)); } catch(error) { console.error("[GeoNOXA][zonas][render]", error); if(zonasResult) zonasResult.renderError = error; } } els.groups.innerHTML=html.filter(Boolean).join(""); } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Antes de resumen ejecutivo"); const executiveSummary=buildExecutiveSummary({relavesResult,zonasResult}); if(els.summary) els.summary.textContent=executiveSummary; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de deriveOverallStatus"); const overallStatus=deriveOverallStatus(relavesResult,zonasResult); if(GEOQUERY_DEBUG) console.table({relavesStatus:relavesResult?.status,selectedCount:relavesResult?.selectedRelaves?.length,clusterRadiusKm:relavesResult?.clusterRadiusKm,dominantResource:relavesResult?.dominantResource,zonasStatus:zonasResult?.status,overallStatus:overallStatus?.label}); window.geoQueryState.status=overallStatus.code; window.geoQueryState.executiveSummary=executiveSummary; window.geoQueryState.exportState={pdfEnabled:groups.some(g=>g.result.status==="resolved"),kmlEnabled:groups.some(g=>g.result.status==="resolved")}; if(els.status){ els.status.textContent=overallStatus.label; els.status.classList.toggle("status-ok", overallStatus.code==="resolved"); els.status.classList.toggle("status-warning", overallStatus.code==="partial" || overallStatus.code==="empty"); els.status.classList.toggle("status-error", overallStatus.code==="error"); } if($("detail-status")) $("detail-status").textContent=overallStatus.label; if(layers.results.getLayers().length){ const b=layers.results.getBounds(); if(b.isValid()) map.fitBounds(b.pad(0.2),{maxZoom:14}); } if(els.load) els.load.textContent=GEOQUERY_DEBUG?`${groups.length} grupos cargados desde listado.json; análisis limitado al viewport original (${viewport?.source || "sin viewport"}).`:""; const tech=$("geoquery-technical-metadata"); if(tech) tech.hidden=!GEOQUERY_DEBUG; const downloads=$("geoquery-downloads-panel"); if(downloads) downloads.hidden=!groups.some(g=>g.result.status==="resolved"); setTimeout(()=>map.invalidateSize(),150); })().catch(err=>{ console.error("[GeoNOXA][init]", err); const s=$("card-status"); if(s){s.textContent="Error de análisis";s.classList.add("status-error");} const g=$("geoquery-groups"); if(g) g.innerHTML=`<section class="panel"><p class="placeholder-text">${escapeHtml(err.message)}</p></section>`; });
