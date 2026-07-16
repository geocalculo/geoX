let map;
let osmLayer;
let satLayer;
let currentBaseLayer;
let currentBasemap = "osm";
let initialCrossAccessState = null;
let selectedPoint = null;
let selectedFeatureContext = null;
const SITE_ID = "geonoxa";
const CROSS_ACCESS_PARAM_NAME = "from";
const CROSS_ACCESS_PARAM_VALUE = "crossaccess";

let viewportRestoreApplied = false;
let geoQueryRestoreState = null;

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBasemap(value) {
  return String(value || "").toLowerCase() === "sat" ? "sat" : "osm";
}

function validLat(value) { return Number.isFinite(value) && value >= -90 && value <= 90; }
function validLon(value) { return Number.isFinite(value) && value >= -180 && value <= 180; }
function validZoom(value) { return Number.isFinite(value) && value >= 0 && value <= 22; }

function getGeoQueryOriginStorageKey(site = SITE_ID) {
  return `geox:${site}:geoquery-origin`;
}

function normalizeGeoQueryOriginState(raw, site = SITE_ID) {
  if (!raw || raw.site !== site) return null;
  const centerLat = toFiniteNumber(raw.map?.centerLat);
  const centerLon = toFiniteNumber(raw.map?.centerLon);
  const zoom = toFiniteNumber(raw.map?.zoom);
  const queryLat = toFiniteNumber(raw.queryPoint?.lat);
  const queryLon = toFiniteNumber(raw.queryPoint?.lon);
  const west = toFiniteNumber(raw.map?.bounds?.west);
  const south = toFiniteNumber(raw.map?.bounds?.south);
  const east = toFiniteNumber(raw.map?.bounds?.east);
  const north = toFiniteNumber(raw.map?.bounds?.north);
  const savedAt = toFiniteNumber(raw.savedAt) || Date.now();
  const maxAgeMs = 12 * 60 * 60 * 1000;
  if (!validLat(centerLat) || !validLon(centerLon) || !validZoom(zoom)) return null;
  if (!validLat(queryLat) || !validLon(queryLon)) return null;
  if (!validLon(west) || !validLon(east) || !validLat(south) || !validLat(north) || !(west < east) || !(south < north)) return null;
  if (Date.now() - savedAt > maxAgeMs) return null;
  return {
    version: 1,
    site,
    source: "geoquery",
    savedAt,
    queryPoint: { lat: queryLat, lon: queryLon },
    map: { centerLat, centerLon, zoom, basemap: normalizeBasemap(raw.map?.basemap), bounds: { west, south, east, north } },
    navigation: { from: raw.navigation?.from || "index", crossAccess: raw.navigation?.crossAccess === true || raw.navigation?.from === "crossaccess" }
  };
}

function readOriginStateFromUrl(site = SITE_ID) {
  const params = new URLSearchParams(window.location.search);
  const finiteParam = (name) => toFiniteNumber(params.get(name));
  const centerLat = finiteParam("mapCenterLat") ?? finiteParam("viewLat");
  const centerLon = finiteParam("mapCenterLon") ?? finiteParam("viewLon");
  const zoom = finiteParam("mapZoom") ?? finiteParam("zoom");
  const queryLat = finiteParam("queryLat") ?? finiteParam("lat");
  const queryLon = finiteParam("queryLon") ?? finiteParam("lon");
  const west = finiteParam("viewWest");
  const south = finiteParam("viewSouth");
  const east = finiteParam("viewEast");
  const north = finiteParam("viewNorth");
  return normalizeGeoQueryOriginState({ version: 1, site, source: "geoquery", savedAt: Date.now(), queryPoint: { lat: queryLat, lon: queryLon }, map: { centerLat, centerLon, zoom, basemap: params.get("basemap"), bounds: { west, south, east, north } }, navigation: { from: params.get("from") || "index", crossAccess: params.get("from") === "crossaccess" || params.get("source") === "crossaccess" } }, site);
}

function readOriginStateFromHistory(site = SITE_ID) {
  return normalizeGeoQueryOriginState(history.state?.geoQueryOrigin, site);
}

function readOriginStateFromSessionStorage(site = SITE_ID) {
  try { return normalizeGeoQueryOriginState(JSON.parse(sessionStorage.getItem(getGeoQueryOriginStorageKey(site)) || "null"), site); }
  catch { return null; }
}

function resolveViewportRestoreState(site = SITE_ID) {
  return readOriginStateFromUrl(site) || readOriginStateFromHistory(site) || readOriginStateFromSessionStorage(site) || null;
}

function captureGeoQueryOriginState({ site = SITE_ID, map, queryLat, queryLon, basemap, from }) {
  const center = map.getCenter();
  const bounds = map.getBounds();
  return normalizeGeoQueryOriginState({ version: 1, site, source: "geoquery", savedAt: Date.now(), queryPoint: { lat: Number(queryLat), lon: Number(queryLon) }, map: { centerLat: center.lat, centerLon: center.lng, zoom: map.getZoom(), basemap, bounds: { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() } }, navigation: { from: from || "index", crossAccess: from === "crossaccess" } }, site);
}

function persistOriginStateBeforeGeoQuery(originState) {
  if (!originState) return;
  try { sessionStorage.setItem(getGeoQueryOriginStorageKey(originState.site), JSON.stringify(originState)); } catch {}
  const currentUrl = new URL(window.location.href);
  const p = currentUrl.searchParams;
  p.set("mapCenterLat", originState.map.centerLat); p.set("mapCenterLon", originState.map.centerLon); p.set("mapZoom", originState.map.zoom);
  p.set("basemap", originState.map.basemap); p.set("queryLat", originState.queryPoint.lat); p.set("queryLon", originState.queryPoint.lon);
  p.set("viewWest", originState.map.bounds.west); p.set("viewSouth", originState.map.bounds.south); p.set("viewEast", originState.map.bounds.east); p.set("viewNorth", originState.map.bounds.north);
  p.set("restoreViewport", "1"); p.set("from", originState.navigation.crossAccess ? "crossaccess" : "geoquery");
  history.replaceState({ ...(history.state || {}), geoQueryOrigin: originState }, "", currentUrl);
}

function appendOriginStateToGeoQueryUrl(url, originState) {
  const target = new URL(url, window.location.href); const p = target.searchParams;
  p.set("viewLat", originState.map.centerLat); p.set("viewLon", originState.map.centerLon); p.set("mapCenterLat", originState.map.centerLat); p.set("mapCenterLon", originState.map.centerLon);
  p.set("zoom", originState.map.zoom); p.set("mapZoom", originState.map.zoom); p.set("basemap", originState.map.basemap); p.set("queryLat", originState.queryPoint.lat); p.set("queryLon", originState.queryPoint.lon);
  p.set("viewWest", originState.map.bounds.west); p.set("viewSouth", originState.map.bounds.south); p.set("viewEast", originState.map.bounds.east); p.set("viewNorth", originState.map.bounds.north);
  return target.pathname.split('/').pop() === 'geoquery.html' ? `./geoquery/geoquery.html?${p.toString()}` : target.toString();
}

function restoreMapViewport(mapInstance, restoreState) {
  const state = normalizeGeoQueryOriginState(restoreState, SITE_ID); if (!mapInstance || !state) return false;
  if (typeof switchBaseMap === "function") switchBaseMap(state.map.basemap);
  mapInstance.setView([state.map.centerLat, state.map.centerLon], state.map.zoom, { animate: false });
  if (typeof setSelectedPoint === "function") setSelectedPoint(state.queryPoint.lat, state.queryPoint.lon, "geoquery_restore");
  else { selectedPoint = { lat: state.queryPoint.lat, lon: state.queryPoint.lon, source: "geoquery_restore", site: SITE_ID, timestamp: new Date().toISOString() }; window.selectedPoint = selectedPoint; }
  viewportRestoreApplied = true; geoQueryRestoreState = state; return true;
}

function installGeoQueryViewportRestoreHandlers() {
  window.addEventListener("pageshow", (event) => { if (!event.persisted) return; const state = resolveViewportRestoreState(SITE_ID); if (state && map) { restoreMapViewport(map, state); setTimeout(() => map.invalidateSize(false), 0); } });
  window.addEventListener("popstate", (event) => { const state = normalizeGeoQueryOriginState(event.state?.geoQueryOrigin, SITE_ID) || resolveViewportRestoreState(SITE_ID); if (state && map) restoreMapViewport(map, state); });
}

let summaryConfig = null;
let summaryFeaturesByLayer = {};
const REGIONES_PATH = "capas_selector/regiones.json";
let regionesSelector = [];

const GEONOXA_SEARCH_PATH = "./capas_tosearch/geonoxa_tosearch_objetos.geojson";
const GEONOXA_SEARCH_MIN_CHARS = 3;
const GEONOXA_SEARCH_MAX_RESULTS = 15;
const GEONOXA_SEARCH_DEBOUNCE_MS = 200;
let geoNoxaSearchIndex = [];
let geoNoxaSearchLoaded = false;
let geoNoxaSearchMarker = null;
let geoNoxaSearchTimer = null;
let selectedSearchResult = null;

let noxaPanelUpdateTimer = null;
async function loadLabelCapacityConfig() {
  if (window.GeoXLabelGrid && typeof GeoXLabelGrid.loadCapacityConfig === "function") {
    await GeoXLabelGrid.loadCapacityConfig("capas_panel/label_capacity_config.json");
  }
}

const noxaPanelLayers = {
  relaves: {
    id: "relaves",
    label: "Relaves",
    file: "capas_panel/geonoxa_relaves_panel.geojson",
    rawFeatures: [],
    loaded: false,
    labelsVisible: false,
    geometryLayerGroup: L.layerGroup(),
    labelsLayerGroup: L.layerGroup()
  },
  zonas: {
    id: "zonas",
    label: "Zonas Saturadas / Latentes",
    file: "capas_panel/geonoxa_zonas_panel.geojson",
    rawFeatures: [],
    loaded: false,
    labelsVisible: false,
    geometryLayerGroup: L.layerGroup(),
    labelsLayerGroup: L.layerGroup()
  }
};

function isCrossAccessNavigationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return (
    params.get(CROSS_ACCESS_PARAM_NAME) === CROSS_ACCESS_PARAM_VALUE ||
    params.get("source") === CROSS_ACCESS_PARAM_VALUE
  );
}

function getInitialCrossAccessStateFromUrl() {
  if (initialCrossAccessState) return initialCrossAccessState;

  const params = new URLSearchParams(window.location.search);

  const from = params.get("from");
  const lat = parseFloat(params.get("lat"));
  const lon = parseFloat(params.get("lon"));
  const viewLat = parseFloat(params.get("viewLat"));
  const viewLon = parseFloat(params.get("viewLon"));
  const zoom = parseFloat(params.get("zoom"));
  const requestedBasemap = (params.get("basemap") || "osm").toLowerCase();
  const basemap = requestedBasemap === "sat" ? "sat" : "osm";
  const isGeoQueryReturn = from === "geoquery";
  const hasReturnViewport = Number.isFinite(viewLat) && Number.isFinite(viewLon) && Number.isFinite(zoom);
  const hasPointViewport = Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(zoom);

  console.log("[GeoX navigation receive]", {
    from,
    lat,
    lon,
    viewLat,
    viewLon,
    zoom,
    basemap
  });

  initialCrossAccessState = {
    viewport: isGeoQueryReturn && hasReturnViewport
      ? { lat: viewLat, lon: viewLon, zoom }
      : hasPointViewport
        ? { lat, lon, zoom }
        : null,
    basemap
  };

  return initialCrossAccessState;
}

function getInitialViewportFromUrl() {
  return getInitialCrossAccessStateFromUrl().viewport;
}

function getInitialBasemapFromUrl() {
  return getInitialCrossAccessStateFromUrl().basemap;
}


let userLocationMarker = null;

function openGeoQueryFromLatLng(lat, lon) {
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

  const center = map.getCenter();
  const zoom = map.getZoom();
  const basemap = currentBasemap || "osm";
  const bounds = map.getBounds();
  const params = new URLSearchParams({
    site: SITE_ID,
    lat: String(lat),
    lon: String(lon),
    viewLat: String(center.lat),
    viewLon: String(center.lng),
    zoom: String(zoom),
    basemap,
    from: "index",
    viewWest: String(bounds.getWest()),
    viewSouth: String(bounds.getSouth()),
    viewEast: String(bounds.getEast()),
    viewNorth: String(bounds.getNorth())
  });
  const url = `./geoquery/geoquery.html?${params.toString()}`;

  const originState = captureGeoQueryOriginState({ site: SITE_ID, map, queryLat: lat, queryLon: lon, basemap, from: isCrossAccessNavigationFromUrl() ? "crossaccess" : "index" });
  persistOriginStateBeforeGeoQuery(originState);
  window.location.href = appendOriginStateToGeoQueryUrl(url, originState);
}

function captureSelectedPoint(event, featureContext = null) {
  const latlng = event?.latlng || event;
  if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return null;

  if (featureContext && window.L?.DomEvent && event?.originalEvent) {
    L.DomEvent.stopPropagation(event);
  }

  const originalEvent = event?.originalEvent;
  if (featureContext && originalEvent) originalEvent.__geoxFeatureContext = featureContext;

  selectedPoint = {
    lat: latlng.lat,
    lon: latlng.lng,
    source: featureContext ? "layer_click" : "map_click",
    site: SITE_ID,
    timestamp: new Date().toISOString()
  };
  selectedFeatureContext = featureContext || originalEvent?.__geoxFeatureContext || null;
  window.selectedPoint = selectedPoint;
  window.selectedFeatureContext = selectedFeatureContext;

  if (event?.latlng) {
    openGeoQueryFromLatLng(latlng.lat, latlng.lng);
  }

  return selectedPoint;
}

function initGeoQueryClickPropagationGuards() {
  if (!window.L?.DomEvent) return;

  [
    "#control-bar",
    "#territorial-panel",
    "#search-box-wrapper",
    "#mobile-map-controls",
    "#main-footer",
    ".leaflet-control"
  ].forEach((selector) => {
    document.querySelectorAll(selector).forEach((element) => {
      L.DomEvent.disableClickPropagation(element);
    });
  });
}

function getLocationByGps() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation no disponible"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 60000
      }
    );
  });
}

async function getLocationByIp() {
  try {
    const response = await fetch("https://ipapi.co/json/", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("No se pudo obtener ubicación por IP");
    }

    const data = await response.json();

    const lat = parseFloat(data.latitude);
    const lon = parseFloat(data.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("IP sin coordenadas válidas");
    }

    return { lat, lon };
  } catch (error) {
    console.warn("GeoX: ubicación por IP no disponible", error);
    return null;
  }
}

function applyUserLocation(mapInstance, location, zoomLevel = 14) {
  if (!mapInstance || !location) return;

  const lat = parseFloat(location.lat);
  const lon = parseFloat(location.lon);

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

  mapInstance.setView([lat, lon], zoomLevel);

  if (userLocationMarker) {
    userLocationMarker.setLatLng([lat, lon]);
  } else {
    userLocationMarker = L.marker([lat, lon]).addTo(mapInstance);
  }

  captureSelectedPoint({ lat, lng: lon });
}

async function initGeoXInitialLocation(mapInstance) {
  const incomingViewport = getInitialViewportFromUrl();

  if (incomingViewport) {
    mapInstance.setView(
      [incomingViewport.lat, incomingViewport.lon],
      incomingViewport.zoom
    );
    return;
  }

  try {
    const gpsLocation = await getLocationByGps();

    if (gpsLocation) {
      applyUserLocation(mapInstance, gpsLocation, 14);
      return;
    }
  } catch (error) {
    console.warn("GeoX: GPS no disponible o no autorizado", error);
  }

  const ipLocation = await getLocationByIp();

  if (ipLocation) {
    applyUserLocation(mapInstance, ipLocation, 10);
    return;
  }

  console.warn("GeoX: se mantiene ubicación default del sitio");
}

function initGeoXMyLocationButton(mapInstance) {
  const button =
    document.getElementById("my-location-btn") ||
    document.getElementById("locate-btn") ||
    document.getElementById("btn-my-location") ||
    document.querySelector(".my-location-btn") ||
    document.querySelector(".locate-btn") ||
    document.querySelector("[data-action='my-location']");

  if (!button) {
    console.warn("GeoX: botón Mi ubicación no encontrado");
    return;
  }

  button.addEventListener("click", async () => {
    try {
      const gpsLocation = await getLocationByGps();

      if (gpsLocation) {
        applyUserLocation(mapInstance, gpsLocation, 14);
        return;
      }
    } catch (error) {
      console.warn("GeoX: GPS no disponible desde botón", error);
    }

    const ipLocation = await getLocationByIp();

    if (ipLocation) {
      applyUserLocation(mapInstance, ipLocation, 10);
      return;
    }

    console.warn("GeoX: no se pudo determinar ubicación");
  });
}


function normalizeGeoNOXASearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function getGeoNOXASearchBBox(rawBbox) {
  if (!Array.isArray(rawBbox) || rawBbox.length < 4) return null;
  const bbox = rawBbox.slice(0, 4).map(Number);
  if (!bbox.every(Number.isFinite)) return null;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (minLon > maxLon || minLat > maxLat) return null;
  return bbox;
}

function getGeoNOXASearchLatLon(feature, props, bbox) {
  const lat = Number(props.lat);
  const lon = Number(props.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };

  if (bbox) {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    return {
      lat: (minLat + maxLat) / 2,
      lon: (minLon + maxLon) / 2
    };
  }

  if (feature?.geometry?.type === "Point" && Array.isArray(feature.geometry.coordinates)) {
    const geometryLon = Number(feature.geometry.coordinates[0]);
    const geometryLat = Number(feature.geometry.coordinates[1]);
    if (Number.isFinite(geometryLat) && Number.isFinite(geometryLon)) {
      return { lat: geometryLat, lon: geometryLon };
    }
  }

  return null;
}

function getGeoNOXASearchName(props) {
  return props.nombre_objeto || props.recurso || props.contaminante || props.nombre_zona || props.faena || "Objeto GeoNOXA";
}

function buildGeoNOXASearchIndex(features) {
  const index = [];

  features.forEach((feature, featureIndex) => {
    const props = feature.properties || {};
    const bbox = getGeoNOXASearchBBox(props.bbox);
    const coords = getGeoNOXASearchLatLon(feature, props, bbox);

    if (!coords) {
      console.warn("[GeoNOXA Search] registro omitido por coordenadas inválidas", featureIndex, props);
      return;
    }

    const familia = props.familia || "";
    const tipo_objeto = props.tipo_objeto || "Objeto";
    const nombre_objeto = getGeoNOXASearchName(props);
    const titular = props.titular || props.empresa || "";
    const empresa = props.empresa || "";
    const comuna = props.comuna || "";
    const recurso = props.recurso || "";
    const contaminante = props.contaminante || "";
    const nombre_zona = props.nombre_zona || "";
    const saturado = props.saturado || "";
    const latentes = props.latentes || "";
    const zonaEstadoText = [
      saturado && normalizeGeoNOXASearchText(saturado) !== "no aplica" ? "zona saturada" : "",
      latentes && normalizeGeoNOXASearchText(latentes) !== "no aplica" ? "zona latente" : ""
    ].join(" ");
    const searchText = normalizeGeoNOXASearchText([
      props.nombre_busq,
      nombre_objeto,
      recurso,
      contaminante,
      titular,
      empresa,
      comuna,
      tipo_objeto,
      familia,
      nombre_zona,
      props.zona_dec,
      saturado,
      latentes,
      zonaEstadoText,
      props.faena
    ].join(" "));

    index.push({
      index: featureIndex,
      familia,
      tipo_objeto,
      id_objeto: props.id_objeto || "",
      nombre_objeto,
      nombre_busq: props.nombre_busq || "",
      recurso,
      contaminante,
      comuna,
      titular,
      empresa,
      nombre_zona,
      lat: coords.lat,
      lon: coords.lon,
      bbox,
      geometry: feature.geometry,
      searchText
    });
  });

  return index;
}

async function loadGeoNOXASearchIndex() {
  if (geoNoxaSearchLoaded) return geoNoxaSearchIndex;

  console.log(`[GeoNOXA Search] cargando ${GEONOXA_SEARCH_PATH}`);
  const response = await fetch(GEONOXA_SEARCH_PATH, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${GEONOXA_SEARCH_PATH}`);

  const geojson = await response.json();
  const features = Array.isArray(geojson.features) ? geojson.features : [];
  console.log("[GeoNOXA Search] features cargadas:", features.length);

  geoNoxaSearchIndex = buildGeoNOXASearchIndex(features);
  geoNoxaSearchLoaded = true;
  console.log("[GeoNOXA Search] índice nacional listo:", geoNoxaSearchIndex.length, "registros válidos");

  return geoNoxaSearchIndex;
}

function formatGeoNOXASearchResult(item) {
  const family = normalizeGeoNOXASearchText(item.familia);
  const type = family.includes("zona") ? "Zona" : "Relave";

  if (type === "Zona") {
    return [type, item.contaminante, item.nombre_zona || item.nombre_objeto].filter(Boolean).join(" · ");
  }

  return [type, item.nombre_objeto || item.recurso, item.comuna].filter(Boolean).join(" · ");
}

function clearGeoNOXASearchResults() {
  const results = document.getElementById("search-results");
  if (!results) return;
  results.innerHTML = "";
  results.classList.remove("is-open");
}

function searchGeoNOXAObjects(query) {
  const normalizedQuery = normalizeGeoNOXASearchText(query);
  if (normalizedQuery.length < GEONOXA_SEARCH_MIN_CHARS) return [];

  const results = [];
  for (const item of geoNoxaSearchIndex) {
    if (!item.searchText.includes(normalizedQuery)) continue;
    results.push(item);
    if (results.length >= GEONOXA_SEARCH_MAX_RESULTS) break;
  }

  console.log(`[GeoNOXA Search] búsqueda: ${normalizedQuery} | resultados: ${results.length}`);
  return results;
}

function renderGeoNOXASearchResults(results) {
  const container = document.getElementById("search-results");
  if (!container) return;

  container.innerHTML = "";
  container.classList.toggle("is-open", results.length > 0);

  results.forEach((result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-item";
    button.textContent = formatGeoNOXASearchResult(result);
    button.title = button.textContent;
    button.addEventListener("click", () => selectGeoNOXASearchResult(result));
    container.appendChild(button);
  });
}

function selectGeoNOXASearchResult(result) {
  if (!map || !result) return;

  console.log(`[GeoNOXA Search] seleccionado: ${result.tipo_objeto} | ${result.nombre_objeto}`);

  const hasValidBBox = Array.isArray(result.bbox);
  if (hasValidBBox) {
    const [minLon, minLat, maxLon, maxLat] = result.bbox;
    const bounds = L.latLngBounds([minLat, minLon], [maxLat, maxLon]);
    if (bounds.isValid()) {
      console.log("[GeoNOXA Search] usando bbox para fitBounds");
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  } else {
    const lat = Number(result.lat);
    const lon = Number(result.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      console.log("[GeoNOXA Search] usando lat/lon fallback");
      map.setView([lat, lon], 14);
    }
  }

  const markerLat = Number(result.lat);
  const markerLon = Number(result.lon);
  if (Number.isFinite(markerLat) && Number.isFinite(markerLon)) {
    if (geoNoxaSearchMarker) {
      geoNoxaSearchMarker.setLatLng([markerLat, markerLon]);
    } else {
      geoNoxaSearchMarker = L.marker([markerLat, markerLon]).addTo(map);
    }
  }

  selectedSearchResult = {
    site: SITE_ID,
    familia: result.familia,
    tipo_objeto: result.tipo_objeto,
    id_objeto: result.id_objeto,
    nombre_objeto: result.nombre_objeto,
    lat: result.lat,
    lon: result.lon,
    bbox: result.bbox,
    source: "search",
    timestamp: new Date().toISOString()
  };
  window.selectedSearchResult = selectedSearchResult;

  const input = document.getElementById("search-box");
  if (input) input.value = formatGeoNOXASearchResult(result);
  clearGeoNOXASearchResults();
}

function initGeoNOXANationalSearch() {
  const input = document.getElementById("search-box");
  if (!input) return;

  loadGeoNOXASearchIndex().catch((error) => {
    console.warn("[GeoNOXA Search] error cargando índice nacional", error);
  });

  input.addEventListener("input", () => {
    if (geoNoxaSearchTimer) clearTimeout(geoNoxaSearchTimer);
    geoNoxaSearchTimer = setTimeout(async () => {
      const query = input.value;
      if (normalizeGeoNOXASearchText(query).length < GEONOXA_SEARCH_MIN_CHARS) {
        clearGeoNOXASearchResults();
        return;
      }

      try {
        await loadGeoNOXASearchIndex();
        renderGeoNOXASearchResults(searchGeoNOXAObjects(query));
      } catch (error) {
        console.warn("[GeoNOXA Search] búsqueda no disponible", error);
        clearGeoNOXASearchResults();
      }
    }, GEONOXA_SEARCH_DEBOUNCE_MS);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") clearGeoNOXASearchResults();
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest("#search-box-wrapper")) clearGeoNOXASearchResults();
  });
}

function getGeoXMapInstance() {
  if (window.geoxMap && typeof window.geoxMap.getCenter === "function") {
    return window.geoxMap;
  }

  if (window.map && typeof window.map.getCenter === "function") {
    return window.map;
  }

  return null;
}

function getCurrentMapState() {
  const mapInstance = getGeoXMapInstance();

  if (!mapInstance) {
    console.warn("GeoX: no se encontró instancia Leaflet para capturar estado del mapa.");
    return null;
  }

  const center = mapInstance.getCenter();

  return {
    lat: center.lat,
    lon: center.lng,
    zoom: mapInstance.getZoom(),
    basemap: currentBasemap || "osm"
  };
}

function buildCrossAccessUrl(sitePath) {
  const state = getCurrentMapState();
  const url = new URL(sitePath, window.location.href);
  url.searchParams.set(CROSS_ACCESS_PARAM_NAME, CROSS_ACCESS_PARAM_VALUE);

  if (!state) return url.toString();

  console.log("[GeoX cross_access send]", state);

  url.searchParams.set("lat", state.lat.toFixed(6));
  url.searchParams.set("lon", state.lon.toFixed(6));
  url.searchParams.set("zoom", String(state.zoom));
  url.searchParams.set("basemap", state.basemap);

  return url.toString();
}

function getCurrentViewportParams() {
  const state = getCurrentMapState();

  if (!state) return "";

  const params = new URLSearchParams();
  params.set("lat", state.lat.toFixed(6));
  params.set("lon", state.lon.toFixed(6));
  params.set("zoom", String(state.zoom));
  params.set("basemap", state.basemap);
  params.set(CROSS_ACCESS_PARAM_NAME, CROSS_ACCESS_PARAM_VALUE);

  return params.toString();
}

function isGeoXPortalLink(link) {
  if (!link) return false;

  const href = link.getAttribute("href") || "";
  const target = link.getAttribute("data-geox-target") || "";

  const value = `${href} ${target}`.toLowerCase();

  return (
    value.includes("geoipt") ||
    value.includes("geoeva") ||
    value.includes("geonemo") ||
    value.includes("geonoxa")
  );
}

function initGeoXCrossPortalNavigation() {
  document.addEventListener("click", function (event) {
    const link = event.target.closest("a");

    if (!isGeoXPortalLink(link)) return;

    const rawTarget =
      link.getAttribute("data-geox-target") ||
      link.getAttribute("href");

    if (!rawTarget) return;

    event.preventDefault();

    window.location.href = buildCrossAccessUrl(rawTarget);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  iniciarMapa();
  initGeoQueryClickPropagationGuards();
  await cargarRegionesSelector();
  conectarRegionSelector();
  conectarBaseMapToggle();
  initGeoXMyLocationButton(map);
  initGeoXCrossPortalNavigation();
  initGeoNOXANationalSearch();
  await loadLabelCapacityConfig();
  initGeoNoxaPanelLayers();
  window.addEventListener("resize", scheduleGeoNoxaPanelViewportUpdate);
});

function iniciarMapa() {
  geoQueryRestoreState = resolveViewportRestoreState(SITE_ID);
  map = L.map("map").setView([-30.0, -71.0], 5);
  window.geoxMap = map;

  const initialLocationPromise = geoQueryRestoreState ? Promise.resolve() : initGeoXInitialLocation(map);
  initialLocationPromise.finally(() => {
    initGeoNOXASummary(map);
  });

  osmLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap"
  });

  satLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles © Esri"
  });

  switchBaseMap(geoQueryRestoreState?.map?.basemap || getInitialBasemapFromUrl());
  if (geoQueryRestoreState) restoreMapViewport(map, geoQueryRestoreState);

  L.control.scale({
    imperial: false
  }).addTo(map);

  map.on("click", captureSelectedPoint);
  map.on("moveend zoomend", scheduleGeoNoxaPanelViewportUpdate);
  installGeoQueryViewportRestoreHandlers();
}



function areAllGeoNoxaLabelsVisible() {
  return Object.keys(noxaPanelLayers).every((layerKey) => noxaPanelLayers[layerKey].labelsVisible === true);
}


function getMobileLabelEyeIcon(isVisible) {
  if (isVisible) {
    return `<svg class="mobile-layer-toggle-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>`;
  }
  return `<svg class="mobile-layer-toggle-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M2.5 12s3.5-6 9.5-6c2.1 0 3.9.72 5.36 1.7M21.5 12s-3.5 6-9.5 6c-2.1 0-3.9-.72-5.36-1.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.8 9.8A3 3 0 0 1 14.2 14.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
}

function syncGeoNoxaMobileLabelToggle() {
  const mobileToggle = document.getElementById("mobile-layer-toggle");
  if (!mobileToggle) return;

  const allVisible = areAllGeoNoxaLabelsVisible();
  mobileToggle.classList.toggle("is-active", allVisible);
  mobileToggle.classList.toggle("is-inactive", !allVisible);
  mobileToggle.setAttribute("aria-pressed", String(allVisible));

  const action = allVisible ? "Ocultar" : "Mostrar";
  const label = `${action} etiquetas GeoNOXA`;
  mobileToggle.setAttribute("aria-label", label);
  mobileToggle.setAttribute("title", label);

  const icon = mobileToggle.querySelector(".mobile-layer-toggle-icon");
  if (icon) icon.innerHTML = getMobileLabelEyeIcon(allVisible);
}

function initGeoNoxaMobileLabelToggle() {
  const mobileToggle = document.getElementById("mobile-layer-toggle");
  if (!mobileToggle) return;

  mobileToggle.addEventListener("click", () => {
    const nextVisible = !areAllGeoNoxaLabelsVisible();
    Object.keys(noxaPanelLayers).forEach((layerKey) => {
      toggleGeoNoxaPanelLayer(layerKey, nextVisible);
    });
  });
  syncGeoNoxaMobileLabelToggle();
}

function initGeoNoxaPanelLayers() {
  renderGeoNoxaPanelControls();
  initGeoNoxaPanelToggles();
  initGeoNoxaMobileLabelToggle();
  Object.keys(noxaPanelLayers).forEach((layerKey) => toggleGeoNoxaPanelLayer(layerKey, noxaPanelLayers[layerKey].labelsVisible));
}

function renderGeoNoxaPanelControls() {
  const panel = document.getElementById("territorial-panel");
  if (!panel) return;

  panel.innerHTML = `
    <h2>Etiquetas</h2>
    <div class="panel-toggle-list" aria-label="Control de etiquetas GeoNOXA">
      <label class="panel-toggle-row">
        <input type="checkbox" id="toggle-relaves">
        <span>Mostrar etiquetas Relaves</span>
      </label>
      <label class="panel-toggle-row">
        <input type="checkbox" id="toggle-zonas">
        <span>Mostrar etiquetas Zonas Saturadas / Latentes</span>
      </label>
    </div>
  `;

  document.getElementById("toggle-relaves").checked = noxaPanelLayers.relaves.labelsVisible === true;
  document.getElementById("toggle-zonas").checked = noxaPanelLayers.zonas.labelsVisible === true;
}

function initGeoNoxaPanelToggles() {
  document.getElementById("toggle-relaves")?.addEventListener("change", (event) => {
    toggleGeoNoxaPanelLayer("relaves", event.target.checked);
  });

  document.getElementById("toggle-zonas")?.addEventListener("change", (event) => {
    toggleGeoNoxaPanelLayer("zonas", event.target.checked);
  });
}

function getGeoNoxaPanelPolygonStyle() {
  const isSat = currentBasemap === "sat";

  if (isSat) {
    return {
      color: "#ccff00",
      weight: 2,
      opacity: 1,
      fillColor: "#ccff00",
      fillOpacity: 0.08
    };
  }

  return {
    color: "#dc2626",
    weight: 2,
    opacity: 0.95,
    fillColor: "#dc2626",
    fillOpacity: 0.06
  };
}

function getGeoNoxaZonaLabel(props) {
  const saturado = String(props?.saturado || "").trim();
  const latentes = String(props?.latentes || "").trim();

  if (saturado && saturado.toLowerCase() !== "no aplica") {
    return saturado;
  }

  if (latentes && latentes.toLowerCase() !== "no aplica") {
    return latentes;
  }

  return "";
}

function hasValidGeoNoxaGeometry(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return false;

  if (geometry.type === "Point") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return false;
    const [lon, lat] = geometry.coordinates.map(Number);
    return Number.isFinite(lat) && Number.isFinite(lon);
  }

  if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) return false;

  return true;
}

function featureIntersectsViewport(feature) {
  if (!map || !feature || !hasValidGeoNoxaGeometry(feature)) return false;

  const bounds = map.getBounds();

  try {
    if (feature.geometry.type === "Point") {
      const [lon, lat] = feature.geometry.coordinates.map(Number);
      const point = L.latLng(lat, lon);
      return Number.isFinite(point.lat) && Number.isFinite(point.lng) && bounds.contains(point);
    }

    const layer = L.geoJSON(feature);
    const featureBounds = layer.getBounds?.();

    if (featureBounds && featureBounds.isValid && featureBounds.isValid()) {
      return bounds.intersects(featureBounds);
    }

    const latlng = layer.getLayers?.()[0]?.getLatLng?.();
    if (latlng) return bounds.contains(latlng);
  } catch (err) {
    return false;
  }

  return false;
}

function renderGeoNoxaPanelLayer(layerKey) {
  const cfg = noxaPanelLayers[layerKey];
  if (!cfg) return;

  cfg.geometryLayerGroup.clearLayers();
  cfg.labelsLayerGroup.clearLayers();

  const visibleFeatures = cfg.rawFeatures.filter(featureIntersectsViewport);
  const showLabels = cfg.labelsVisible;
  const labelCandidates = [];

  visibleFeatures.forEach((feature, featureIndex) => {
    if (!hasValidGeoNoxaGeometry(feature)) return;

    const geoLayer = L.geoJSON(feature, {
      style: getGeoNoxaPanelPolygonStyle,
      onEachFeature: function (geoFeature, layer) {
        layer.on("click", (event) => captureSelectedPoint(event, {
          site: SITE_ID,
          layer_id: layerKey,
          feature_id: geoFeature?.properties?.id_relave ?? geoFeature?.properties?.id ?? geoFeature?.properties?.fid ?? null,
          feature_name: geoFeature?.properties?.recurso || geoFeature?.properties?.nombre || geoFeature?.properties?.name || "",
          source_layer: cfg.file || layerKey
        }));
      },
      pointToLayer: function (_feature, latlng) {
        if (!Number.isFinite(latlng?.lat) || !Number.isFinite(latlng?.lng)) return null;

        const style = getGeoNoxaPanelPolygonStyle();

        return L.circleMarker(latlng, {
          radius: 5,
          color: style.color,
          weight: 2,
          opacity: 1,
          fillColor: style.color,
          fillOpacity: 0.85
        });
      }
    });

    geoLayer.addTo(cfg.geometryLayerGroup);

    if (!showLabels) return;

    let labelText = "";
    if (layerKey === "relaves") labelText = GeoXLabelFormatter.formatLabelText("geonoxa", "geonoxa_relaves", feature.properties?.recurso);
    if (layerKey === "zonas") labelText = GeoXLabelFormatter.formatLabelText("geonoxa", "geonoxa_zonas", getGeoNoxaZonaLabel(feature.properties || {}));
    if (!labelText) return;

    geoLayer.eachLayer((layer, layerIndex) => {
      const latlng = typeof layer.getLatLng === "function"
        ? layer.getLatLng()
        : (typeof layer.getBounds === "function" && layer.getBounds()?.isValid?.() ? layer.getBounds().getCenter() : null);
      if (!latlng) return;

      const props = feature.properties || {};
      labelCandidates.push({
        latlng,
        text: labelText,
        id: props.id_relave ?? props.id ?? props.fid ?? `${layerKey}-${featureIndex}-${layerIndex}`,
        originalIndex: featureIndex
      });
    });
  });

  if (showLabels) {
    const labelsToRender = layerKey === "relaves"
      ? GeoXLabelGrid.selectLabels(map, labelCandidates)
      : labelCandidates;

    labelsToRender.forEach((label) => {
      L.marker(label.latlng, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "noxa-panel-label",
          html: escapeHtml(label.text),
          iconSize: null
        })
      }).addTo(cfg.labelsLayerGroup);
    });
  }

  console.log("[GeoNOXA capas_panel] render", {
    layer: layerKey,
    totalFeatures: cfg.rawFeatures.length,
    visiblesViewport: visibleFeatures.length,
    basemap: currentBasemap,
    zoom: map.getZoom(),
    labels: showLabels
  });
}

async function loadGeoNoxaPanelLayer(layerKey) {
  const cfg = noxaPanelLayers[layerKey];
  if (!cfg || cfg.loaded) return;

  const response = await fetch(cfg.file, { cache: "no-store" });
  if (!response.ok) throw new Error(`No se pudo cargar ${cfg.file}`);

  const geojson = await response.json();

  cfg.rawFeatures = Array.isArray(geojson.features) ? geojson.features : [];
  cfg.loaded = true;

  console.log("[GeoNOXA capas_panel] capa cargada", {
    layer: layerKey,
    file: cfg.file,
    features: cfg.rawFeatures.length
  });
}

async function toggleGeoNoxaPanelLayer(layerKey, checked) {
  const cfg = noxaPanelLayers[layerKey];
  if (!cfg) return;

  cfg.labelsVisible = checked;

  try {
    await loadGeoNoxaPanelLayer(layerKey);

    if (!map.hasLayer(cfg.geometryLayerGroup)) cfg.geometryLayerGroup.addTo(map);
    if (!map.hasLayer(cfg.labelsLayerGroup)) cfg.labelsLayerGroup.addTo(map);

    renderGeoNoxaPanelLayer(layerKey);
  } catch (error) {
    cfg.labelsVisible = false;
    const checkbox = document.getElementById(layerKey === "relaves" ? "toggle-relaves" : "toggle-zonas");
    if (checkbox) checkbox.checked = false;
    syncGeoNoxaMobileLabelToggle();
    console.warn("[GeoNOXA capas_panel] error cargando capa", layerKey, error);
  }

  syncGeoNoxaMobileLabelToggle();

  console.log("[GeoNOXA capas_panel] toggle etiquetas", {
    layer: layerKey,
    labelsVisible: cfg.labelsVisible
  });
}

function scheduleGeoNoxaPanelViewportUpdate() {
  if (noxaPanelUpdateTimer) {
    clearTimeout(noxaPanelUpdateTimer);
  }

  noxaPanelUpdateTimer = setTimeout(() => {
    Object.keys(noxaPanelLayers).forEach((layerKey) => {
      renderGeoNoxaPanelLayer(layerKey);
    });
  }, 120);
}

function refreshGeoNoxaPanelActiveLayers() {
  Object.keys(noxaPanelLayers).forEach((layerKey) => {
    renderGeoNoxaPanelLayer(layerKey);
  });
}

async function initGeoNOXASummary(mapInstance) {
  summaryConfig = await loadSummaryConfig();

  if (!summaryConfig || summaryConfig.activo !== true) {
    console.warn("GeoNOXA summary no activo o no disponible");
    return;
  }

  await loadSummaryLayers(summaryConfig);

  updateGeoNOXASummary(mapInstance);

  mapInstance.on("moveend zoomend", () => {
    updateGeoNOXASummary(mapInstance);
  });

  setTimeout(() => updateGeoNOXASummary(mapInstance), 400);
  setTimeout(() => updateGeoNOXASummary(mapInstance), 1000);
}

async function loadSummaryConfig() {
  const configPaths = [
    "./parametros/summary_config.json",
    "./capas_summary/summary_config.json"
  ];

  for (const configPath of configPaths) {
    try {
      const configUrl = new URL(configPath, window.location.href).toString();
      const response = await fetch(configUrl, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("No se pudo cargar summary_config.json");
      }

      const config = await response.json();
      console.log("GeoNOXA summary config loaded", configUrl);
      return config;
    } catch (error) {
      console.warn("GeoNOXA summary config error:", configPath, error);
    }
  }

  return null;
}

async function loadSummaryLayers(config) {
  summaryFeaturesByLayer = {};

  for (const capa of config.capas || []) {
    try {
      const layerUrl = new URL(capa.archivo, window.location.href).toString();

      const response = await fetch(layerUrl, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error(`No se pudo cargar ${capa.archivo}`);
      }

      const geojson = await response.json();
      const features = Array.isArray(geojson.features) ? geojson.features : [];

      summaryFeaturesByLayer[capa.id] = features;

      console.log(
        "GeoNOXA summary layer loaded:",
        capa.id,
        features.length,
        layerUrl
      );
    } catch (error) {
      console.warn("GeoNOXA summary layer error:", capa.id, error);
      summaryFeaturesByLayer[capa.id] = [];
    }
  }
}

function getFeatureLatLon(feature) {
  if (
    feature &&
    feature.geometry &&
    feature.geometry.type === "Point" &&
    Array.isArray(feature.geometry.coordinates)
  ) {
    const lon = Number(feature.geometry.coordinates[0]);
    const lat = Number(feature.geometry.coordinates[1]);

    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return { lat, lon };
    }
  }

  const props = feature.properties || {};

  const lat = Number(
    props.lat ??
    props.latitude ??
    props.latitud
  );

  const lon = Number(
    props.lon ??
    props.lng ??
    props.longitude ??
    props.longitud
  );

  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    return { lat, lon };
  }

  return null;
}

function getSummaryFeaturesInViewport(mapInstance, layerIds) {
  const bounds = mapInstance.getBounds();
  const result = [];

  (layerIds || []).forEach((layerId) => {
    const features = summaryFeaturesByLayer[layerId] || [];

    features.forEach((feature) => {
      const point = getFeatureLatLon(feature);
      if (!point) return;

      const latLng = L.latLng(point.lat, point.lon);

      if (bounds.contains(latLng)) {
        result.push(feature);
      }
    });
  });

  console.log("GeoNOXA viewport summary:", {
    bounds: bounds.toBBoxString(),
    layerIds,
    count: result.length
  });

  return result;
}

function parseSummaryNumber(value, decimalSeparator = ".") {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  let normalized = String(value).trim();

  if (decimalSeparator === ",") {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  }

  const number = Number(normalized);

  return Number.isFinite(number) ? number : 0;
}

function formatSummaryNumber(value, indicador = {}) {
  const decimals = Number.isInteger(indicador.decimales)
    ? indicador.decimales
    : 0;

  const formatted = Number(value).toLocaleString("es-CL", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });

  const prefijo = indicador.prefijo ? `${indicador.prefijo} ` : "";
  const sufijo = indicador.sufijo ? ` ${indicador.sufijo}` : "";

  return `${prefijo}${formatted}${sufijo}`;
}

function calculateSummaryIndicator(indicador, features) {
  if (indicador.operacion === "count") {
    return features.length;
  }

  if (indicador.operacion === "sum") {
    const factor = Number.isFinite(Number(indicador.factor))
      ? Number(indicador.factor)
      : 1;

    const total = features.reduce((acc, feature) => {
      const props = feature.properties || {};
      const rawValue = props[indicador.campo];
      const value = parseSummaryNumber(rawValue, indicador.decimal || ".");

      return acc + value * factor;
    }, 0);

    return formatSummaryNumber(total, indicador);
  }

  return "—";
}

function updateGeoNOXASummary(mapInstance) {
  if (!summaryConfig || !Array.isArray(summaryConfig.indicadores)) return;

  summaryConfig.indicadores.forEach((indicador) => {
    const layerIds = indicador.capas || [];
    const featuresInViewport = getSummaryFeaturesInViewport(mapInstance, layerIds);
    const value = calculateSummaryIndicator(indicador, featuresInViewport);

    console.log("GeoNOXA KPI:", indicador.id, value);

    updateSummaryKpiDom(indicador.id, value, indicador.label);
  });
}

function updateSummaryKpiDom(indicatorId, value, label) {
  const card = document.querySelector(`[data-summary-id="${indicatorId}"]`);

  if (!card) {
    console.warn("GeoNOXA KPI no encontrado:", indicatorId);
    return;
  }

  const valueEl =
    card.querySelector(".kpi-value") ||
    card.querySelector(".summary-value");

  const labelEl =
    card.querySelector(".kpi-label") ||
    card.querySelector(".summary-label");

  if (valueEl) valueEl.textContent = value;
  if (labelEl && label) labelEl.textContent = label;
}

// GEOFACTORY SELECTOR REGIÓN
// CARGA regiones.json
async function cargarRegionesSelector() {
  const selector = document.getElementById("region-selector");
  if (!selector) return;

  try {
    const response = await fetch(REGIONES_PATH);
    if (!response.ok) throw new Error(`No se pudo cargar ${REGIONES_PATH}`);

    const data = await response.json();
    regionesSelector = Array.isArray(data)
      ? data.filter((region) => region && region.activo === true)
      : [];

    if (!regionesSelector.length) {
      throw new Error(`${REGIONES_PATH} no contiene regiones activas`);
    }

    selector.innerHTML = "";
    regionesSelector.forEach((region) => {
      const option = document.createElement("option");
      option.value = String(region.codigo_ine || "");
      option.textContent = region.nombre || "Región sin nombre";
      selector.appendChild(option);
    });
  } catch (error) {
    regionesSelector = [];
    console.warn("GEOFACTORY SELECTOR REGIÓN: regiones.json no disponible. Se mantiene el selector actual como respaldo.", error);
  }
}

function conectarRegionSelector() {
  const regionSelector = document.getElementById("region-selector");
  if (!regionSelector) return;

  regionSelector.addEventListener("change", () => moverViewportPorRegion(regionSelector.value));
}

// MOVER VIEWPORT POR REGIÓN
function moverViewportPorRegion(codigoIne) {
  if (!map || !codigoIne || !regionesSelector.length) return;

  const region = regionesSelector.find((item) => String(item.codigo_ine) === String(codigoIne));
  if (!region) return;

  if (Array.isArray(region.bbox) && region.bbox.length === 2) {
    map.fitBounds(region.bbox);
    return;
  }

  if (Array.isArray(region.centro) && region.centro.length === 2) {
    const zoom = Number.isFinite(Number(region.zoom)) ? Number(region.zoom) : map.getZoom();
    map.setView(region.centro, zoom);
  }
}

function conectarBaseMapToggle() {
  const btnOsm = getBaseMapButton("osm");
  const btnSat = getBaseMapButton("sat");

  if (btnOsm) {
    btnOsm.addEventListener("click", () => switchBaseMap("osm"));
  }

  if (btnSat) {
    btnSat.addEventListener("click", () => switchBaseMap("sat"));
  }
}

function getBaseMapButton(type) {
  const explicitSelectors = type === "osm"
    ? ["#btn-osm", "#osmBtn", ".btn-osm", '[data-map="osm"]']
    : ["#btn-sat", "#satBtn", ".btn-sat", '[data-map="sat"]'];

  for (const selector of explicitSelectors) {
    const button = document.querySelector(selector);
    if (button) return button;
  }

  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent.trim().toLowerCase() === type
  );
}

function switchBaseMap(type) {
  if (!map || !osmLayer || !satLayer) return;

  const nextLayer = type === "sat" ? satLayer : osmLayer;
  const previousLayer = type === "sat" ? osmLayer : satLayer;

  if (map.hasLayer(previousLayer)) {
    map.removeLayer(previousLayer);
  }

  if (!map.hasLayer(nextLayer)) {
    nextLayer.addTo(map);
  }

  currentBaseLayer = nextLayer;
  currentBasemap = type === "sat" ? "sat" : "osm";
  setBaseMapToggleActive(currentBasemap);
  refreshGeoNoxaPanelActiveLayers();
}

function setBaseMapToggleActive(type) {
  const btnOsm = getBaseMapButton("osm");
  const btnSat = getBaseMapButton("sat");

  if (btnOsm) {
    btnOsm.classList.toggle("active", type === "osm");
    btnOsm.setAttribute("aria-pressed", String(type === "osm"));
  }

  if (btnSat) {
    btnSat.classList.toggle("active", type === "sat");
    btnSat.setAttribute("aria-pressed", String(type === "sat"));
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

(function initGeoFactoryIntroModal() {
  const MODAL_CONFIG_PATH = "./parametros/log-modal.json";
  const MODAL_CONFIG_FALLBACK_PATH = "./assets/log-modal.json";

  async function loadModalConfig() {
    const response = await fetch(MODAL_CONFIG_PATH);
    if (response.ok) return response.json();

    const fallbackResponse = await fetch(MODAL_CONFIG_FALLBACK_PATH);
    if (!fallbackResponse.ok) throw new Error(`No se pudo cargar ${MODAL_CONFIG_PATH}`);
    return fallbackResponse.json();
  }

  function ensureModalStyles() {
    if (document.getElementById("geofactory-intro-modal-styles")) return;

    const style = document.createElement("style");
    style.id = "geofactory-intro-modal-styles";
    style.textContent = `
      .geofactory-intro-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,7,18,.68)}
      .geofactory-intro-modal{width:min(92vw,560px);max-height:90vh;overflow-y:auto;border-radius:18px;background:#fff;color:#071225;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,.38);text-align:center;font-family:inherit}
      .geofactory-intro-image{display:block;width:100%;max-width:480px;height:auto;margin:0 auto 20px;border-radius:12px}
      .geofactory-intro-actions{display:flex;align-items:center;justify-content:center;gap:18px;flex-wrap:wrap}
      .geofactory-intro-button{border:0;border-radius:12px;padding:14px 26px;background:#071225;color:#fff;font-weight:800;font-size:.95rem;cursor:pointer;box-shadow:0 12px 28px rgba(7,18,37,.22)}
      .geofactory-intro-button:hover{transform:translateY(-1px)}
      .geofactory-intro-button:focus-visible,.geofactory-intro-check input:focus-visible{outline:3px solid rgba(37,99,235,.35);outline-offset:3px}
      .geofactory-intro-check{display:inline-flex;align-items:center;gap:8px;color:#4b5563;font-size:.95rem;cursor:pointer}
      .geofactory-intro-check input{width:16px;height:16px}
      @media(max-width:640px){.geofactory-intro-overlay{padding:12px}.geofactory-intro-modal{width:min(94vw,420px);padding:20px;border-radius:16px}.geofactory-intro-actions{flex-direction:column;gap:12px}.geofactory-intro-button{width:100%}.geofactory-intro-image{max-width:100%;margin-bottom:18px}}
    `;
    document.head.appendChild(style);
  }

  function localStorageHas(storageKey) {
    return Boolean(storageKey && window.localStorage.getItem(storageKey));
  }

  function buildModal(modalIntro) {
    const imageConfig = modalIntro.imagen || {};
    const imageSrc = `${imageConfig.ruta || ""}${imageConfig.archivo || ""}`;
    if (!imageSrc) return null;

    const existingHardcodedOverlay = document.getElementById("geoipt-intro-overlay");
    if (existingHardcodedOverlay) existingHardcodedOverlay.remove();

    const overlay = document.createElement("div");
    overlay.className = "geofactory-intro-overlay";

    const modal = document.createElement("div");
    modal.className = "geofactory-intro-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Modal introductorio");

    const image = document.createElement("img");
    image.className = "geofactory-intro-image";
    image.src = imageSrc;
    image.alt = imageConfig.alt || "Instrucciones de uso";

    const actions = document.createElement("div");
    actions.className = "geofactory-intro-actions";

    const button = document.createElement("button");
    button.className = "geofactory-intro-button";
    button.type = "button";
    button.textContent = modalIntro.botonTexto || "Comenzar";

    const label = document.createElement("label");
    label.className = "geofactory-intro-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";

    label.append(checkbox, document.createTextNode("No volver a mostrar"));
    actions.append(button, label);
    modal.append(image, actions);
    overlay.appendChild(modal);

    button.addEventListener("click", () => {
      if (checkbox.checked && modalIntro.storageKey) {
        window.localStorage.setItem(modalIntro.storageKey, "true");
      }
      overlay.remove();
    });

    return overlay;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try {
      if (isCrossAccessNavigationFromUrl()) {
        const existingHardcodedOverlay = document.getElementById("geoipt-intro-overlay");
        if (existingHardcodedOverlay) existingHardcodedOverlay.remove();
        return;
      }

      const config = await loadModalConfig();
      const modalIntro = config && config.modalIntro;
      if (!modalIntro || modalIntro.activo !== true || localStorageHas(modalIntro.storageKey)) return;

      ensureModalStyles();
      const modal = buildModal(modalIntro);
      if (modal) document.body.appendChild(modal);
    } catch (error) {
      console.warn("GeoFactory modal inicial no disponible.", error);
    }
  });
})();
