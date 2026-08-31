(function (root, factory) {
  const api = factory(root.turf);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GeoNoxaSpatialEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (turf) {
  "use strict";

  function num(params, key) { const v = Number(params.get(key)); return Number.isFinite(v) ? v : null; }
  function validLatLon(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
  function field(props, names) { for (const n of names || []) { const v = props?.[n]; if (v !== null && v !== undefined && String(v).trim() !== "") return v; } return null; }
  function normText(v) { return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function cleanText(v) { const text = String(v ?? "").replace(/\s+/g, " ").trim(); return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null; }

function parseViewport(params) { const west=num(params,"viewWest"), south=num(params,"viewSouth"), east=num(params,"viewEast"), north=num(params,"viewNorth"); if ([west,south,east,north].every(Number.isFinite) && west < east && south < north) return { west,south,east,north,bbox:[west,south,east,north], polygon:turf.bboxPolygon([west,south,east,north]), source:"url_bbox"}; const lat=num(params,"viewLat")??num(params,"mapCenterLat")??num(params,"lat"), lon=num(params,"viewLon")??num(params,"mapCenterLon")??num(params,"lon"), z=num(params,"zoom")??num(params,"mapZoom")??14; if(!validLatLon(lat,lon)) return null; const scale=256*2**Math.max(0,Math.min(20,z)), lonPx=360/scale, latPx=lonPx/Math.max(.15,Math.cos(lat*Math.PI/180)); return {west:lon-640*lonPx,east:lon+640*lonPx,south:lat-360*latPx,north:lat+360*latPx,source:"fallback_center_zoom"}; }
function featureIntersectsViewport(feature, viewport) { if (!viewport || !feature?.geometry) return false; try { return turf.booleanIntersects(feature, viewport.polygon || turf.bboxPolygon([viewport.west,viewport.south,viewport.east,viewport.north])); } catch { try { const b=turf.bbox(feature); return !(b[2] < viewport.west || b[0] > viewport.east || b[3] < viewport.south || b[1] > viewport.north); } catch { return false; } } }
function pointCoords(feature, props, cfg) { const c = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null; if (Array.isArray(c) && validLatLon(Number(c[1]), Number(c[0]))) return [Number(c[0]), Number(c[1])]; const lon = Number(field(props, cfg.campos?.longitud)); const lat = Number(field(props, cfg.campos?.latitud)); return validLatLon(lat, lon) ? [lon, lat] : null; }
function normalizeRelave(feature, layer, cfg, i) { const p=feature.properties||{}, c=pointCoords(feature,p,cfg); const res=field(p,cfg.campos.recurso); return {groupId:"relaves",sourceFile:layer.archivo,layerId:layer.id,featureId:field(p,cfg.campos.id)??`${layer.id}-${i}`,idRelave:field(p,cfg.campos.id),company:field(p,cfg.campos.empresa),siteName:field(p,cfg.campos.faena),depositType:field(p,cfg.campos.tipo_deposito),resourceOriginal:res,resourceNormalized:normText(res),commune:field(p,cfg.campos.comuna),areaM2:field(p,cfg.campos.area_m2),constructionMethod:field(p,cfg.campos.metodo_constructivo),coordinates:c,originalProperties:p,feature:{type:"Feature",properties:p,geometry:feature.geometry}}; }
function pollutant(p,cfg){ const rule=cfg.regla_contaminante||{}, ignore=(rule.ignorar||[]).map(v=>v===null?null:normText(v)); for(const key of [rule.principal,rule.fallback]) { const v=p?.[key]; if(v!==null&&v!==undefined&&!ignore.includes(normText(v))) return v; } return "Sin contaminante informado"; }
function normalizeZona(feature, layer, cfg, i) { const p=feature.properties||{}; return {groupId:"zonas",sourceFile:layer.archivo,layerId:layer.id,featureId:field(p,cfg.campos.id)??`${layer.id}-${i}`,name:field(p,cfg.campos.nombre),condition:field(p,cfg.campos.condicion),pollutant:pollutant(p,cfg),saturatedValue:field(p,cfg.campos.saturado),latentValue:field(p,cfg.campos.latente),decree:field(p,cfg.campos.decreto),link:field(p,cfg.campos.link),regionCode:field(p,cfg.campos.region),officialArea:field(p,cfg.campos.superficie),originalProperties:p,feature:{type:"Feature",properties:p,geometry:feature.geometry}}; }
function nearestOnBoundary(feature, queryPoint) { const line = turf.polygonToLine(feature); const snap = turf.nearestPointOnLine(line, queryPoint, {units:"kilometers"}); return { snap, distanceKm: snap.properties.dist }; }
function buildRelavesResult(selectedRelaves, rules) {
  const clusterRadiusKm = selectedRelaves.at(-1)?.distanceKm ?? null;
  const dominant = dominantResource(selectedRelaves);
  selectedRelaves.forEach((relave, index) => { relave.rank = relave.rank || index + 1; relave.isDominantResource = Boolean(dominant && normText(cleanText(relave.resourceOriginal)) === normText(dominant.resource)); });
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
function analyzeZonas(items, queryPoint) { const containing=[]; for(const item of items){ try{ if(turf.booleanPointInPolygon(queryPoint,item.feature)) containing.push(item); }catch{} } if(containing.length) return {groupId:"zonas",status:"resolved",relation:"intersects",relationType:"intersects",items:containing,relatedFeature:containing[0]?.feature,distanceKm:0,minimumDistanceKm:null}; let nearest=null; for(const item of items){ try{ const n=nearestOnBoundary(item.feature,queryPoint); if(!nearest||n.distanceKm<nearest.distanceKm) nearest={...item,...n}; }catch{} } return nearest ? {groupId:"zonas",status:"resolved",relation:"nearest",relationType:"nearest",items:[nearest],relatedFeature:nearest.feature,distanceKm:nearest.distanceKm,minimumDistanceKm:nearest.distanceKm,nearestPoint:nearest.snap} : {groupId:"zonas",status:"empty",relation:"none",relationType:"none",items:[]}; }
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

  return Object.freeze({
    parseViewport,
    featureIntersectsViewport,
    pointCoords,
    normalizeRelave,
    pollutant,
    normalizeZona,
    nearestOnBoundary,
    buildRelavesResult,
    analyzeRelaves,
    analyzeZonas,
    dominantResource,
    dominantResourceRelaves,
    pairDistanceStats,
    pointDistanceStats
  });
});
