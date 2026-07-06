let map;
let osmLayer;
let satLayer;
let currentBaseLayer;
let currentBasemap = "osm";
let initialCrossAccessState = null;
let selectedPoint = null;
let selectedFeatureContext = null;
const SITE_ID = "geoipt";
const CROSS_ACCESS_PARAM_NAME = "from";
const CROSS_ACCESS_PARAM_VALUE = "crossaccess";

const PARAMS_PATH = "parametros/parametros_index.json";
const REGIONES_PATH = "capas_selector/regiones.json";
let regionesSelector = [];

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

  const lat = parseFloat(params.get("lat"));
  const lon = parseFloat(params.get("lon"));
  const zoom = parseInt(params.get("zoom"), 10);
  const requestedBasemap = params.get("basemap") || "osm";
  const basemap = requestedBasemap === "sat" ? "sat" : "osm";

  console.log("[GeoX cross_access receive]", {
    lat,
    lon,
    zoom,
    basemap
  });

  initialCrossAccessState = {
    viewport: Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(zoom)
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

function captureSelectedPoint(event, featureContext = null) {
  const latlng = event?.latlng || event;
  if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng)) return null;

  const originalEvent = event?.originalEvent;
  if (featureContext && originalEvent) originalEvent.__geoxFeatureContext = featureContext;

  selectedPoint = {
    lat: latlng.lat,
    lon: latlng.lng,
    source: "map_click",
    site: SITE_ID,
    timestamp: new Date().toISOString()
  };
  selectedFeatureContext = featureContext || originalEvent?.__geoxFeatureContext || null;
  window.selectedPoint = selectedPoint;
  window.selectedFeatureContext = selectedFeatureContext;
  return selectedPoint;
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
  try {
    const params = await cargarParametros();
    aplicarParametros(params);

    // Cargar configuración y capas summary (si existen) antes de iniciar el mapa
    try {
      await cargarSummaryConfigYCapas();
    } catch (err) {
      console.warn("No se pudo cargar summary_config o capas summary:", err);
    }

    iniciarMapa(params);
    initGeoXCrossPortalNavigation();
    await cargarRegionesSelector();
    conectarEventos();
    cargarListadoToSearch();
    await cargarLabelDensityConfig();
    await cargarListadoPanelTerritorial();
    iniciarPanelTerritorial();

    // Si hay summary cargado, calcular indicadores y suscribirse a eventos del mapa
    if (summaryConfig && map) {
      calcularYActualizarIndicadores();
      map.on("moveend zoomend", calcularYActualizarIndicadores);
    }

    console.log("GeoX iniciado correctamente:", params);
  } catch (error) {
    console.error("Error iniciando GeoX:", error);
    alert("No se pudo iniciar GeoX. Revisa parametros_index.json y la consola.");
  }
});

async function cargarParametros() {
  const response = await fetch(PARAMS_PATH);

  if (!response.ok) {
    throw new Error(`No se pudo cargar ${PARAMS_PATH}`);
  }

  return await response.json();
}

function aplicarParametros(params) {
  document.title = `${params.sitio} - GeoFactory`;

  const siteTitle = document.getElementById("site-title");
  const siteSubtitle = document.getElementById("site-subtitle");
  const panelTitle = document.getElementById("panel-title");
  const searchBox = document.getElementById("search-box");

  siteTitle.textContent = params.titulo || "GeoX";
  siteSubtitle.textContent = params.subtitulo || "Molde territorial genérico";
  panelTitle.textContent = "Etiquetas";
  searchBox.placeholder = params.search_placeholder || "Buscar...";

  if (Array.isArray(params.summary_items)) {
    actualizarSummaryEnDom(params.summary_items);
  }
}

function crearSummaryItem(item) {
  const div = document.createElement("div");
  div.className = "summary-item";

  div.innerHTML = `
    <span class="summary-value">${item.value}</span>
    <span class="summary-label">${item.label}</span>
  `;

  return div;
}

function actualizarSummaryEnDom(items) {
  const summaryBar = document.getElementById("summary-bar");
  const mobileSummaryContent = document.getElementById("mobile-summary-content");

  [summaryBar, mobileSummaryContent].forEach((container) => {
    if (!container) return;

    container.innerHTML = "";
    items.forEach((item) => {
      container.appendChild(crearSummaryItem(item));
    });
  });
}

function iniciarMapa(params) {
  const centro = params.centro_mapa || [-27.3668, -70.3323];
  const zoom = params.zoom_inicial || 7;

  map = L.map("map", {
    zoomControl: true
  }).setView(centro, zoom);
  window.geoxMap = map;

  initGeoXInitialLocation(map);

  osmLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }
  );

  satLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri"
    }
  );

  const initialBasemap = getInitialBasemapFromUrl() || params.mapa_base || "osm";
  switchBaseMap(initialBasemap === "sat" ? "sat" : "osm");

  // GEOFACTORY ESCALA GRÁFICA
  L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false,
    maxWidth: 120
  }).addTo(map);

  ensureTerritorialLabelsLayer();

  map.invalidateSize();
  map.on("click", handleMapClick);
  map.on("moveend zoomend", scheduleTerritorialLabelUpdate);
}

function conectarEventos() {
  const regionSelector = document.getElementById("region-selector");

  if (regionSelector) {
    regionSelector.addEventListener("change", () => moverViewportPorRegion(regionSelector.value));
  }

  const btnOsm = document.getElementById("btn-osm");
  const btnSat = document.getElementById("btn-sat");

  if (btnOsm) {
    btnOsm.addEventListener("click", () => {
      switchBaseMap("osm");
      setMapToggleActive("osm");
    });
  }

  if (btnSat) {
    btnSat.addEventListener("click", () => {
      switchBaseMap("sat");
      setMapToggleActive("sat");
    });
  }

  document.getElementById("btn-clear").addEventListener("click", () => {
    document.getElementById("search-box").value = "";
    cerrarResultadosToSearch();
  });

  document.getElementById("btn-search").addEventListener("click", () => {
    seleccionarPrimerResultadoToSearch();
  });

  initGeoXMyLocationButton(map);

  conectarMobileSummaryDrawer();
  conectarSearchBoxToSearch();
}

function conectarMobileSummaryDrawer() {
  const mobileSummaryToggle = document.getElementById("mobile-summary-toggle");
  const mobileSummaryDrawer = document.getElementById("mobile-summary-drawer");

  if (!mobileSummaryToggle || !mobileSummaryDrawer) return;

  mobileSummaryToggle.textContent = "Summary ▼";
  mobileSummaryToggle.setAttribute("aria-expanded", "false");

  mobileSummaryToggle.addEventListener("click", () => {
    const isOpen = mobileSummaryDrawer.classList.toggle("is-open");
    mobileSummaryToggle.setAttribute("aria-expanded", String(isOpen));
    mobileSummaryToggle.textContent = isOpen ? "Summary ▲" : "Summary ▼";
  });
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

function setMapToggleActive(type) {
  const btnOsm = document.getElementById("btn-osm");
  const btnSat = document.getElementById("btn-sat");

  if (!btnOsm || !btnSat) return;

  btnOsm.classList.toggle("active", type === "osm");
  btnSat.classList.toggle("active", type === "sat");
}

function switchBaseMap(type) {
  if (!map) return;

  if (type === "osm") {
    if (satLayer && map.hasLayer(satLayer)) map.removeLayer(satLayer);
    if (osmLayer && !map.hasLayer(osmLayer)) osmLayer.addTo(map);
    currentBaseLayer = osmLayer;
    currentBasemap = "osm";
  }

  if (type === "sat") {
    if (osmLayer && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
    if (satLayer && !map.hasLayer(satLayer)) satLayer.addTo(map);
    currentBaseLayer = satLayer;
    currentBasemap = "sat";
  }

  setMapToggleActive(type);
  actualizarEstiloPerimetrosIptVisibles();
  scheduleTerritorialLabelUpdate();
}

// GEOFACTORY TOSEARCH
const TOSEARCH_DIR = "capas_tosearch";
const TOSEARCH_FILE_PREFIX = "perimetros_capas_";
const TOSEARCH_FILE_COUNT = 16;
const toSearchIndice = [];
let toSearchIndicePromise = null;
let toSearchResultadosActuales = [];
let toSearchHighlightLayer = null;
let selectedPRCHighlightLayer = null;
let mapHintTimeoutId = null;
let resultadosBusquedaActual = [];
let searchActiveIndex = -1;
let puntoConsultaMarker = null;
let bloquearCierreBusquedaPorClickMapa = false;

function normalizarTextoToSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// CARGA índice nacional desde capas_tosearch/perimetros_capas_XX.geojson
async function cargarListadoToSearch() {
  if (toSearchIndice.length) return toSearchIndice;
  if (toSearchIndicePromise) return toSearchIndicePromise;

  console.log("[GeoIPT Search] cargando índice nacional capas_tosearch/");

  toSearchIndicePromise = (async () => {
    const archivos = Array.from({ length: TOSEARCH_FILE_COUNT }, (_, index) => {
      const numero = String(index + 1).padStart(2, "0");
      return `${TOSEARCH_DIR}/${TOSEARCH_FILE_PREFIX}${numero}.geojson`;
    });

    await Promise.all(archivos.map((archivo) => cargarCapaToSearch({ archivo })));

    console.log(`[GeoIPT Search] índice nacional listo | total features: ${toSearchIndice.length}`);
    return toSearchIndice;
  })();

  return toSearchIndicePromise;
}

async function cargarCapaToSearch(layerConfig) {
  const archivo = layerConfig?.archivo;
  if (!archivo) return;

  try {
    const response = await fetch(archivo);
    if (response.status === 404) {
      console.warn(`[GeoIPT Search] archivo no encontrado: ${archivo.split("/").pop()}`);
      return;
    }
    if (!response.ok) throw new Error(`No se pudo cargar ${archivo}`);

    const geojson = await response.json();
    const features = Array.isArray(geojson.features) ? geojson.features : [];

    features.forEach((feature) => agregarFeatureAlIndiceToSearch(feature, layerConfig));
    console.log(`[GeoIPT Search] archivo cargado: ${archivo.split("/").pop()} | features: ${features.length}`);
  } catch (error) {
    console.warn(`[GeoIPT Search] archivo no encontrado: ${archivo.split("/").pop()}`, error);
  }
}

// INDICE DE BUSQUEDA POR LOCALIDAD
// GEOFACTORY SEARCH CONTEXTO TERRITORIAL
function obtenerPropTexto(props, nombresCampos) {
  for (const nombre of nombresCampos) {
    const valor = props?.[nombre];
    if (valor !== undefined && valor !== null && String(valor).trim() !== "") {
      return String(valor).trim();
    }
  }
  return "";
}


function obtenerNombrePrc(feature) {
  const props = feature?.properties || {};
  return obtenerPropTexto(props, ["nombre_prc", "localidad", "LOC", "LOCALIDAD", "nombre", "NOMBRE"]) || "PRC sin nombre";
}

function normalizarLatLng(clickedLatLng) {
  if (!clickedLatLng) return null;
  if (Number.isFinite(clickedLatLng.lat) && Number.isFinite(clickedLatLng.lng)) return clickedLatLng;
  if (Number.isFinite(clickedLatLng.lat) && Number.isFinite(clickedLatLng.lon)) return L.latLng(clickedLatLng.lat, clickedLatLng.lon);
  if (Array.isArray(clickedLatLng) && clickedLatLng.length >= 2) return L.latLng(Number(clickedLatLng[0]), Number(clickedLatLng[1]));
  return null;
}

function obtenerLatLngRepresentativoFeature(feature, bounds) {
  if (bounds?.isValid?.()) return bounds.getCenter();
  try {
    const featureBounds = L.geoJSON(feature).getBounds();
    if (featureBounds.isValid()) return featureBounds.getCenter();
  } catch (error) {
    console.warn("No se pudo obtener punto representativo para PRC.", error);
  }
  return null;
}

function handlePRCSelection(feature, clickedLatLng, options = {}) {
  const punto = normalizarLatLng(clickedLatLng);
  if (!punto) return;

  captureSelectedPoint(punto, {
    site: SITE_ID,
    layer_id: options.layer_id || "prc",
    feature_id: feature?.properties?.id || feature?.properties?.fid || feature?.id || null,
    feature_name: obtenerNombrePrc(feature),
    source_layer: options.source || "direct"
  });
}

function puntoEnAnillo(lonLat, ring) {
  const [x, y] = lonLat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersecta = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersecta) inside = !inside;
  }
  return inside;
}

function puntoEnPoligono(lonLat, polygon) {
  if (!Array.isArray(polygon?.[0])) return false;
  if (!puntoEnAnillo(lonLat, polygon[0])) return false;
  return !polygon.slice(1).some((hole) => puntoEnAnillo(lonLat, hole));
}

function puntoEnFeature(latLng, feature) {
  const geometry = feature?.geometry;
  if (!latLng || !geometry) return false;
  const lonLat = [latLng.lng, latLng.lat];
  if (geometry.type === "Polygon") return puntoEnPoligono(lonLat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.some((polygon) => puntoEnPoligono(lonLat, polygon));
  return false;
}

function colocarMarcadorPunto(clickedLatLng) {
  if (!map || !clickedLatLng) return;

  if (puntoConsultaMarker && map.hasLayer(puntoConsultaMarker)) {
    map.removeLayer(puntoConsultaMarker);
  }

  puntoConsultaMarker = L.circleMarker(clickedLatLng, {
    radius: 6,
    color: "#0f172a",
    weight: 2,
    opacity: 1,
    fillColor: "#38bdf8",
    fillOpacity: 0.9
  }).addTo(map);
}

function findContainingPRCFromPerimetros(latlng) {
  const features = getPerimetrosIPTFeatures();
  if (!Array.isArray(features) || !features.length || !latlng) return null;

  if (window.turf?.point && window.turf?.booleanPointInPolygon) {
    const point = window.turf.point([latlng.lng, latlng.lat]);

    for (const feature of features) {
      try {
        if (window.turf.booleanPointInPolygon(point, feature)) {
          return feature;
        }
      } catch (err) {
        console.warn("No se pudo evaluar punto en polígono", err, feature);
      }
    }

    return null;
  }

  for (const feature of features) {
    try {
      if (puntoEnFeature(latlng, feature)) return feature;
    } catch (err) {
      console.warn("No se pudo evaluar punto en polígono", err, feature);
    }
  }

  return null;
}

function normalizarRegionGeoCard(region) {
  const digits = String(region || "").trim().replace(/\D/g, "");
  return digits ? digits.padStart(2, "0") : "";
}

function getRegionActualParaGeoCard() {
  const possibleIds = [
    "region-selector",
    "region-select",
    "regionSelector",
    "select-region",
    "region"
  ];

  for (const id of possibleIds) {
    const el = document.getElementById(id);
    const region = normalizarRegionGeoCard(el?.value);
    if (region) return region;
  }

  return normalizarRegionGeoCard(window.regionActual);
}


function getPRCArchivoFromFeature(feature) {
  const p = feature?.properties || {};
  return (
    p.archivo
    || p.file
    || p.kml
    || p.capa_kml
    || p.prc_archivo
    || p.PRC_ARCHIVO
    || ""
  );
}

function getRegionFromFeatureOrSelector(feature) {
  const props = feature?.properties || {};
  const candidates = [
    props.REG,
    props.region,
    props.REGION,
    props.cod_region,
    props.region_id,
    props.id_region
  ];

  for (const value of candidates) {
    const region = normalizarRegionGeoCard(value);
    if (region) return region;
  }

  return getRegionActualParaGeoCard();
}

function buscarItemPrcContenedor(latLng) {
  return toSearchIndice.find((item) => item?.bounds?.contains?.(latLng) && puntoEnFeature(latLng, item.feature)) || null;
}

function handleMapClick(event) {
  if (!event?.latlng) return;

  const clickedLatLng = event.latlng;
  const containingPRC = findContainingPRCFromPerimetros(clickedLatLng);

  captureSelectedPoint(clickedLatLng, containingPRC ? {
    site: SITE_ID,
    layer_id: "prc",
    feature_id: containingPRC?.properties?.id || containingPRC?.properties?.fid || containingPRC?.id || null,
    feature_name: obtenerNombrePrc(containingPRC),
    source_layer: "perimetros_ipt"
  } : null);
}

function getSearchInputElement() {
  return document.getElementById("search-input")
    || document.getElementById("prc-search")
    || document.getElementById("search-box");
}

function getSearchResultsElement() {
  return document.getElementById("search-results")
    || document.getElementById("prc-search-results");
}

function abrirResultadosBusqueda(contenedor = getSearchResultsElement()) {
  if (!contenedor) {
    console.warn("No existe contenedor de resultados del buscador");
    return null;
  }

  contenedor.hidden = false;
  contenedor.removeAttribute("hidden");
  contenedor.classList.add("is-visible", "is-open");
  contenedor.style.display = "block";

  return contenedor;
}

function renderFallbackResultadosCercanos(items) {
  resultadosBusquedaActual = items || [];
  searchActiveIndex = -1;

  const searchInput = getSearchInputElement();
  const searchResults = getSearchResultsElement();

  if (!searchResults) {
    console.warn("No existe contenedor de resultados del buscador.");
    return;
  }

  if (searchInput) {
    searchInput.value = "";
    searchInput.focus();
  }

  if (!items || !items.length) {
    searchResults.innerHTML = `
      <div class="map-search-empty search-empty search-results-message">
        No encontramos un PRC exacto en ese punto, y no hay sugerencias disponibles.
      </div>
    `;
    abrirResultadosBusqueda(searchResults);
    return;
  }

  searchResults.innerHTML = `
    <div class="map-search-empty search-empty search-results-message nearest-header" style="padding-bottom: 8px;">
      No encontramos un PRC exacto en ese punto.<br>
      Estos son los 3 PRC más cercanos:
    </div>
    ${items.map((item, idx) => {
      const meta = [item.comuna, item.region_nombre].filter(Boolean).join(" · ");
      const distancia = Number(item.distancia_km);
      const distanciaTexto = Number.isFinite(distancia)
        ? distancia.toFixed(1) + " km"
        : "distancia no disponible";
      const metaTexto = [meta, distanciaTexto].filter(Boolean).join(" · ");

      return `
        <button
          type="button"
          class="map-search-item search-result-item nearest-prc-item"
          data-index="${idx}"
        >
          <span class="map-search-title search-result-title">
            ${escapeHtml(item.nombre || "PRC sin nombre")}
          </span>
          <span class="map-search-meta search-result-meta">
            ${escapeHtml(metaTexto)}
          </span>
        </button>
      `;
    }).join("")}
  `;

  abrirResultadosBusqueda(searchResults);

  searchResults.querySelectorAll(".map-search-item, .search-result-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const idx = Number(btn.dataset.index);
      const item = resultadosBusquedaActual[idx];
      if (item) await seleccionarResultadoBusqueda(item, { source: "nearest" });
    });
  });
}

function bboxEsValido(bbox) {
  return (
    Array.isArray(bbox)
    && bbox.length === 2
    && Array.isArray(bbox[0])
    && Array.isArray(bbox[1])
    && bbox[0].length === 2
    && bbox[1].length === 2
    && bbox.every((par) => Array.isArray(par) && par.every((num) => Number.isFinite(Number(num))))
  );
}

function fitBoundsDesdeBbox(bbox) {
  if (!bboxEsValido(bbox) || !map) return false;

  const sw = L.latLng(Number(bbox[0][0]), Number(bbox[0][1]));
  const ne = L.latLng(Number(bbox[1][0]), Number(bbox[1][1]));
  const bounds = L.latLngBounds(sw, ne);

  if (!bounds.isValid()) return false;

  map.fitBounds(bounds, {
    padding: [30, 30],
    maxZoom: 16
  });

  return true;
}

function getBboxFromFeature(feature) {
  try {
    const layer = L.geoJSON(feature);
    const bounds = layer.getBounds();

    if (!bounds || !bounds.isValid()) return null;

    return [
      [bounds.getSouth(), bounds.getWest()],
      [bounds.getNorth(), bounds.getEast()]
    ];
  } catch (err) {
    console.warn("No se pudo calcular bbox del feature", err);
    return null;
  }
}

function zoomToGeoJsonFeature(feature) {
  if (!feature || !map) return false;

  const bbox = getBboxFromFeature(feature);
  return fitBoundsDesdeBbox(bbox);
}

function centroDesdeBbox(bbox) {
  if (!bboxEsValido(bbox)) return null;

  const south = Number(bbox[0][0]);
  const west = Number(bbox[0][1]);
  const north = Number(bbox[1][0]);
  const east = Number(bbox[1][1]);

  return {
    lat: (south + north) / 2,
    lon: (west + east) / 2
  };
}

function distanciaAproximadaKm(a, b) {
  if (!a || !b) return Infinity;

  const dLat = Number(a.lat) - Number(b.lat);
  const dLon = Number(a.lon) - Number(b.lon);

  return Math.sqrt(dLat * dLat + dLon * dLon) * 111;
}

function obtenerPrcCercanosDesdePerimetros(lat, lon, limite = 3) {
  const origen = { lat: Number(lat), lon: Number(lon) };

  if (!Number.isFinite(origen.lat) || !Number.isFinite(origen.lon)) {
    return [];
  }

  const features = getPerimetrosIPTFeatures();

  if (!Array.isArray(features) || !features.length) {
    console.warn("No hay features de Perímetros IPT disponibles para calcular cercanos.");
    return [];
  }

  return features
    .map((feature) => {
      const props = feature.properties || {};
      const bbox = normalizarBboxPerimetro(props.bbox || feature.bbox || getBboxFromFeature(feature));
      const centro = centroDesdeBbox(bbox);

      return {
        nombre: getPRCDisplayName(feature),
        comuna: props.comuna || props.COMUNA || props.Comuna || "",
        region_nombre: props.region_nombre || props.region || props.REGION || props.Región || "",
        region_codigo: props.region_codigo || props.codigo_region || props.cod_region || "",
        archivo: props.archivo || props.file || props.kml || props.capa_kml || "",
        carpeta: props.carpeta || "",
        bbox,
        feature,
        distancia_km: centro ? distanciaAproximadaKm(origen, centro) : Infinity
      };
    })
    .filter((item) => item.nombre && bboxEsValido(item.bbox) && Number.isFinite(item.distancia_km))
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, limite);
}

function normalizarBboxPerimetro(bbox) {
  if (bboxEsValido(bbox)) return bbox;
  if (Array.isArray(bbox) && bbox.length === 4) {
    const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
    if ([minLon, minLat, maxLon, maxLat].every(Number.isFinite)) {
      return [[minLat, minLon], [maxLat, maxLon]];
    }
  }
  return null;
}

function getPerimetrosIPTFeatures() {
  if (window.perimetrosIPTData?.features) return window.perimetrosIPTData.features;
  if (window.perimetrosData?.features) return window.perimetrosData.features;
  if (Array.isArray(window.perimetrosIPTFeatures)) return window.perimetrosIPTFeatures;

  const features = [];
  panelGeojsonCargados.forEach((geojson) => {
    if (Array.isArray(geojson?.features)) features.push(...geojson.features);
  });

  return features;
}

function getPRCDisplayName(feature) {
  const p = feature?.properties || {};

  return (
    p.nombre
    || p.NOMBRE
    || p.nombre_prc
    || p.prc
    || p.PRC
    || p.instrumento
    || p.INSTRUMENTO
    || p.localidad
    || p.comuna
    || p.COMUNA
    || "PRC sin nombre"
  );
}

function limpiarNombrePrcParaResultado(nombrePrc) {
  if (!nombrePrc) return "";

  const texto = String(nombrePrc).trim();
  const matchPrc = texto.match(/(?:^|_)PRC[_\s-]+(.+)$/i);
  const base = (matchPrc ? matchPrc[1] : texto.replace(/^PRC[_\s-]+/i, "")).replace(/[_-]+/g, " ").trim();

  return base.replace(/\s+/g, " ").replace(/\b\p{L}/gu, (letra) => letra.toLocaleUpperCase("es-CL"));
}

function construirLineaResultadoToSearch({ localidad, comuna, nombrePrc, region }) {
  const localidadDisplay = localidad || comuna || limpiarNombrePrcParaResultado(nombrePrc);
  const comunaDisplay = comuna || limpiarNombrePrcParaResultado(nombrePrc);
  const partes = [];

  if (localidadDisplay) partes.push(localidadDisplay);
  if (comunaDisplay && normalizarTextoToSearch(comunaDisplay) !== normalizarTextoToSearch(localidadDisplay)) {
    partes.push(comunaDisplay);
  }
  if (region) partes.push(region);

  return partes.join(" · ") || localidadDisplay || comunaDisplay || "PRC sin nombre";
}

// RESULTADO LOCALIDAD COMUNA REGION
function construirTextoResultadoToSearch(props) {
  const nombreBusq = obtenerPropTexto(props, ["nombre_busq", "NOMBRE_BUSQ"]);
  const localidad = obtenerPropTexto(props, ["localidad", "LOC", "LOCALIDAD"]);
  const comuna = obtenerPropTexto(props, ["comuna", "COM", "COMUNA"]);
  const nombrePrc = obtenerPropTexto(props, ["nombre_prc", "PRC", "prc", "nombre", "NOMBRE"]);
  const region = obtenerPropTexto(props, ["region", "REG", "REGION", "region_nombre"]);
  const zona = obtenerPropTexto(props, ["zona", "ZONA"]);
  const textoResultado = construirLineaResultadoToSearch({ localidad, comuna, nombrePrc, region });
  const textoBusqueda = normalizarTextoToSearch(
    [nombreBusq, localidad, comuna, nombrePrc, region, zona].filter(Boolean).join(" ")
  );

  return {
    id: obtenerPropTexto(props, ["id", "ID", "fid_origen"]),
    text: nombreBusq || textoResultado,
    texto_localidad: localidad,
    texto_comuna: comuna,
    texto_nombre_prc: nombrePrc,
    texto_region: region,
    texto_zona: zona,
    texto_resultado: textoResultado,
    texto_busqueda: textoBusqueda
  };
}

function agregarFeatureAlIndiceToSearch(feature, layerConfig) {
  if (!feature) return;

  const props = feature.properties || {};
  const textosTerritoriales = construirTextoResultadoToSearch(props);
  if (!textosTerritoriales.texto_busqueda) return;

  const bounds = obtenerBoundsFeatureToSearch(feature);
  if (!bounds || !bounds.isValid()) {
    console.warn("[GeoIPT Search] geometría inválida para feature de búsqueda", props);
    return;
  }

  toSearchIndice.push({
    ...textosTerritoriales,
    nombre: textosTerritoriales.texto_localidad || textosTerritoriales.texto_nombre_prc || textosTerritoriales.texto_resultado,
    texto_display: textosTerritoriales.texto_resultado,
    feature,
    geometry: feature.geometry || null,
    source_file: layerConfig?.archivo || "",
    layer_config: layerConfig,
    bounds
  });
}

function obtenerBoundsFeatureToSearch(feature) {
  try {
    if (feature?.geometry) {
      const bounds = L.geoJSON(feature).getBounds();
      if (bounds?.isValid?.()) return bounds;
    }

    const bbox = normalizarBboxPerimetro(feature?.bbox);
    if (bbox) return L.latLngBounds(bbox);
  } catch (error) {
    console.warn("[GeoIPT Search] geometría inválida; se intentará bbox si existe.", error);
  }

  const bbox = normalizarBboxPerimetro(feature?.bbox);
  return bbox ? L.latLngBounds(bbox) : null;
}

function getFeatureBounds(feature) {
  return obtenerBoundsFeatureToSearch(feature);
}

function conectarSearchBoxToSearch() {
  const searchBox = document.getElementById("search-box");
  if (!searchBox) return;

  searchBox.addEventListener("input", () => mostrarResultadosToSearch(searchBox.value));
  searchBox.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      seleccionarPrimerResultadoToSearch();
    } else if (event.key === "Escape") {
      cerrarResultadosToSearch();
    }
  });

  document.addEventListener("click", (event) => {
    if (bloquearCierreBusquedaPorClickMapa) {
      bloquearCierreBusquedaPorClickMapa = false;
      return;
    }

    const wrapper = document.getElementById("map-search-wrap")
      || document.getElementById("floating-search")
      || document.getElementById("search-box-wrapper")
      || document.querySelector(".map-search-wrap");

    if (!wrapper) return;

    if (!wrapper.contains(event.target)) cerrarResultadosToSearch();
  });
}

// RESULTADOS SEARCH BOX
function buscarResultadosToSearch(texto) {
  const query = normalizarTextoToSearch(texto);
  if (!query) return [];

  const resultados = toSearchIndice
    .filter((item) => item.texto_busqueda.includes(query))
    .sort((a, b) => a.texto_resultado.localeCompare(b.texto_resultado, "es"))
    .slice(0, 20);

  console.log(`[GeoIPT Search] búsqueda: ${texto} | resultados: ${resultados.length}`);
  return resultados;
}

function mostrarResultadosToSearch(texto) {
  const contenedor = document.getElementById("search-results");
  if (!contenedor) return;

  toSearchResultadosActuales = buscarResultadosToSearch(texto);
  contenedor.innerHTML = "";

  if (!toSearchResultadosActuales.length) {
    contenedor.hidden = true;
    contenedor.classList.remove("is-visible", "is-open");
    contenedor.style.display = "none";
    return;
  }

  toSearchResultadosActuales.forEach((item) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "search-result-item";
    boton.textContent = item.texto_resultado;
    boton.title = item.texto_resultado;

    boton.addEventListener("click", () => seleccionarResultadoToSearch(item));
    contenedor.appendChild(boton);
  });

  abrirResultadosBusqueda(contenedor);
}

function ocultarResultadosBusqueda() {
  resultadosBusquedaActual = [];
  toSearchResultadosActuales = [];
  searchActiveIndex = -1;

  const searchResults = getSearchResultsElement();
  if (searchResults) {
    searchResults.innerHTML = "";
    searchResults.hidden = true;
    searchResults.classList.remove("is-visible", "is-open");
    searchResults.style.display = "none";
  }
}

function cerrarResultadosToSearch() {
  ocultarResultadosBusqueda();
}

function zoomToPRCFeature(feature, options = {}) {
  if (!map || !feature) return;

  const bounds = options.bounds?.isValid?.() ? options.bounds : getFeatureBounds(feature);

  if (!bounds || !bounds.isValid || !bounds.isValid()) {
    console.warn("No se pudo obtener bounds para el PRC seleccionado", feature);
    return;
  }

  const layerConfig = options.layerConfig || {};
  const padding = Array.isArray(layerConfig.padding) ? layerConfig.padding : [36, 36];
  const maxZoom = Number.isFinite(Number(layerConfig.max_zoom)) ? Number(layerConfig.max_zoom) : 15;

  map.fitBounds(bounds, {
    padding,
    maxZoom
  });

  highlightSelectedPRC(feature);
  cerrarResultadosToSearch();
  showMapHint("PRC localizado. Haga click dentro del área para consultar.");
}

function seleccionarPrimerResultadoToSearch() {
  const searchBox = document.getElementById("search-box");
  if (!toSearchResultadosActuales.length && searchBox) {
    toSearchResultadosActuales = buscarResultadosToSearch(searchBox.value);
  }

  if (toSearchResultadosActuales.length) {
    seleccionarResultadoToSearch(toSearchResultadosActuales[0]);
  }
}

// ZOOM TO FEATURE
async function seleccionarResultadoBusqueda(item, options = {}) {
  if (!item) return;

  const searchInput = getSearchInputElement();
  if (searchInput) {
    searchInput.value = item.nombre || item.texto_localidad || item.texto_resultado || "";
  }

  console.log(`[GeoIPT Search] zoom extent a: ${[item.texto_nombre_prc, item.texto_comuna, item.texto_region].filter(Boolean).join(" / ")}`);

  ocultarResultadosBusqueda();

  let hizoFit = false;
  if (item.bbox) hizoFit = fitBoundsDesdeBbox(item.bbox);
  if (!hizoFit && item.bounds?.isValid?.()) {
    map.fitBounds(item.bounds, { padding: [40, 40], maxZoom: 15 });
    hizoFit = true;
  }
  if (!hizoFit && item.feature) hizoFit = zoomToGeoJsonFeature(item.feature);

  if (item.feature) resaltarTemporalmenteFeatureToSearch(item.feature);

  if (hizoFit && typeof setMapMarkerAtCenter === "function") {
    setMapMarkerAtCenter();
  }

  showMapHint("PRC localizado. Haga click dentro del área para consultar.");
}

function seleccionarResultadoToSearch(item, options = {}) {
  return seleccionarResultadoBusqueda(item, options);
}

// HIGHLIGHT TEMPORAL
function resaltarTemporalmenteFeatureToSearch(feature) {
  if (!map || !feature) return;

  if (toSearchHighlightLayer && map.hasLayer(toSearchHighlightLayer)) {
    map.removeLayer(toSearchHighlightLayer);
  }

  toSearchHighlightLayer = L.geoJSON(feature, {
    interactive: false,
    style: {
      color: "#f97316",
      weight: 3,
      opacity: 1,
      fillColor: "#f97316",
      fillOpacity: 0.18
    }
  }).addTo(map);

  window.setTimeout(() => {
    if (toSearchHighlightLayer && map && map.hasLayer(toSearchHighlightLayer)) {
      map.removeLayer(toSearchHighlightLayer);
    }
    toSearchHighlightLayer = null;
  }, 2000);
}

function highlightSelectedPRC(feature) {
  if (!map || !feature) return;

  if (selectedPRCHighlightLayer && map.hasLayer(selectedPRCHighlightLayer)) {
    map.removeLayer(selectedPRCHighlightLayer);
  }

  selectedPRCHighlightLayer = L.geoJSON(feature, {
    interactive: false,
    style: {
      color: "#00aeef",
      weight: 4,
      opacity: 1,
      fillColor: "#00aeef",
      fillOpacity: 0.08
    }
  }).addTo(map);

  window.setTimeout(() => {
    if (selectedPRCHighlightLayer && map && map.hasLayer(selectedPRCHighlightLayer)) {
      map.removeLayer(selectedPRCHighlightLayer);
    }
    selectedPRCHighlightLayer = null;
  }, 3500);
}

function showMapHint(message) {
  const mapElement = document.getElementById("map");
  if (!mapElement) {
    console.info(message);
    return;
  }

  let hint = document.getElementById("map-hint");
  if (!hint) {
    hint = document.createElement("div");
    hint.id = "map-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    mapElement.appendChild(hint);
  }

  hint.textContent = message;
  hint.classList.add("is-visible");

  if (mapHintTimeoutId) window.clearTimeout(mapHintTimeoutId);
  mapHintTimeoutId = window.setTimeout(() => {
    hint.classList.remove("is-visible");
  }, 3500);
}

// --- Summary: carga y cálculo de indicadores ---
let summaryConfig = null;
let summaryFeatures = {}; // { layerId: [feature, ...] }

async function cargarSummaryConfigYCapas() {
  const PATH = "capas_summary/summary_config.json";
  try {
    const resp = await fetch(PATH);
    if (!resp.ok) throw new Error("no existe summary_config.json");
    summaryConfig = await resp.json();

    if (!summaryConfig.activo || !Array.isArray(summaryConfig.capas)) return;

    // Cargar cada archivo GeoJSON definido
    const promises = summaryConfig.capas.map(async (capa) => {
      try {
        const r = await fetch(capa.archivo);
        if (!r.ok) throw new Error(`No se pudo cargar ${capa.archivo}`);
        const gj = await r.json();
        summaryFeatures[capa.id] = Array.isArray(gj.features) ? gj.features : [];
      } catch (e) {
        console.warn("Error cargando capa summary:", capa.archivo, e);
        summaryFeatures[capa.id] = [];
      }
    });

    await Promise.all(promises);
  } catch (e) {
    summaryConfig = null;
    summaryFeatures = {};
    // no propagar el error: mantenemos el sitio funcional sin summary
    console.info("Summary no disponible:", e.message);
  }
}

function calcularYActualizarIndicadores() {
  if (!summaryConfig || !Array.isArray(summaryConfig.indicadores)) return;
  if (!map) return;

  const bounds = map.getBounds();
  const indicadores = summaryConfig.indicadores;

  const resultados = indicadores.map((ind) => {
    let value = 0;
    const capas = Array.isArray(ind.capas) ? ind.capas : [];

    if (ind.operacion === "count") {
      let contador = 0;
      capas.forEach((layerId) => {
        const feats = summaryFeatures[layerId] || [];
        feats.forEach((f) => {
          if (f && f.geometry && f.geometry.type === "Point") {
            const [lng, lat] = f.geometry.coordinates;
            if (bounds.contains(L.latLng(lat, lng))) contador++;
          }
        });
      });
      value = contador;
    } else if (ind.operacion === "sum") {
      let suma = 0;
      const campo = ind.campo;
      capas.forEach((layerId) => {
        const feats = summaryFeatures[layerId] || [];
        feats.forEach((f) => {
          if (f && f.geometry && f.geometry.type === "Point") {
            const [lng, lat] = f.geometry.coordinates;
            if (bounds.contains(L.latLng(lat, lng))) {
              const raw = f.properties ? f.properties[campo] : undefined;
              const num = Number(raw);
              if (!isNaN(num)) suma += num;
            }
          }
        });
      });
      value = suma;
    } else if (ind.operacion === "unique_count") {
      const campo = ind.campo;
      const set = new Set();
      capas.forEach((layerId) => {
        const feats = summaryFeatures[layerId] || [];
        feats.forEach((f) => {
          if (f && f.geometry && f.geometry.type === "Point") {
            const [lng, lat] = f.geometry.coordinates;
            if (bounds.contains(L.latLng(lat, lng))) {
              const raw = f.properties ? f.properties[campo] : undefined;
              if (raw !== null && raw !== undefined && String(raw).trim() !== "") set.add(String(raw));
            }
          }
        });
      });
      value = set.size;
    }

    // formateo
    let mostrar = 0;
    if (ind.operacion === "sum" && typeof value === "number") {
      if (typeof ind.decimales === "number") {
        mostrar = value.toLocaleString(undefined, { minimumFractionDigits: ind.decimales, maximumFractionDigits: ind.decimales });
      } else {
        mostrar = Number(value).toLocaleString();
      }
    } else {
      mostrar = value;
    }

    if (ind.sufijo) mostrar = `${mostrar} ${ind.sufijo}`;

    return { id: ind.id, label: ind.label, value: mostrar };
  });

  // Actualizar #summary-bar y el drawer mobile desde la misma fuente de datos.
  actualizarSummaryEnDom(resultados);
}
// GEOFACTORY PANEL TERRITORIAL
const PANEL_CAPAS_PATH = "capas_panel/listado_capas.json";
let panelCapasListado = [];
let panelPerimetrosActivo = false;
const panelCapasCargadas = new Map();
// ETIQUETAS DINÁMICAS PANEL TERRITORIAL
const panelGeojsonCargados = new Map();
let territorialLabelsLayer = null;
let territorialLabelsUpdateTimer = null;
const DEFAULT_LABEL_DENSITY_CONFIG = {
  maxLabels: Number.POSITIVE_INFINITY,
  minZoom: 0,
  debounceMs: 200
};
const TERRITORIAL_LABELS_PANE = "territorial-labels-pane";
const TERRITORIAL_LABEL_FIELDS = ["LOC", "LOCALIDAD", "SECTOR", "COMUNA"];
const panelCapasEnCarga = new Set();

// ESTILO DINÁMICO SEGÚN BASEMAP
function obtenerEstiloPerimetrosSegunBase(itemStyle = {}) {
  const estiloBase = { ...itemStyle };

  if (currentBaseLayer === satLayer) {
    return {
      ...estiloBase,
      color: "#ffe600",
      weight: 3,
      opacity: 1,
      fillColor: "#ffe600",
      fillOpacity: 0.08
    };
  }

  return {
    ...estiloBase,
    color: "#ff6600",
    fillColor: "#ff6600"
  };
}

function actualizarEstiloPerimetrosIptVisibles() {
  if (!map) return;

  panelCapasCargadas.forEach((layer, id) => {
    if (!map.hasLayer(layer) || typeof layer.setStyle !== "function") return;

    const item = panelCapasListado.find((capa) => capa.id === id);
    const itemStyle = item && item.style ? item.style : {};
    layer.setStyle(obtenerEstiloPerimetrosSegunBase(itemStyle));
  });
}

// CARGA listado_capas.json
async function cargarListadoPanelTerritorial() {
  try {
    const response = await fetch(PANEL_CAPAS_PATH);
    if (!response.ok) throw new Error(`No se pudo cargar ${PANEL_CAPAS_PATH}`);
    const data = await response.json();
    panelCapasListado = Array.isArray(data) ? data : [];
  } catch (error) {
    panelCapasListado = [];
    console.warn("GEOFACTORY PANEL TERRITORIAL: listado_capas.json no disponible.", error);
  }
}

function iniciarPanelTerritorial() {
  const toggle = document.getElementById("toggle-perimetros-ipt");
  const mobileToggle = document.getElementById("mobile-layer-toggle");
  if (!map) return;

  if (toggle) {
    toggle.addEventListener("change", () => {
      alternarPerimetrosIpt(toggle.checked);
    });
  }

  if (mobileToggle) {
    mobileToggle.addEventListener("click", () => {
      alternarPerimetrosIpt(!panelPerimetrosActivo);
    });
  }

  panelPerimetrosActivo = toggle ? Boolean(toggle.checked) : false;
  sincronizarControlesPerimetrosIpt();
  actualizarPerimetrosIptVisibles();

  map.on("moveend zoomend", () => {
    actualizarPerimetrosIptVisibles();
  });

  window.addEventListener("resize", scheduleTerritorialLabelUpdate);
}


function alternarPerimetrosIpt(activo) {
  panelPerimetrosActivo = Boolean(activo);
  sincronizarControlesPerimetrosIpt();

  // ON/OFF del panel territorial: solo etiquetas. La geometría IPT permanece visible.
  actualizarPerimetrosIptVisibles();
  scheduleTerritorialLabelUpdate();
}


function getMobileLabelEyeIcon(isVisible) {
  if (isVisible) {
    return `<svg class="mobile-layer-toggle-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>`;
  }
  return `<svg class="mobile-layer-toggle-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M2.5 12s3.5-6 9.5-6c2.1 0 3.9.72 5.36 1.7M21.5 12s-3.5 6-9.5 6c-2.1 0-3.9-.72-5.36-1.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.8 9.8A3 3 0 0 1 14.2 14.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
}

function sincronizarControlesPerimetrosIpt() {
  const toggle = document.getElementById("toggle-perimetros-ipt");
  const mobileToggle = document.getElementById("mobile-layer-toggle");

  if (toggle) {
    toggle.checked = panelPerimetrosActivo;
  }

  if (!mobileToggle) return;

  mobileToggle.classList.toggle("is-active", panelPerimetrosActivo);
  mobileToggle.classList.toggle("is-inactive", !panelPerimetrosActivo);
  mobileToggle.setAttribute("aria-pressed", String(panelPerimetrosActivo));

  const accion = panelPerimetrosActivo ? "Ocultar" : "Mostrar";
  const etiqueta = `${accion} etiquetas IPT`;
  mobileToggle.setAttribute("aria-label", etiqueta);
  mobileToggle.setAttribute("title", etiqueta);

  const icono = mobileToggle.querySelector(".mobile-layer-toggle-icon");
  if (icono) icono.innerHTML = getMobileLabelEyeIcon(panelPerimetrosActivo);
}

// FILTRO BBOX VIEWPORT
function bboxIntersectaViewport(bbox, bounds) {
  if (!Array.isArray(bbox) || bbox.length !== 4) return true;
  const [minLon, minLat, maxLon, maxLat] = bbox.map(Number);
  if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return true;

  return maxLon >= bounds.getWest()
    && minLon <= bounds.getEast()
    && maxLat >= bounds.getSouth()
    && minLat <= bounds.getNorth();
}

function obtenerCapasPanelCandidatas() {
  if (!map) return [];
  const bounds = map.getBounds();
  return panelCapasListado.filter((item) => bboxIntersectaViewport(item.bbox, bounds));
}

async function actualizarPerimetrosIptVisibles() {
  if (!map) {
    scheduleTerritorialLabelUpdate();
    return;
  }

  const candidatas = obtenerCapasPanelCandidatas();

  // Las geometrías IPT ya cargadas permanecen en el mapa; la interacción solo afecta etiquetas.

  await Promise.all(candidatas.map((item) => cargarCapaPanelSiCorresponde(item)));
  scheduleTerritorialLabelUpdate();
}

// CARGA DINÁMICA GEOJSON
async function cargarCapaPanelSiCorresponde(item) {
  if (!item || !item.id || !item.archivo || !map) return;

  const capaExistente = panelCapasCargadas.get(item.id);
  if (capaExistente) {
    capaExistente.setStyle(obtenerEstiloPerimetrosSegunBase(item.style || {}));
    if (!map.hasLayer(capaExistente)) capaExistente.addTo(map);
    return;
  }

  if (panelCapasEnCarga.has(item.id)) return;
  panelCapasEnCarga.add(item.id);

  try {
    const response = await fetch(item.archivo);
    if (!response.ok) throw new Error(`No se pudo cargar ${item.archivo}`);
    const geojson = await response.json();
    const layer = L.geoJSON(geojson, {
      style: obtenerEstiloPerimetrosSegunBase(item.style || {}),
      interactive: false
    });
    panelCapasCargadas.set(item.id, layer);
    panelGeojsonCargados.set(item.id, geojson);
    if (bboxIntersectaViewport(item.bbox, map.getBounds())) {
      layer.addTo(map);
    }
  } catch (error) {
    console.warn("GEOFACTORY PANEL TERRITORIAL: error cargando GeoJSON regional.", item.archivo, error);
  } finally {
    panelCapasEnCarga.delete(item.id);
  }
}

function removerTodosPerimetrosIpt() {
  // La geometría del panel territorial no se remueve desde los toggles.
  scheduleTerritorialLabelUpdate();
}



function normalizeTerritorialFieldName(fieldName) {
  return String(fieldName || "").trim().toUpperCase();
}

function ensureTerritorialLabelsLayer() {
  if (!map) return null;

  if (!map.getPane(TERRITORIAL_LABELS_PANE)) {
    const pane = map.createPane(TERRITORIAL_LABELS_PANE);
    pane.style.zIndex = 650;
    pane.style.pointerEvents = "none";
  }

  if (!territorialLabelsLayer) territorialLabelsLayer = L.layerGroup().addTo(map);
  return territorialLabelsLayer;
}

function getFeatureLabelText(feature) {
  const props = feature?.properties || {};
  const normalizedFields = new Map();

  Object.keys(props).forEach((field) => {
    normalizedFields.set(normalizeTerritorialFieldName(field), field);
  });

  for (const field of TERRITORIAL_LABEL_FIELDS) {
    const originalField = normalizedFields.get(normalizeTerritorialFieldName(field));
    if (!originalField) continue;

    const value = props[originalField];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return null;
}

function layerIntersectsViewport(layer, mapBounds) {
  if (!layer || !mapBounds) return false;

  if (typeof layer.getLatLng === "function") {
    const latlng = layer.getLatLng();
    return latlng ? mapBounds.contains(latlng) : false;
  }

  if (typeof layer.getBounds === "function") {
    const bounds = layer.getBounds();
    return bounds?.isValid?.() ? bounds.intersects(mapBounds) : false;
  }

  return false;
}

function getVisibleLabelLatLng(layer, leafletMap) {
  if (!layer || !leafletMap) return null;

  const mapBounds = leafletMap.getBounds();

  if (typeof layer.getLatLng === "function") {
    const latlng = layer.getLatLng();
    return latlng && mapBounds.contains(latlng) ? latlng : null;
  }

  if (typeof layer.getBounds !== "function") return null;

  const layerBounds = layer.getBounds();
  if (!layerBounds?.isValid?.() || !layerBounds.intersects(mapBounds)) return null;

  const center = layerBounds.getCenter();
  if (mapBounds.contains(center)) return center;

  const south = Math.max(layerBounds.getSouth(), mapBounds.getSouth());
  const north = Math.min(layerBounds.getNorth(), mapBounds.getNorth());
  const west = Math.max(layerBounds.getWest(), mapBounds.getWest());
  const east = Math.min(layerBounds.getEast(), mapBounds.getEast());

  if (south > north || west > east) return null;
  return L.latLng((south + north) / 2, (west + east) / 2);
}

function createTerritorialLabelMarker(labelText, latlng) {
  if (!labelText || !latlng) return null;

  return L.marker(latlng, {
    pane: TERRITORIAL_LABELS_PANE,
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: "territorial-label",
      html: escapeHtml(labelText),
      iconSize: null
    })
  });
}

async function cargarLabelDensityConfig() {
  if (window.GeoXLabelGrid && typeof GeoXLabelGrid.loadCapacityConfig === "function") {
    const labelConfig = await GeoXLabelGrid.loadCapacityConfig("capas_panel/label_capacity_config.json");
    console.log("[GeoIPT Labels] config", labelConfig);
  }
}

function getLabelDensityMaxLabels() {
  return DEFAULT_LABEL_DENSITY_CONFIG.maxLabels;
}

function buildGeoIptLabelBox(candidate) {
  const point = candidate?.point;
  if (!point) return null;
  const textLength = String(candidate.text || "").length;
  const width = Math.max(46, Math.min(280, textLength * 7.5 + 20));
  const height = 24;
  return {
    left: point.x - width / 2,
    right: point.x + width / 2,
    top: point.y - height / 2,
    bottom: point.y + height / 2
  };
}

function getLabelDensityMinZoom() {
  return DEFAULT_LABEL_DENSITY_CONFIG.minZoom;
}

function getLabelDensityDebounceMs() {
  return DEFAULT_LABEL_DENSITY_CONFIG.debounceMs;
}

function updateTerritorialLabels() {
  if (!map) return;

  ensureTerritorialLabelsLayer();
  territorialLabelsLayer.clearLayers();

  if (!panelPerimetrosActivo) return;
  if (map.getZoom() < getLabelDensityMinZoom()) return;

  const maxLabels = getLabelDensityMaxLabels();
  const mapBounds = map.getBounds();
  const labelCandidates = [];

  for (const item of panelCapasListado) {
    const panelLayer = panelCapasCargadas.get(item.id);
    if (!panelLayer || !map.hasLayer(panelLayer)) continue;

    panelLayer.eachLayer((featureLayer) => {
      if (!layerIntersectsViewport(featureLayer, mapBounds)) return;

      const labelText = getFeatureLabelText(featureLayer.feature);
      if (!labelText) return;

      const latlng = getVisibleLabelLatLng(featureLayer, map);
      if (!latlng || !mapBounds.contains(latlng)) return;

      const props = featureLayer.feature?.properties || {};
      labelCandidates.push({
        latlng,
        text: labelText,
        id: props.id ?? props.fid ?? props.fid_origen ?? `${item.id}-${labelCandidates.length}`,
        originalIndex: labelCandidates.length
      });
    });
  }

  const labelsToRender = window.GeoXLabelGrid && typeof GeoXLabelGrid.selectLabels === "function"
    ? GeoXLabelGrid.selectLabels(map, labelCandidates, { estimateLabelBox: buildGeoIptLabelBox })
    : labelCandidates.slice(0, maxLabels);

  labelsToRender.slice(0, maxLabels).forEach((label) => {
    const marker = createTerritorialLabelMarker(label.text, label.latlng);
    if (marker) marker.addTo(territorialLabelsLayer);
  });

  logGeoIptLabelCapacity(labelCandidates, labelsToRender);
}

function logGeoIptLabelCapacity(candidates, drawn) {
  if (!map || !(window.GeoXLabelGrid && typeof GeoXLabelGrid.pxAreaToCm2 === "function")) return;

  const size = map.getSize();
  const cellWidth = size.x / 3;
  const cellHeight = size.y / 3;
  const cells = Array.from({ length: 9 }, () => ({ candidates: 0, drawn: 0 }));

  const addToCell = (label, key) => {
    const point = map.latLngToContainerPoint(label.latlng);
    if (!point || point.x < 0 || point.y < 0 || point.x > size.x || point.y > size.y) return;
    const col = Math.min(2, Math.max(0, Math.floor(point.x / cellWidth)));
    const row = Math.min(2, Math.max(0, Math.floor(point.y / cellHeight)));
    cells[row * 3 + col][key] += 1;
  };

  candidates.forEach((label) => addToCell(label, "candidates"));
  drawn.forEach((label) => addToCell(label, "drawn"));

  const maxLabels = Math.floor(GeoXLabelGrid.pxAreaToCm2(cellWidth, cellHeight) * GeoXLabelGrid.getLabelsPerCm2());
  cells.forEach((cell, index) => {
    const effectiveMax = cell.candidates > 0 ? Math.max(1, maxLabels) : maxLabels;
    console.log(`[GeoIPT Labels] celda ${index + 1} | candidatos: ${cell.candidates} | maxLabels: ${effectiveMax} | dibujadas: ${cell.drawn}`);
  });
  console.log(`[GeoIPT Labels] total candidatas: ${candidates.length}`);
  console.log(`[GeoIPT Labels] total dibujadas: ${drawn.length}`);
}

function scheduleTerritorialLabelUpdate() {
  if (territorialLabelsUpdateTimer) window.clearTimeout(territorialLabelsUpdateTimer);

  territorialLabelsUpdateTimer = window.setTimeout(() => {
    territorialLabelsUpdateTimer = null;
    updateTerritorialLabels();
  }, getLabelDensityDebounceMs());
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
