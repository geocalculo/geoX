let map;
let osmLayer;
let satLayer;
let currentBaseLayer;
let currentBasemap = "osm";
let initialCrossAccessState = null;
const CROSS_ACCESS_PARAM_NAME = "from";
const CROSS_ACCESS_PARAM_VALUE = "crossaccess";
let summaryConfig = null;
let summaryFeaturesByLayer = {};
const REGIONES_PATH = "capas_selector/regiones.json";
let regionesSelector = [];

let noxaPanelUpdateTimer = null;
const LABEL_DENSITY_CONFIG_PATH = "./capas_panel/label_density_config.json";
const DEFAULT_LABEL_DENSITY_CONFIG = { maxLabels: Number.POSITIVE_INFINITY, minZoom: 0 };
let labelDensityConfig = { ...DEFAULT_LABEL_DENSITY_CONFIG };

async function loadLabelDensityConfig() {
  try {
    const response = await fetch(LABEL_DENSITY_CONFIG_PATH, { cache: "no-store" });
    if (!response.ok) throw new Error(`No se pudo cargar ${LABEL_DENSITY_CONFIG_PATH}`);
    const data = await response.json();
    labelDensityConfig = { ...DEFAULT_LABEL_DENSITY_CONFIG, ...(data && typeof data === "object" ? data : {}) };
  } catch (error) {
    labelDensityConfig = { ...DEFAULT_LABEL_DENSITY_CONFIG };
    console.info("Smart Labels: usando densidad interna por defecto.", error);
  }
}

function getLabelDensitySource(layerId) {
  const layerConfig = layerId && labelDensityConfig.layers && labelDensityConfig.layers[layerId];
  return layerConfig && typeof layerConfig === "object" ? layerConfig : labelDensityConfig;
}

function getLabelDensityMaxLabels(layerId = null) {
  const source = getLabelDensitySource(layerId);
  const value = Number(source.maxLabels ?? source.max_labels);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_LABEL_DENSITY_CONFIG.maxLabels;
}

function getLabelDensityMinZoom(layerId = null) {
  const source = getLabelDensitySource(layerId);
  const value = Number(source.minZoom ?? source.min_zoom);
  return Number.isFinite(value) ? value : DEFAULT_LABEL_DENSITY_CONFIG.minZoom;
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

  userLocationMarker.bindPopup("Mi ubicación aproximada").openPopup();
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
  iniciarMapa();
  await cargarRegionesSelector();
  conectarRegionSelector();
  conectarBaseMapToggle();
  initGeoXMyLocationButton(map);
  initGeoXCrossPortalNavigation();
  await loadLabelDensityConfig();
  initGeoNoxaPanelLayers();
});

function iniciarMapa() {
  map = L.map("map").setView([-30.0, -71.0], 5);
  window.geoxMap = map;

  const initialLocationPromise = initGeoXInitialLocation(map);
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

  switchBaseMap(getInitialBasemapFromUrl());

  L.control.scale({
    imperial: false
  }).addTo(map);

  map.on("moveend zoomend", scheduleGeoNoxaPanelViewportUpdate);
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
  const showLabels = cfg.labelsVisible && map.getZoom() >= getLabelDensityMinZoom(layerKey);
  const maxLabels = getLabelDensityMaxLabels(layerKey);
  let labelCount = 0;

  visibleFeatures.forEach((feature) => {
    if (!hasValidGeoNoxaGeometry(feature)) return;

    const geoLayer = L.geoJSON(feature, {
      style: getGeoNoxaPanelPolygonStyle,
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
    if (layerKey === "relaves") labelText = String(feature.properties?.recurso || "").trim();
    if (layerKey === "zonas") labelText = getGeoNoxaZonaLabel(feature.properties || {});
    if (!labelText) return;

    geoLayer.eachLayer((layer) => {
      const latlng = typeof layer.getLatLng === "function"
        ? layer.getLatLng()
        : (typeof layer.getBounds === "function" && layer.getBounds()?.isValid?.() ? layer.getBounds().getCenter() : null);
      if (!latlng || labelCount >= maxLabels) return;

      L.marker(latlng, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: "noxa-panel-label",
          html: escapeHtml(labelText),
          iconSize: null
        })
      }).addTo(cfg.labelsLayerGroup);
      labelCount += 1;
    });
  });

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
