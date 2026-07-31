/* GeoQuery 2.0 GeoNEMO. Este módulo es independiente de GeoQuery productivo. */
const GROUP_COLORS = ["#16835f", "#0b9c9c", "#4169a9", "#a563c1", "#dc8a27", "#7c755b", "#d05b76"];
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(window.location.search);

function viewportParamsFromNavigation() {
  const direct = createViewportPolygon(params);
  if (direct) return direct;
  const states = [history.state?.geoQueryOrigin];
  try { states.push(JSON.parse(sessionStorage.getItem("geox:geonemo:geoquery-origin") || "null")); } catch (error) { console.warn("GeoNEMO: estado de navegación inválido", error); }
  for (const state of states) {
    const viewport = createViewportPolygon(state?.map?.bounds || state?.bounds);
    if (viewport) return viewport;
  }
  console.warn("GeoNEMO: viewport original ausente o inválido; se omite la búsqueda ambiental nacional");
  return null;
}

const originalViewport = viewportParamsFromNavigation();
const originalViewportBbox = originalViewport ? turf.bbox(originalViewport) : null;

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
const analysisLayers = L.featureGroup();
let results = [];
let entitiesConsidered = 0;

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

const initialLat = finiteParam("viewLat", "mapCenterLat") ?? latitude;
const initialLon = finiteParam("viewLon", "mapCenterLon") ?? longitude;
const initialZoom = finiteParam("zoom", "mapZoom") ?? 10;
const map = L.map("map", { zoomControl: true }).setView([initialLat, initialLon], initialZoom);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
analysisLayers.addTo(map);
L.circleMarker([latitude, longitude], { radius: 7, color: "#fff", weight: 3, fillColor: "#dc443b", fillOpacity: 1 })
  .bindTooltip("Punto consultado", { direction: "top" }).addTo(analysisLayers);

function first(properties, fields) {
  for (const field of fields || []) {
    const value = properties?.[field];
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return null;
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

  /* La geometría original gobierna todas las mediciones; el buffer solo intervino en la preselección. */
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
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}

async function loadGroup(group) {
  const base = new URL(`../capas_geoquery/${group.carpeta}/`, window.location.href);
  const [config, query] = await Promise.all([
    fetchJson(new URL(group.config.split("/").pop(), base)),
    fetchJson(new URL("listado_query.json", base))
  ]);
  const active = (query.capas || []).filter((layer) => layer.activo && (layer.incluir_en_nearest || layer.incluir_en_intersects));
  const settled = await Promise.allSettled(active.map(async (layer) => ({ layer, data: await fetchJson(new URL(layer.archivo, base)) })));
  const candidates = [];
  const sourceFiles = [];
  for (const item of settled) {
    if (item.status !== "fulfilled") { console.error(`Fuente no disponible para ${group.nombre}`, item.reason); continue; }
    sourceFiles.push(item.value.layer.archivo);
    for (const feature of item.value.data.features || []) {
      entitiesConsidered += 1;
      const diameterKm = calculateEquivalentDiameterKm(feature);
      if (!diameterKm || !isCandidateByViewport(feature, originalViewport, diameterKm, turf, originalViewportBbox)) continue;
      const measured = measureFeature(feature, group, config, item.value.layer, diameterKm);
      if (measured) candidates.push(measured);
    }
  }
  candidates.sort((a, b) => a.distanciaBordeKm - b.distanciaBordeKm);
  return { group, result: candidates[0] || null, sourceFiles };
}

const formatNumber = (value, digits = 1) => Number.isFinite(value) ? value.toLocaleString("es-CL", { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
const formatDistance = (km) => !Number.isFinite(km) ? "—" : km < 1 ? `${formatNumber(km * 1000, 0)} m` : `${formatNumber(km, 1)} km`;
const formatRatio = (ratio) => Number.isFinite(ratio) ? `${formatNumber(ratio, 3)} diámetros` : "No calculable";
const escapeHtml = (text) => String(text ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
const territorialExposure = (result) => classifyTerritorialExposure(result.relacionDiametros);

function renderCard(result, index) {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  const depth = result.posicion === "interior" ? `<p class="inside-note">Profundidad relativa: <b>${formatNumber(result.profundidadRelativa, 2)}</b></p>` : "";
  const exposure = territorialExposure(result);
  const equilibrium = Math.abs(result.relacionDiametros - 1) <= 0.05 ? `<aside class="equilibrium-note"><b>Punto de equilibrio territorial</b><span>La distancia al borde es equivalente al diámetro de la entidad.</span></aside>` : "";
  return `<article class="group-card" style="--group-color:${color}"><header><div><h3>${escapeHtml(result.nombre)}</h3><h4>${escapeHtml(result.entidadMasCercana)}</h4></div><span class="level-badge">EXPOSICIÓN ${escapeHtml(exposure.label.toUpperCase())}</span></header><p class="category">Categoría: ${escapeHtml(result.categoria)}</p><div class="metrics"><div class="metric"><span>Posición</span><strong>${result.posicion === "interior" ? "Interior" : "Exterior"}</strong></div><div class="metric"><span>Distancia al borde</span><strong>${formatDistance(result.distanciaBordeKm)}</strong></div><div class="metric"><span>Diámetro equivalente</span><strong>${formatDistance(result.diametroEquivalenteKm)}</strong></div><div class="metric"><span>Relación territorial</span><strong>${formatRatio(result.relacionDiametros)}</strong></div></div>${depth}${equilibrium}<div class="scale"><div class="scale-labels"><span>Muy alta</span><span>Alta</span><span>Media alta</span><span>Media baja</span><span>Baja</span><span>Muy baja</span></div><div class="scale-bar"><i class="scale-marker" style="left:${getExposureVisualPosition(result.relacionDiametros)}%"></i></div><p class="scale-help">Menor cantidad de diámetros = mayor exposición territorial. Mayor cantidad de diámetros = menor exposición territorial.</p></div></article>`;
}

function renderEmptyCard(group, index) {
  const color = GROUP_COLORS[index % GROUP_COLORS.length];
  return `<article class="group-card group-card-empty" style="--group-color:${color}"><header><div><h3>${escapeHtml(group.nombre || group.id)}</h3><h4>Sin entidades relevantes</h4></div></header><p class="category">en el área territorial analizada</p></article>`;
}

function executiveResultSentence(result) {
  const ratio = result.relacionDiametros;
  const ratioText = formatNumber(ratio, 2);
  const exposure = territorialExposure(result).label.toLocaleLowerCase("es-CL");
  if (Math.abs(ratio - 1) <= 0.05) return `La entidad ${result.entidadMasCercana} se encuentra a ${ratioText} diámetro equivalente del punto, correspondiente al punto de equilibrio territorial y a una exposición media baja.`;
  if (ratio > 2) return `La entidad ${result.entidadMasCercana} se encuentra a ${ratioText} diámetros equivalentes del punto, por lo que su exposición territorial relativa es ${exposure}.`;
  return `La entidad ${result.entidadMasCercana} se encuentra a ${ratioText} diámetros equivalentes del punto, lo que representa una exposición territorial ${exposure}.`;
}

function renderSynthesis(dominant) {
  if (!dominant) {
    $("synthesis-text").textContent = "No se identificaron entidades ambientales relevantes en el área territorial analizada.";
    return;
  }
  const allInside = results.every((result) => result.posicion === "interior");
  const anyInside = results.some((result) => result.posicion === "interior");
  const positionSentence = allInside ? "El punto consultado está contenido en entidades de todos los grupos analizados." : anyInside ? "El punto consultado está contenido en al menos una entidad ambiental analizada." : "El punto consultado se encuentra fuera de las entidades ambientales seleccionadas.";
  const groupList = results.map((result) => result.nombre).join(", ");
  const dominantSentence = `La mayor exposición territorial corresponde a ${dominant.nombre}. ${executiveResultSentence(dominant)}`;
  $("synthesis-text").textContent = `${positionSentence} Se analizaron los grupos ${groupList}. ${dominantSentence}`;
}

function popupHtml(result) {
  return `<b>${escapeHtml(result.entidadMasCercana)}</b><br>${escapeHtml(result.nombre)} · ${escapeHtml(result.categoria)}<br>Superficie: ${formatNumber(result.superficieHa, 0)} ha<br>Distancia: ${formatDistance(result.distanciaBordeKm)}<br>Diámetro: ${formatDistance(result.diametroEquivalenteKm)}<br>Relación territorial: ${formatRatio(result.relacionDiametros)}<br>Exposición territorial relativa: ${escapeHtml(territorialExposure(result).label)}`;
}

function renderMap() {
  results.forEach((result, index) => {
    const color = GROUP_COLORS[index % GROUP_COLORS.length];
    const polygon = L.geoJSON(result.feature, { style: { color, weight: 3, fillColor: color, fillOpacity: 0.18 } }).bindPopup(popupHtml(result)).addTo(analysisLayers);
    const border = result.nearest.geometry.coordinates;
    L.polyline([[latitude, longitude], [border[1], border[0]]], { color, weight: 2, dashArray: "6 5" })
      .bindTooltip(`${result.nombre} · ${formatDistance(result.distanciaBordeKm)}`, { permanent: true, direction: "center", className: "distance-label" }).addTo(analysisLayers);
    polygon.eachLayer((layer) => layer.bindTooltip(result.nombre, { sticky: true }));
  });
  const bounds = analysisLayers.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds.pad(0.1), { maxZoom: 13 });
  $("map-legend").innerHTML = `<span class="legend-item"><i class="legend-swatch legend-poi"></i>POI</span>${results.map((result, index) => `<span class="legend-item"><i class="legend-swatch" style="background:${GROUP_COLORS[index % GROUP_COLORS.length]}"></i>${escapeHtml(result.nombre)}</span>`).join("")}`;
}

function renderResults(groupOutcomes) {
  results.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  $("result-cards").innerHTML = groupOutcomes.map((outcome, index) => outcome.result ? renderCard(outcome.result, index) : renderEmptyCard(outcome.group, index)).join("");
  $("results-table").innerHTML = results.map((result) => `<tr><td>${escapeHtml(result.nombre)}</td><td>${escapeHtml(result.entidadMasCercana)}</td><td>${formatDistance(result.distanciaBordeKm)}</td><td>${formatDistance(result.diametroEquivalenteKm)}</td><td>${formatRatio(result.relacionDiametros)}</td><td>${escapeHtml(territorialExposure(result).label)}</td></tr>`).join("");
  $("source-list").innerHTML = groupOutcomes.map((outcome, index) => `<li style="--source-color:${GROUP_COLORS[index % GROUP_COLORS.length]}">${escapeHtml(outcome.group.nombre || outcome.group.id)} <small>· ${escapeHtml(outcome.sourceFiles.join(", ") || "fuente no disponible")}${outcome.result ? "" : " · sin entidades relevantes en el área analizada"}</small></li>`).join("");
  const dominant = getDominantResult(results);
  $("dominant-group").textContent = dominant?.nombre || "Sin entidades relevantes";
  $("dominant-name").textContent = dominant?.entidadMasCercana || "en el área territorial analizada";
  $("dominant-level").textContent = dominant ? `Exposición: ${territorialExposure(dominant).label}` : "Sin exposición calculable";
  renderSynthesis(dominant);
  renderMap();
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
[$("pdf-button"), $("pdf-button-bottom")].forEach((button) => button.addEventListener("click", exportPdf));
[$("kml-button"), $("kml-button-bottom")].forEach((button) => button.addEventListener("click", exportKml));

async function run() {
  if (!validPoint) {
    $("status").textContent = "Coordenadas no válidas";
    $("query-status").textContent = "Revise los parámetros lat/lon.";
    return;
  }
  try {
    const registry = await fetchJson(new URL("../capas_geoquery/listado.json", window.location.href));
    const groups = (registry.grupos || []).filter((group) => group.activo).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const settled = await Promise.allSettled(groups.map(loadGroup));
    const groupOutcomes = settled.filter((item) => item.status === "fulfilled").map((item) => item.value);
    results = groupOutcomes.filter((outcome) => outcome.result).map((outcome) => outcome.result);
    settled.filter((item) => item.status === "rejected").forEach((item) => console.error("Grupo ambiental no disponible", item.reason));
    if (!groupOutcomes.length) throw new Error("No se encontraron grupos ambientales disponibles");
    $("group-count").textContent = String(groupOutcomes.length);
    $("entity-count").textContent = entitiesConsidered.toLocaleString("es-CL");
    $("status").textContent = "Completada";
    $("query-status").textContent = `${groupOutcomes.length} grupos analizados; ${results.length} con entidades relevantes en el área.`;
    renderResults(groupOutcomes);
  } catch (error) {
    console.error(error);
    $("status").textContent = "No disponible";
    $("query-status").textContent = "No fue posible cargar las fuentes ambientales.";
    $("synthesis-text").textContent = "La consulta territorial no pudo completarse.";
  }
}

run();
