/* GeoQuery 2.0 GeoNEMO. Este módulo es independiente de GeoQuery productivo. */
const GROUP_COLORS = ["#16835f", "#0b9c9c", "#4169a9", "#a563c1", "#dc8a27", "#7c755b", "#d05b76"];
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);

function viewportParamsFromNavigation() {
  const direct = readOriginalViewport(params);
  if (direct) return direct;
  const states = [history.state?.geoQueryOrigin];
  try { states.push(JSON.parse(sessionStorage.getItem("geox:geonemo:geoquery-origin") || "null")); } catch (error) { console.warn("GeoNEMO: estado de navegación inválido", error); }
  for (const state of states) {
    const viewport = readOriginalViewport(state?.map?.bounds || state?.bounds);
    if (viewport) return viewport;
  }
  console.warn("GeoNEMO: viewport original ausente o inválido; se omite la búsqueda ambiental nacional");
  return null;
}

const originalViewport = viewportParamsFromNavigation();
const expandedViewport = originalViewport ? clampExpandedViewport(expandViewportByFactor(originalViewport, 2)) : null;
const expandedViewportPolygon = expandedViewport ? viewportToPolygon(expandedViewport) : null;
const expandedViewportBbox = expandedViewport ? [expandedViewport.west, expandedViewport.south, expandedViewport.east, expandedViewport.north] : null;
console.info("GeoNEMO viewport original", originalViewport);
console.info("GeoNEMO viewport ampliado x2", expandedViewport);

function finiteParam(...names) {
  for (const name of names) {
    const raw = params.get(name);
    if (raw !== null && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  }
  return null;
}

const latitude = finiteParam("lat", "queryLat") ?? -33.45;
const longitude = finiteParam("lon", "queryLon") ?? -70.66;
const validPoint = latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
const poi = turf.point([longitude, latitude]);
let results = [];
const sourceEntityKeys = new Set();
const viewportEntityKeys = new Set();
const groupMaps = [];
let loadedGroupCount = 0;
let sourceWarningCount = 0;

function buildReturnUrl() {
  const back = new URLSearchParams(params);
  back.set("lat", String(latitude));
  back.set("lon", String(longitude));
  back.set("queryLat", params.get("queryLat") || String(latitude));
  back.set("queryLon", params.get("queryLon") || String(longitude));
  if (!back.has("viewLat") && back.has("mapCenterLat")) back.set("viewLat", back.get("mapCenterLat"));
  if (!back.has("viewLon") && back.has("mapCenterLon")) back.set("viewLon", back.get("mapCenterLon"));
  if (!back.has("zoom") && back.has("mapZoom")) back.set("zoom", back.get("mapZoom"));
  return `../index.html?${back.toString()}`;
}

$("back-link").href = buildReturnUrl();
$("latitude").textContent = latitude.toFixed(6);
$("longitude").textContent = longitude.toFixed(6);
$("site").textContent = params.get("site") || "GeoNEMO";
$("point-source").textContent = params.get("site") || "GeoNEMO";
$("decimal-coordinates").textContent = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

function decimalToDms(value, axis) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minuteValue = (absolute - degrees) * 60;
  const minutes = Math.floor(minuteValue);
  const seconds = (minuteValue - minutes) * 60;
  const direction = axis === "lat" ? (value >= 0 ? "N" : "S") : (value >= 0 ? "E" : "O");
  return `${degrees}° ${minutes}′ ${seconds.toFixed(2)}″ ${direction}`;
}
$("dms-coordinates").textContent = `${decimalToDms(latitude, "lat")} · ${decimalToDms(longitude, "lon")}`;

function first(properties, fields) {
  for (const field of fields || []) {
    const value = properties?.[field];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return null;
}

function entityKey(feature, group, layer, index) {
  const properties = feature.properties || {};
  const explicitId = first(properties, group.id === "snaspe" ? ["ID_CATASTR"] : group.id === "ramsar" ? ["Id"] : ["id", "ID", "Id", "OBJECTID", "objectid", "fid"]);
  const name = first(properties, group.id === "snaspe" ? ["NOMBRE_TOT"] : group.id === "ramsar" ? ["Nombre"] : ["nombre", "Nombre", "NOMBRE", ...(layer.campos_nombre || [])]);
  /* El archivo no forma parte de la identidad: una misma entidad publicada en dos capas se cuenta una vez. */
  return explicitId !== null ? `${group.id}:id:${explicitId}` : `${group.id}:entity:${name || JSON.stringify(feature.geometry) || index}`;
}

function mergeEntityFeatures(entries) {
  const firstEntry = entries[0];
  const polygons = [];
  for (const { feature } of entries) {
    if (feature.geometry?.type === "Polygon") polygons.push(feature.geometry.coordinates);
    else if (feature.geometry?.type === "MultiPolygon") polygons.push(...feature.geometry.coordinates);
  }
  if (!polygons.length) return null;
  return {
    type: "Feature",
    properties: firstEntry.feature.properties || {},
    geometry: polygons.length === 1 ? { type: "Polygon", coordinates: polygons[0] } : { type: "MultiPolygon", coordinates: polygons }
  };
}

function safePolygonLines(feature) {
  try {
    if (!["Polygon", "MultiPolygon"].includes(feature?.geometry?.type)) return [];
    return turf.flatten(turf.polygonToLine(feature)).features;
  } catch (error) {
    console.warn("Geometría poligonal inválida omitida", error);
    return [];
  }
}

function measureFeature(feature, group, config, layer, diameterKm) {
  const lines = safePolygonLines(feature);
  if (!lines.length) return null;
  let nearest = null;
  for (const line of lines) {
    try {
      const candidate = turf.nearestPointOnLine(line, poi, { units: "kilometers" });
      if (!nearest || candidate.properties.dist < nearest.properties.dist) nearest = candidate;
    } catch (error) { console.warn("No fue posible medir un borde", error); }
  }
  if (!nearest || !Number.isFinite(nearest.properties.dist)) return null;
  let inside = false;
  try { inside = turf.booleanPointInPolygon(poi, feature); } catch (error) { console.warn("No fue posible comprobar contención", error); }

  /* La geometría original gobierna todas las mediciones y el análisis territorial posterior. */
  const areaM2 = Math.PI * ((diameterKm * 1000) / 2) ** 2;
  const borderDistanceKm = nearest.properties.dist;
  const ratio = diameterKm ? borderDistanceKm / diameterKm : null;
  const depth = inside && diameterKm ? Math.min(1, Math.max(0, (2 * borderDistanceKm) / diameterKm)) : null;
  const properties = feature.properties || {};
  const fields = config.campos || {};
  return {
    id: group.id,
    nombre: group.nombre || config.nombre || group.id,
    entidadMasCercana: first(properties, fields.nombre) || "Entidad sin nombre",
    categoria: first(properties, fields.categoria || fields.tipo) || config.nombre_largo || "Entidad ambiental",
    posicion: inside ? "interior" : "exterior",
    distanciaBordeKm: borderDistanceKm,
    superficieHa: areaM2 > 0 ? areaM2 / 10000 : null,
    diametroEquivalenteKm: diameterKm,
    relacionDiametros: ratio,
    profundidadRelativa: depth,
    geometry: feature.geometry,
    feature,
    nearest,
    sourceFile: layer.archivo
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status}: ${url}`);
    return await response.json();
  } finally { clearTimeout(timeout); }
}

async function loadGroup(group) {
  const base = new URL(`../capas_geoquery/${group.carpeta}/`, window.location.href);
  const [config, query] = await Promise.all([
    fetchJson(new URL(group.config.split("/").pop(), base)),
    fetchJson(new URL("listado_query.json", base))
  ]);
  const active = (query.capas || []).filter((layer) => layer.activo && (layer.incluir_en_nearest || layer.incluir_en_intersects));
  const settled = await Promise.allSettled(active.map(async (layer) => ({ layer, data: await fetchJson(new URL(layer.archivo, base)) })));
  const spatialEntries = [];
  const sourceFiles = [];
  let featuresLoaded = 0;
  let bboxCandidateCount = 0;
  let spatialCandidateCount = 0;
  for (const item of settled) {
    if (item.status !== "fulfilled") { sourceWarningCount += 1; console.warn(`Fuente no disponible para ${group.nombre}`, item.reason); continue; }
    sourceFiles.push(item.value.layer.archivo);
    const features = item.value.data.features || [];
    featuresLoaded += features.length;
    for (const [index, feature] of features.entries()) {
      const key = entityKey(feature, group, item.value.layer, index);
      sourceEntityKeys.add(key);
    }
    const filtered = await filterFeaturesByViewport(features, expandedViewportPolygon, expandedViewportBbox, turf, group.id === "snaspe" ? 150 : 250);
    bboxCandidateCount += filtered.roughCandidates.length;
    spatialCandidateCount += filtered.spatialCandidates.length;
    filtered.spatialCandidates.forEach((feature) => spatialEntries.push({ feature, layer: item.value.layer, key: entityKey(feature, group, item.value.layer, features.indexOf(feature)) }));
  }
  const entities = new Map();
  spatialEntries.forEach((entry) => entities.set(entry.key, [...(entities.get(entry.key) || []), entry]));
  const candidates = [];
  for (const [key, entries] of entities) {
    viewportEntityKeys.add(key);
    const feature = mergeEntityFeatures(entries);
    const diameterKm = calculateEquivalentDiameterKm(feature);
    if (!diameterKm) continue;
    const measured = measureFeature(feature, group, config, entries[0].layer, diameterKm);
    if (measured) candidates.push({ ...measured, entityKey: key });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  console.info("GeoNEMO filtro ambiental", { fuente: group.nombre, featuresCargados: featuresLoaded, candidatosBbox: bboxCandidateCount, candidatosFinales: spatialCandidateCount, entidadesUnicas: entities.size });
  candidates.sort((a, b) => a.distanciaBordeKm - b.distanciaBordeKm);
  return { group, result: candidates[0] || null, sourceFiles };
}

const formatNumber = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const formatDistance = (km) => !Number.isFinite(km) ? "—" : km < 1 ? `${formatNumber(km * 1000, 0)} m` : `${formatNumber(km, 1)} km`;
function formatRatio(ratio) {
  if (!Number.isFinite(ratio)) return "No calculable";
  if (ratio > 100) return "Más de 100 diámetros";
  if (ratio > 50) return "Más de 50 diámetros";
  if (ratio > 20) return "Más de 20 diámetros";
  return `${formatNumber(ratio, ratio < 1 ? 2 : 1)} diámetros`;
}
const escapeHtml = (text) => String(text ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const resultIct = (result) => calculateIct(result);
const ictDisplay = (result) => Number.isFinite(resultIct(result)) ? String(Math.round(resultIct(result))) : "—";
const ictClassification = (result) => classifyIct(resultIct(result));
/* Se conserva la interpretación preexistente para mapas y KML. */
const territorialExposure = (result) => classifyTerritorialAlert(result);

function renderCard(result, index) {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  const exposure = ictClassification(result);
  const inside = result.posicion === "interior";
  const depth = inside ? `${formatNumber(result.profundidadRelativa * 100, 0)} %<small>${formatNumber(result.profundidadRelativa, 2)}</small>` : `—<small>No aplica</small>`;
  return `<article class="group-report" style="--group-color:${color}"><header class="group-report-title"><div><h3>${escapeHtml(result.entidadMasCercana)}</h3><h4>${escapeHtml(result.nombre)}</h4></div><div class="ict-summary level-${exposure.key}"><span>ICT</span><strong>${ictDisplay(result)}</strong><b>Condicionamiento ${escapeHtml(exposure.label)}</b></div></header><div class="group-report-body"><section class="group-card" aria-label="Información y análisis espacial"><p class="category">Categoría: ${escapeHtml(result.categoria)}</p><div class="metrics"><div class="metric"><span>Posición</span><strong>${inside ? "Interior" : "Exterior"}</strong></div><div class="metric"><span>Distancia al borde</span><strong>${formatDistance(result.distanciaBordeKm)}</strong></div><div class="metric"><span>Diámetro equivalente</span><strong>${formatDistance(result.diametroEquivalenteKm)}</strong></div><div class="metric"><span>Relación territorial</span><strong>${formatRatio(result.relacionDiametros)}</strong></div><div class="metric metric-depth"><span>Profundidad relativa</span><strong>${depth}</strong></div></div><div class="scale"><div class="scale-labels"><span>Muy bajo</span><span>Bajo</span><span>Medio</span><span>Alto</span><span>Muy alto</span></div><div class="scale-bar"><i class="scale-marker" style="left:${resultIct(result)}%"></i></div><p class="scale-help">La barra representa el ICT: 0 indica condicionamiento nulo y 100, condicionamiento máximo.</p></div></section><section class="group-map-column" aria-label="Mapa exclusivo de ${escapeHtml(result.nombre)}"><div class="group-map" id="group-map-${index}"></div><div class="map-legend"><span class="legend-item"><i class="legend-swatch legend-poi"></i>POI</span><span class="legend-item"><i class="legend-line" style="border-color:${color}"></i>${formatDistance(result.distanciaBordeKm)}</span><span class="legend-item"><i class="legend-swatch" style="background:${color}"></i>${escapeHtml(result.categoria)}</span></div></section></div></article>`;
}

function renderEmptyCard(group, index) {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  return `<article class="group-card group-card-empty" style="--group-color:${color}"><header><div><h3>${escapeHtml(group.nombre || group.id)}</h3><h4>Sin entidades relevantes</h4></div></header><p class="category">en el área territorial analizada.</p></article>`;
}

function executiveResultSentence(result) {
  const alert = ictClassification(result).label.toLocaleLowerCase("es-CL");
  if (result.posicion === "interior") {
    const depthDescription = result.profundidadRelativa > .6 ? "alta" : result.profundidadRelativa > .3 ? "moderada" : "baja";
    return `Se detectó una entidad ${result.nombre}. ICT: ${ictDisplay(result)}. El punto se encuentra al interior de ${result.entidadMasCercana}, con una profundidad territorial ${depthDescription} y un condicionamiento ${alert}.`;
  }
  return `Se detectó una entidad ${result.nombre} relacionada. ICT: ${ictDisplay(result)}. El punto presenta un condicionamiento territorial ${alert} debido a su proximidad relativa a ${result.entidadMasCercana}.`;
}

function renderSynthesis(dominant) {
  if (!dominant) {
    $("synthesis-text").textContent = "No se identificaron entidades ambientales relevantes en el área territorial analizada.";
    return;
  }
  const omitted = Math.max(0, loadedGroupCount - results.length);
  const relation = `Se ${results.length === 1 ? "detectó una entidad ambiental relacionada" : `detectaron entidades ambientales relacionadas en ${results.length} grupos`}.`;
  const dominantSentence = `El ICT máximo corresponde a ${dominant.entidadMasCercana}. ${executiveResultSentence(dominant)}`;
  const remaining = omitted ? `No se detectaron entidades relevantes en ${omitted} ${omitted === 1 ? "grupo ambiental adicional" : "grupos ambientales adicionales"}.` : "Todos los grupos analizados presentan una entidad territorialmente relacionada.";
  $("synthesis-text").textContent = `${relation} ${dominantSentence} ${remaining}`;
}

function popupHtml(result) {
  return `<b>${escapeHtml(result.entidadMasCercana)}</b><br>${escapeHtml(result.nombre)} · ${escapeHtml(result.categoria)}<br>Superficie: ${formatNumber(result.superficieHa, 0)} ha<br>Distancia: ${formatDistance(result.distanciaBordeKm)}<br>Diámetro: ${formatDistance(result.diametroEquivalenteKm)}<br>Relación territorial: ${formatRatio(result.relacionDiametros)}<br>Exposición territorial relativa: ${escapeHtml(territorialExposure(result).label)}`;
}

function renderGroupMap(result, index) {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  const map = L.map(`group-map-${index}`, { zoomControl: true });
  const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
  const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" });
  L.control.layers({ OSM: osm, SAT: satellite }, null, { collapsed: false }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  const layers = L.featureGroup().addTo(map);
  const poiMarker = L.circleMarker([latitude, longitude], { radius: 7, color: "#fff", weight: 3, fillColor: "#dc443b", fillOpacity: 1 }).bindTooltip("Punto consultado", { direction: "top", className: "map-entity-label" }).addTo(layers);
  const polygon = L.geoJSON(result.feature, { style: { color, weight: 3, fillColor: color, fillOpacity: 0.18 } }).bindPopup(popupHtml(result)).addTo(layers);
  const border = result.nearest.geometry.coordinates;
  const distanceLine = L.polyline([[latitude, longitude], [border[1], border[0]]], { color, weight: 2, dashArray: "6 5" }).bindTooltip(formatDistance(result.distanciaBordeKm), { permanent: true, direction: "center", className: "distance-label map-entity-label" }).addTo(layers);
  polygon.eachLayer((layer) => layer.bindTooltip(result.entidadMasCercana, { sticky: true, className: "map-entity-label" }));
  const themedMap = {
    map, polygon, distanceLine, poiMarker, institutionalColor: color,
    legend: map.getContainer().closest(".group-map-column").querySelector(".map-legend")
  };
  GeoQueryMapTheme.applyTheme("osm", themedMap);
  map.on("baselayerchange", ({ name }) => GeoQueryMapTheme.applyTheme(name, themedMap));
  const bounds = layers.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [36, 36], maxZoom: 15 });
  groupMaps.push(map);
}

function renderResults(groupOutcomes) {
  $("result-cards").innerHTML = groupOutcomes.map((outcome, index) => outcome.result ? renderCard(outcome.result, index) : renderEmptyCard(outcome.group, index)).join("");
  $("results-table").innerHTML = results.map((result) => `<tr><td>${escapeHtml(result.nombre)}</td><td>${escapeHtml(result.entidadMasCercana)}</td><td><b>${ictDisplay(result)}</b></td><td>${formatDistance(result.distanciaBordeKm)}</td><td>${formatDistance(result.diametroEquivalenteKm)}</td><td>${formatRatio(result.relacionDiametros)}</td><td>${result.posicion === "interior" ? `${formatNumber(result.profundidadRelativa, 2)} (${formatNumber(result.profundidadRelativa * 100, 0)} %)` : "No aplica"}</td></tr>`).join("");
  $("source-list").innerHTML = groupOutcomes.map((outcome, index) => `<li style="--source-color:${GROUP_COLORS[index % GROUP_COLORS.length]}">${escapeHtml(outcome.group.nombre || outcome.group.id)} <small>· ${escapeHtml(outcome.sourceFiles.join(", ") || "fuente no disponible")}${outcome.result ? "" : " · sin entidades relevantes en el área analizada"}</small></li>`).join("");
  const dominant = getDominantResult(results);
  $("dominant-ict").textContent = dominant ? ictDisplay(dominant) : "—";
  $("dominant-name").textContent = dominant?.entidadMasCercana || "Sin entidades relevantes";
  $("dominant-group").textContent = dominant?.nombre || "en el área territorial analizada";
  renderSynthesis(dominant);
  groupOutcomes.forEach((outcome, index) => { if (outcome.result) renderGroupMap(outcome.result, index); });
}

function kmlDescription(result) {
  return `Grupo: ${result.nombre}; Categoría: ${result.categoria}; Superficie: ${formatNumber(result.superficieHa, 2)} ha; Distancia al borde: ${formatNumber(result.distanciaBordeKm, 3)} km; Diámetro equivalente: ${formatNumber(result.diametroEquivalenteKm, 3)} km; Relación territorial: ${formatNumber(result.relacionDiametros, 3)} diámetros; Exposición territorial relativa: ${territorialExposure(result).label}`;
}

function ringKml(ring) { return ring.map((coordinate) => `${coordinate[0]},${coordinate[1]},0`).join(" "); }
function polygonKml(polygon) { return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${ringKml(polygon[0])}</coordinates></LinearRing></outerBoundaryIs>${polygon.slice(1).map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${ringKml(ring)}</coordinates></LinearRing></innerBoundaryIs>`).join("")}</Polygon>`; }
function geometryKml(geometry) {
  if (geometry.type === "Polygon") return polygonKml(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return `<MultiGeometry>${geometry.coordinates.map(polygonKml).join("")}</MultiGeometry>`;
  return "";
}

function exportKml() {
  if (!results.length) return;
  const placemarks = results.map((result) => {
    const border = result.nearest.geometry.coordinates;
    return `<Placemark><name>${escapeHtml(result.nombre)} · ${escapeHtml(result.entidadMasCercana)}</name><description>${escapeHtml(kmlDescription(result))}</description>${geometryKml(result.geometry)}</Placemark><Placemark><name>Distancia · ${escapeHtml(result.nombre)}</name><description>${escapeHtml(kmlDescription(result))}</description><LineString><coordinates>${longitude},${latitude},0 ${border[0]},${border[1]},0</coordinates></LineString></Placemark>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>GeoQuery 2.0 GeoNEMO</name><Placemark><name>Punto consultado</name><Point><coordinates>${longitude},${latitude},0</coordinates></Point></Placemark>${placemarks}</Document></kml>`;
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([xml], { type: "application/vnd.google-earth.kml+xml" }));
  anchor.download = "geonemo_geoquery2_todos_los_grupos.kml";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
}

function exportPdf() { window.print(); }
[$("pdf-button"), $("pdf-button-bottom")].filter(Boolean).forEach((button) => button.addEventListener("click", exportPdf));
[$("kml-button"), $("kml-button-bottom")].forEach((button) => button.addEventListener("click", exportKml));

async function run() {
  if (!validPoint) {
    $("status").textContent = "Coordenadas no válidas";
    $("query-status").textContent = "Revise los parámetros lat/lon.";
    return;
  }
  try {
    $("query-status").textContent = "Preparando área territorial…";
    await new Promise((resolve) => setTimeout(resolve, 0));
    $("query-status").textContent = "Cargando fuentes ambientales…";
    const registry = await fetchJson(new URL("../capas_geoquery/listado.json", window.location.href));
    const groups = (registry.grupos || []).filter((group) => group.activo).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    $("query-status").textContent = "Filtrando entidades en el viewport ampliado…";
    const settled = await Promise.allSettled(groups.map(loadGroup));
    const groupOutcomes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
    loadedGroupCount = groupOutcomes.length;
    results = groupOutcomes.filter((outcome) => outcome.result).map((outcome) => outcome.result);
    settled.filter((item) => item.status === "rejected").forEach((item) => { sourceWarningCount += 1; console.warn("Grupo ambiental no disponible", item.reason); });
    if (!groupOutcomes.length) throw new Error("No se encontraron grupos ambientales disponibles");
    $("query-status").textContent = "Analizando grupos ambientales…";
    $("group-count").textContent = String(groupOutcomes.length);
    $("source-entity-count").textContent = sourceEntityKeys.size.toLocaleString("es-CL");
    $("viewport-entity-count").textContent = viewportEntityKeys.size.toLocaleString("es-CL");
    $("related-entity-count").textContent = new Set(results.map((result) => result.entityKey)).size.toLocaleString("es-CL");
    $("status").textContent = "Completada";
    renderResults(groupOutcomes);
    $("query-status").textContent = "Generando diagnóstico ejecutivo…";
    await new Promise((resolve) => setTimeout(resolve, 0));
    $("query-status").textContent = `${groupOutcomes.length} grupos analizados; ${results.length} con entidades relevantes en el área.${sourceWarningCount ? ` ${sourceWarningCount} fuente(s) no disponible(s).` : ""}`;
    [$(`pdf-button`), $(`pdf-button-bottom`), $(`kml-button`), $(`kml-button-bottom`)].filter(Boolean).forEach((button) => { button.disabled = false; });
  } catch (error) {
    console.error(error);
    $("status").textContent = "No disponible";
    $("query-status").textContent = "No fue posible cargar las fuentes ambientales.";
    $("synthesis-text").textContent = "La consulta territorial no pudo completarse.";
  }
}

run();
