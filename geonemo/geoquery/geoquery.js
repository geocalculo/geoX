const GEOQUERY_BASE = "../capas_geoquery";
const sourceCache = new Map();

function decimalToDMS(value, type) {
  const absolute = Math.abs(value);
  let degrees = Math.floor(absolute);
  const minutesFloat = (absolute - degrees) * 60;
  let minutes = Math.floor(minutesFloat);
  let seconds = Number(((minutesFloat - minutes) * 60).toFixed(2));
  if (seconds >= 60) { seconds = 0; minutes += 1; }
  if (minutes >= 60) { minutes = 0; degrees += 1; }
  const direction = type === "lat" ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "W");
  return `${degrees}° ${minutes}' ${seconds.toFixed(2)}" ${direction}`;
}

function isValidCoordinate(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function getZoomForApproxScale(lat, scaleDenominator = 20000) {
  const metersPerPixelTarget = scaleDenominator * 0.0254 / 96;
  const zoom = Math.log2((156543.03392 * Math.cos(lat * Math.PI / 180)) / metersPerPixelTarget);
  return Math.max(0, Math.min(20, zoom));
}

function getParam(params, key, fallback) { return params.get(key) || fallback; }

function buildReturnUrl(lat, lon, zoom, basemap, viewLat, viewLon) {
  if (lat === null || lon === null) return "../index.html";
  const backParams = new URLSearchParams({ from: "geoquery", lat: String(lat), lon: String(lon), zoom: zoom || "14", basemap: basemap || "osm" });
  if (viewLat && viewLon) { backParams.set("viewLat", viewLat); backParams.set("viewLon", viewLon); }
  return `../index.html?${backParams.toString()}`;
}

async function fetchJsonOnce(url) {
  if (!sourceCache.has(url)) {
    sourceCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }));
  }
  return sourceCache.get(url);
}

async function loadGroupRegistry() {
  const registry = await fetchJsonOnce(`${GEOQUERY_BASE}/listado.json`);
  return (registry.grupos || []).filter((g) => g.activo).sort((a, b) => (a.orden || 0) - (b.orden || 0));
}

async function loadGroupConfig(groupEntry) {
  const config = await fetchJsonOnce(`${GEOQUERY_BASE}/${groupEntry.config}`);
  config.__folder = groupEntry.carpeta;
  return config;
}

async function loadGroupSources(groupConfig) {
  const sources = await Promise.all((groupConfig.archivos || []).map(async (sourceConfig) => {
    const url = `${GEOQUERY_BASE}/${groupConfig.__folder}/${sourceConfig.archivo}`;
    const geojson = await fetchJsonOnce(url);
    if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) throw new Error(`GeoJSON inválido: ${sourceConfig.archivo}`);
    return { sourceConfig, geojson };
  }));
  return sources;
}

function firstValue(properties, names) {
  for (const name of names || []) {
    const value = properties ? properties[name] : null;
    if (value !== null && value !== undefined && String(value).trim() !== "") return value;
  }
  return null;
}

function normalizeAreaToHectares(value) {
  const original = value;
  if (value === null || value === undefined || String(value).trim() === "") return { original, value: null, unit: "ha" };
  if (typeof value === "number") return { original, value, unit: "ha" };
  let text = String(value).trim().replace(/\s*(ha|hect[aá]reas?)\s*/ig, "").replace(/\s/g, "");
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) text = text.replace(/\./g, "").replace(",", ".");
  else if (hasComma) text = text.replace(",", ".");
  const parsed = Number.parseFloat(text.replace(/[^0-9.-]/g, ""));
  return { original, value: Number.isFinite(parsed) ? parsed : null, unit: "ha" };
}

function stableText(value) { return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " "); }

function buildDedupKey(groupConfig, properties) {
  if (groupConfig.id !== "snaspe") return null;
  return (groupConfig.deduplicacion || []).map((field) => stableText(properties[field])).join("|");
}

function normalizeGroupFeature(groupId, feature, sourceConfig, groupConfig, index) {
  const props = feature.properties || {};
  const fields = groupConfig.campos || {};
  const id = firstValue(props, fields.id) ?? `${sourceConfig.id}-${index}`;
  const areaHa = normalizeAreaToHectares(firstValue(props, fields.superficie));
  const common = {
    groupId, sourceId: sourceConfig.id, sourceFile: sourceConfig.archivo, sourceSubtype: sourceConfig.subtipo,
    featureId: id, dedupKey: buildDedupKey(groupConfig, props), originalProperties: props, geometry: feature.geometry,
    feature: { type: "Feature", properties: props, geometry: feature.geometry }, areaHa
  };
  if (groupId === "snaspe") {
    return { ...common, name: firstValue(props, fields.nombre), alternateName: firstValue(props, fields.nombre_alternativo), category: firstValue(props, fields.categoria), region: firstValue(props, fields.region), territory: firstValue(props, fields.territorio), decree: firstValue(props, fields.decreto), issuer: firstValue(props, fields.emisor), condition: firstValue(props, fields.condicion), propertyType: firstValue(props, fields.tipo_propiedad), plan: firstValue(props, fields.plano) };
  }
  if (groupId === "ramsar") {
    return { ...common, name: firstValue(props, fields.nombre), type: firstValue(props, fields.tipo), region: firstValue(props, fields.region), province: firstValue(props, fields.provincia), commune: firstValue(props, fields.comuna), decree: firstValue(props, fields.decreto) };
  }
  return { ...common, name: firstValue(props, fields.nombre) || `Feature ${id}` };
}

function deduplicateFeatures(groupConfig, features) {
  if (groupConfig.id !== "snaspe") return features;
  const best = new Map();
  const rank = { snaspe_sub10k: 3, snaspe_xl_continental: 2, snaspe_xl_mar: 2 };
  for (const f of features) {
    const key = f.dedupKey || `${f.sourceId}:${f.featureId}`;
    const previous = best.get(key);
    if (!previous || (rank[f.sourceId] || 0) > (rank[previous.sourceId] || 0)) best.set(key, f);
  }
  return [...best.values()];
}


function parseOriginalViewport(params) {
  const west = Number.parseFloat(params.get("viewWest"));
  const south = Number.parseFloat(params.get("viewSouth"));
  const east = Number.parseFloat(params.get("viewEast"));
  const north = Number.parseFloat(params.get("viewNorth"));
  const complete = [west, south, east, north].every(Number.isFinite);
  if (!complete || west >= east || south >= north || south < -90 || north > 90 || west < -180 || east > 180) {
    console.warn("[GeoQuery GeoNEMO] viewport original incompleto o inválido; se evita búsqueda nacional para SNASPE/Ramsar.", { west, south, east, north });
    return null;
  }
  return { west, south, east, north, bbox: [west, south, east, north], polygon: turf.bboxPolygon([west, south, east, north]) };
}

function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function filterFeaturesByViewport(features, originalViewport, groupConfig) {
  if (!originalViewport) return [];
  return features.filter((item) => {
    try {
      const featureBbox = turf.bbox(item.feature);
      if (!bboxIntersects(featureBbox, originalViewport.bbox)) return false;
      return turf.booleanIntersects(item.feature, originalViewport.polygon);
    } catch (error) {
      console.warn("[GeoQuery GeoNEMO] no se pudo confirmar intersección con viewport", groupConfig.id, item.sourceFile, error);
      return false;
    }
  });
}

function buildGroupMetadata(groupConfig, totals, result) {
  return {
    groupId: groupConfig.id,
    totalLoaded: totals.totalLoaded,
    totalNormalized: totals.totalNormalized,
    totalInViewport: totals.totalInViewport,
    evaluatedCandidates: totals.totalInViewport,
    relatedFeature: result.feature?.featureId ?? null,
    relationType: result.relation || result.status
  };
}

function featureBboxDistanceKm(point, bbox) {
  const [lon, lat] = point.geometry.coordinates;
  if (lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3]) return 0;
  const clampedLon = Math.max(bbox[0], Math.min(lon, bbox[2]));
  const clampedLat = Math.max(bbox[1], Math.min(lat, bbox[3]));
  return turf.distance(point, turf.point([clampedLon, clampedLat]), { units: "kilometers" });
}

function perimeterLine(feature) { return turf.polygonToLine(feature); }

function lineFeatures(feature) {
  const line = perimeterLine(feature);
  if (line.type === "FeatureCollection") return line.features || [];
  return [line];
}

function nearestPointOnFeaturePerimeter(feature, queryPoint) {
  let best = null;
  for (const line of lineFeatures(feature)) {
    const snap = turf.nearestPointOnLine(line, queryPoint, { units: "kilometers" });
    const distanceKm = turf.distance(queryPoint, snap, { units: "kilometers" });
    if (!best || distanceKm < best.distanceKm) best = { snap, distanceKm };
  }
  return best;
}

function perimeterLengthKm(feature) {
  return lineFeatures(feature).reduce((sum, line) => sum + turf.length(line, { units: "kilometers" }), 0);
}

function resolveGroupSpatialRelation(queryPoint, normalizedFeatures, groupConfig) {
  if (!normalizedFeatures.length) return { groupConfig, status: "empty", feature: null };
  for (const item of normalizedFeatures) {
    try { if (turf.booleanPointInPolygon(queryPoint, item.feature)) return buildResolvedResult(groupConfig, item, "intersects", null); }
    catch (error) { console.warn("No se pudo evaluar intersección", groupConfig.id, item.sourceFile, error); }
  }
  let nearest = null;
  for (const item of normalizedFeatures) {
    try {
      const nearestOnPerimeter = nearestPointOnFeaturePerimeter(item.feature, queryPoint);
      if (nearestOnPerimeter && (!nearest || nearestOnPerimeter.distanceKm < nearest.distanceKm)) {
        nearest = { item, snap: nearestOnPerimeter.snap, distanceKm: nearestOnPerimeter.distanceKm };
      }
    } catch (error) { console.warn("No se pudo evaluar nearest", groupConfig.id, item.sourceFile, error); }
  }
  return nearest ? buildResolvedResult(groupConfig, nearest.item, "nearest", nearest) : { groupConfig, status: "empty", feature: null };
}

function buildResolvedResult(groupConfig, item, relation, nearest) {
  const areaSqm = turf.area(item.feature);
  const perimeterKm = perimeterLengthKm(item.feature);
  const areaHaCalc = areaSqm / 10000;
  const equivalentDiameterKm = 2 * Math.sqrt((areaSqm / 1000000) / Math.PI);
  const equivalentPerimeterKm = Math.PI * equivalentDiameterKm;
  return { groupConfig, status: "resolved", relation, feature: item, distanceKm: nearest?.distanceKm ?? null, nearestPoint: nearest?.snap ?? null, metrics: { areaHaCalc, perimeterKm, equivalentDiameterKm, equivalentPerimeterKm } };
}

function formatDistance(km) { return km === null ? "No aplica" : (km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`); }
function formatNumber(n, d = 2) { return Number.isFinite(n) ? n.toLocaleString("es-CL", { maximumFractionDigits: d }) : "—"; }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c])); }
function rows(items) { return `<dl class="details">${items.filter(([,v]) => v !== null && v !== undefined && v !== "").map(([k,v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`; }

function relationLabel(result) {
  if (result.groupConfig.id === "snaspe") return result.relation === "intersects" ? "Dentro del área SNASPE" : "Área SNASPE más cercana dentro del viewport";
  if (result.groupConfig.id === "ramsar") return result.relation === "intersects" ? "Dentro de un sitio Ramsar" : "Sitio Ramsar más cercano dentro del viewport";
  return result.relation;
}

function renderGroupSection(groupResult) {
  const cfg = groupResult.groupConfig;
  if (groupResult.status !== "resolved") {
    const emptyMessage = cfg.id === "snaspe"
      ? "No existen áreas SNASPE presentes en el viewport consultado"
      : cfg.id === "ramsar"
        ? "No existen sitios Ramsar presentes en el viewport consultado"
        : "No se encontraron geometrías válidas para este grupo.";
    return `<section class="panel group-section"><div class="group-header"><div><h2>Grupo ${escapeHtml(cfg.nombre)}</h2><p class="placeholder-text">${groupResult.status === "error" ? `No fue posible cargar temporalmente el grupo ${escapeHtml(cfg.nombre)}.` : emptyMessage}</p></div><span class="status-pill">${escapeHtml(groupResult.status)}</span></div></section>`;
  }
  const f = groupResult.feature;
  const isSnaspe = cfg.id === "snaspe";
  const featureRows = isSnaspe ? [["Tipo de relación", relationLabel(groupResult)], ["Nombre", f.name], ["Categoría", f.category], ["Región", f.region], ["Territorio", f.territory]] : [["Tipo de relación", relationLabel(groupResult)], ["Nombre del sitio", f.name], ["Tipo", f.type], ["Región", f.region], ["Provincia", f.province], ["Comuna", f.commune]];
  const metaRows = isSnaspe ? [["Nombre oficial", f.name], ["Nombre alternativo", f.alternateName], ["Categoría", f.category], ["Decreto", f.decree], ["Emisor", f.issuer], ["Región", f.region], ["Territorio", f.territory], ["Fuente", cfg.nombre_largo], ["Archivo de origen", f.sourceFile], ["Subtipo", f.sourceSubtype]] : [["Nombre", f.name], ["Tipo", f.type], ["Región", f.region], ["Provincia", f.province], ["Comuna", f.commune], ["Decreto", f.decree], ["Superficie oficial", f.areaHa.value === null ? f.areaHa.original : `${formatNumber(f.areaHa.value)} ha`], ["Fuente", cfg.nombre_largo], ["Archivo de origen", f.sourceFile]];
  return `<section class="panel group-section" id="group-${cfg.id}"><div class="group-header"><div><h2>Grupo ${escapeHtml(cfg.nombre)}</h2><p class="placeholder-text">${escapeHtml(cfg.nombre_largo)}</p></div><span class="status-pill">${relationLabel(groupResult)}</span></div><div class="group-grid"><div class="subpanel"><h4>Feature relacionada</h4>${rows(featureRows)}</div><div class="subpanel"><h4>Descriptores geométricos</h4>${rows([["Superficie oficial", f.areaHa.value === null ? f.areaHa.original : `${formatNumber(f.areaHa.value)} ha`], ["Superficie calculada", `${formatNumber(groupResult.metrics.areaHaCalc)} ha`], ["Perímetro", `${formatNumber(groupResult.metrics.perimeterKm)} km`], ["Diámetro equivalente", `${formatNumber(groupResult.metrics.equivalentDiameterKm)} km`], ["Perímetro equivalente", `${formatNumber(groupResult.metrics.equivalentPerimeterKm)} km`]])}</div><div class="subpanel"><h4>Indicadores de relación espacial</h4>${rows([["Tipo de relación", relationLabel(groupResult)], ["Distancia mínima al perímetro", formatDistance(groupResult.distanceKm)], ["Método", groupResult.relation === "nearest" ? "Punto más cercano sobre el perímetro real" : "Intersección punto-polígono"]])}</div><div class="subpanel"><h4>Metadata ${escapeHtml(cfg.nombre)}</h4>${rows(metaRows)}</div></div></section>`;
}

function styleForGroup(groupId) {
  return groupId === "snaspe" ? { color: "#047857", fillColor: "#10b981", weight: 3, fillOpacity: 0.22 } : { color: "#0f766e", fillColor: "#2dd4bf", weight: 3, fillOpacity: 0.18, dashArray: "7 5" };
}

function addGroupResultToMap(groupResult, layers, queryLatLon, boundsParts) {
  if (groupResult.status !== "resolved") return;
  const groupId = groupResult.groupConfig.id;
  const targetLayer = groupId === "snaspe" ? layers.snaspeResultLayer : layers.ramsarResultLayer;
  const geoLayer = L.geoJSON(groupResult.feature.feature, { style: styleForGroup(groupId) }).bindPopup(`${groupResult.groupConfig.nombre}: ${groupResult.feature.name || "Sin nombre"}`).addTo(targetLayer);
  boundsParts.push(geoLayer);
  if (groupResult.relation === "nearest" && groupResult.nearestPoint) {
    const p = groupResult.nearestPoint.geometry.coordinates;
    const line = L.polyline([queryLatLon, [p[1], p[0]]], { color: groupId === "snaspe" ? "#065f46" : "#0e7490", weight: 3, dashArray: "4 6" }).addTo(layers.relationLinesLayer);
    line.bindTooltip(`${groupResult.groupConfig.nombre}: ${formatDistance(groupResult.distanceKm)}`, { permanent: true, direction: "center", className: "relation-label" });
    L.circleMarker([p[1], p[0]], { radius: 5, color: "#111827", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(layers.relationLabelsLayer);
    boundsParts.push(line);
  }
}

function buildExecutiveSummary(results) {
  const resolved = results.filter((r) => r.status === "resolved");
  if (!resolved.length) return "No fue posible resolver grupos temáticos para el punto consultado.";
  const parts = resolved.map((r) => r.relation === "intersects" ? `el punto se encuentra dentro de ${r.groupConfig.nombre}: ${r.feature.name || "sin nombre"}` : `en ${r.groupConfig.nombre}, la figura más cercana es ${r.feature.name || "sin nombre"}, a ${formatDistance(r.distanceKm)}`);
  return `Resultado independiente por grupo: ${parts.join("; ")}.`;
}

function setupMobileMapGesture(map, mapEl) {
  const hint = document.createElement("div");
  hint.className = "map-touch-hint";
  hint.textContent = "Usa dos dedos para mover el mapa";
  mapEl.appendChild(hint);
  const isCoarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  if (!isCoarse) return;
  map.dragging.disable();
  mapEl.addEventListener("touchstart", (event) => {
    if (event.touches.length >= 2) map.dragging.enable();
    else { map.dragging.disable(); hint.classList.add("visible"); window.clearTimeout(hint.__timer); hint.__timer = window.setTimeout(() => hint.classList.remove("visible"), 1300); }
  }, { passive: true });
  mapEl.addEventListener("touchend", () => map.dragging.disable(), { passive: true });
}

async function processGroup(entry, queryPoint, originalViewport) {
  try {
    const groupConfig = await loadGroupConfig(entry);
    const sources = await loadGroupSources(groupConfig);
    const totalLoaded = sources.reduce((sum, { geojson }) => sum + (geojson.features?.length || 0), 0);
    const normalized = [];
    sources.forEach(({ sourceConfig, geojson }) => geojson.features.forEach((feature, index) => { if (feature?.geometry) normalized.push(normalizeGroupFeature(groupConfig.id, feature, sourceConfig, groupConfig, index)); }));
    const unique = deduplicateFeatures(groupConfig, normalized);
    const inViewport = filterFeaturesByViewport(unique, originalViewport, groupConfig);
    const result = resolveGroupSpatialRelation(queryPoint, inViewport, groupConfig);
    result.metadata = buildGroupMetadata(groupConfig, { totalLoaded, totalNormalized: unique.length, totalInViewport: inViewport.length }, result);
    return result;
  } catch (error) {
    console.error("Error controlado al cargar grupo GeoNEMO", entry.id, error);
    return { groupConfig: { id: entry.id, nombre: entry.nombre, nombre_largo: entry.nombre }, status: "error", feature: null, metadata: { groupId: entry.id, relationType: "error" } };
  }
}

(function initGeoQuery() {
  const params = new URLSearchParams(window.location.search);
  const lat = Number.parseFloat(params.get("lat"));
  const lon = Number.parseFloat(params.get("lon"));
  const site = getParam(params, "site", "geonemo");
  const basemapParam = (getParam(params, "basemap", "osm") || "osm").toLowerCase();
  let currentBasemap = basemapParam === "sat" ? "sat" : "osm";
  const zoomFromIndex = getParam(params, "zoom", getParam(params, "mapZoom", "14"));
  const viewLat = getParam(params, "viewLat", getParam(params, "mapCenterLat", null));
  const viewLon = getParam(params, "viewLon", getParam(params, "mapCenterLon", null));
  const originalViewport = parseOriginalViewport(params);
  const valid = isValidCoordinate(lat, lon);
  const elements = {
    cardLat: document.getElementById("card-lat"), cardLon: document.getElementById("card-lon"), cardSite: document.getElementById("card-site"), cardStatus: document.getElementById("card-status"), latDecimal: document.getElementById("lat-decimal"), lonDecimal: document.getElementById("lon-decimal"), latDms: document.getElementById("lat-dms"), lonDms: document.getElementById("lon-dms"), detailStatus: document.getElementById("detail-status"), invalidMessage: document.getElementById("invalid-message"), detailsPanel: document.getElementById("details-panel"), backLink: document.getElementById("back-link"), visualCaption: document.getElementById("visual-caption"), groups: document.getElementById("geoquery-groups"), summary: document.getElementById("executive-summary"), loadStatus: document.getElementById("groups-load-status")
  };
  elements.cardSite.textContent = site;
  if (!valid) { elements.cardStatus.textContent = "Sin coordenada"; elements.cardStatus.classList.add("status-error"); elements.invalidMessage.hidden = false; elements.detailsPanel.hidden = true; elements.backLink.href = "../index.html"; return; }
  const latDecimal = lat.toFixed(6); const lonDecimal = lon.toFixed(6); const latDms = decimalToDMS(lat, "lat"); const lonDms = decimalToDMS(lon, "lon"); const targetZoom = getZoomForApproxScale(lat, 20000);
  window.geoQueryState = { site, lat, lon, lat_decimal: latDecimal, lon_decimal: lonDecimal, lat_dms: latDms, lon_dms: lonDms, view_lat: viewLat, view_lon: viewLon, original_viewport: originalViewport ? { west: originalViewport.west, south: originalViewport.south, east: originalViewport.east, north: originalViewport.north } : null, crs: "WGS84 / EPSG:4326", source: "url_params", basemap: currentBasemap, zoom_from_index: zoomFromIndex, map_reference_scale: "1:20.000", map_reference_zoom: targetZoom, timestamp: new Date().toISOString(), groupResults: [], groupMetadata: [] };
  elements.cardLat.textContent = latDecimal; elements.cardLon.textContent = lonDecimal; elements.cardStatus.textContent = "Analizando"; elements.cardStatus.classList.add("status-ok"); elements.latDecimal.textContent = latDecimal; elements.lonDecimal.textContent = lonDecimal; elements.latDms.textContent = latDms; elements.lonDms.textContent = lonDms; elements.detailStatus.textContent = "analizando grupos temáticos"; elements.visualCaption.textContent = `Punto consultado: ${latDecimal}, ${lonDecimal}`;

  const geoQueryMap = L.map("geoquery-map", { zoomControl: true, zoomSnap: 0.25, zoomDelta: 0.25 });
  const osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "&copy; OpenStreetMap" });
  const satLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 20, attribution: "Tiles &copy; Esri" });
  const toggle = L.DomUtil.create("div", "map-toggle");
  toggle.innerHTML = `<button id="geoquery-osm-btn" class="map-toggle-btn" type="button" data-map="osm">OSM</button><button id="geoquery-sat-btn" class="map-toggle-btn" type="button" data-map="sat">SAT</button>`;
  document.getElementById("geoquery-map").appendChild(toggle); L.DomEvent.disableClickPropagation(toggle); L.DomEvent.disableScrollPropagation(toggle);
  function updateReturnLink() { elements.backLink.href = buildReturnUrl(lat, lon, zoomFromIndex || "14", currentBasemap, viewLat, viewLon); }
  function setBasemapButtonActive(type) { document.getElementById("geoquery-osm-btn")?.classList.toggle("active", type === "osm"); document.getElementById("geoquery-sat-btn")?.classList.toggle("active", type === "sat"); }
  function setBasemap(type) { if (geoQueryMap.hasLayer(osmLayer)) geoQueryMap.removeLayer(osmLayer); if (geoQueryMap.hasLayer(satLayer)) geoQueryMap.removeLayer(satLayer); (type === "sat" ? satLayer : osmLayer).addTo(geoQueryMap); currentBasemap = type === "sat" ? "sat" : "osm"; setBasemapButtonActive(currentBasemap); window.geoQueryState.basemap = currentBasemap; updateReturnLink(); }
  toggle.querySelector('[data-map="osm"]').addEventListener("click", () => setBasemap("osm")); toggle.querySelector('[data-map="sat"]').addEventListener("click", () => setBasemap("sat"));
  setBasemap(currentBasemap);
  const layers = { snaspeResultLayer: L.layerGroup().addTo(geoQueryMap), ramsarResultLayer: L.layerGroup().addTo(geoQueryMap), relationLinesLayer: L.layerGroup().addTo(geoQueryMap), queryPointLayer: L.layerGroup().addTo(geoQueryMap), relationLabelsLayer: L.layerGroup().addTo(geoQueryMap) };
  const queryMarker = L.circleMarker([lat, lon], { radius: 7, weight: 3, color: "#064e3b", fillColor: "#facc15", fillOpacity: 0.95 }).bindPopup("Punto consultado").addTo(layers.queryPointLayer);
  L.control.scale({ position: "bottomleft", metric: true, imperial: false, maxWidth: 120 }).addTo(geoQueryMap);
  const legend = L.control({ position: "bottomright" }); legend.onAdd = () => { const div = L.DomUtil.create("div", "map-legend"); div.innerHTML = '<div><span class="legend-swatch" style="background:#10b981"></span>SNASPE</div><div><span class="legend-swatch" style="background:#2dd4bf"></span>Ramsar</div>'; return div; }; legend.addTo(geoQueryMap);
  setupMobileMapGesture(geoQueryMap, document.getElementById("geoquery-map"));
  geoQueryMap.setView([lat, lon], targetZoom, { animate: false }); updateReturnLink();

  (async () => {
    const queryPoint = turf.point([lon, lat]);
    const entries = await loadGroupRegistry();
    const results = await Promise.all(entries.map((entry) => processGroup(entry, queryPoint, originalViewport)));
    window.geoQueryState.groupResults = results;
    window.geoQueryState.groupMetadata = results.map((result) => result.metadata).filter(Boolean);
    console.log("[GeoQuery GeoNEMO] metadata viewport por grupo", window.geoQueryState.groupMetadata);
    elements.groups.innerHTML = results.map(renderGroupSection).join("");
    elements.summary.textContent = buildExecutiveSummary(results);
    elements.loadStatus.textContent = results.map((r) => `${r.groupConfig.nombre}: ${r.status} (${r.metadata?.totalInViewport ?? 0} en viewport)`).join(" | ");
    elements.cardStatus.textContent = "Resuelto"; elements.detailStatus.textContent = "análisis territorial resuelto por grupos";
    const boundsParts = [queryMarker];
    results.forEach((result) => addGroupResultToMap(result, layers, [lat, lon], boundsParts));
    setTimeout(() => { geoQueryMap.invalidateSize(); const bounds = L.featureGroup(boundsParts).getBounds(); if (bounds.isValid()) geoQueryMap.fitBounds(bounds.pad(0.12), { maxZoom: 14, padding: window.innerWidth <= 560 ? [22, 22] : [36, 36], animate: false }); else geoQueryMap.setView([lat, lon], targetZoom, { animate: false }); }, 150);
  })().catch((error) => { console.error("Error al inicializar GeoQuery GeoNEMO", error); elements.summary.textContent = "No fue posible cargar temporalmente el registro de grupos de GeoNEMO."; elements.cardStatus.textContent = "Error"; });
})();
