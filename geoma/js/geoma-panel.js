(function (global) {
  "use strict";

  const CATALOG_PATH = "capas_panel/catalogo_geoma.json";
  const PANEL_PATH = "capas_panel/";
  const VIEWPORT_PADDING = 0.10;
  const MIN_DETAIL_ZOOM = 5;
  const PANEL_STYLE = {color: "#078ca0", weight: 1.4, opacity: 0.9, fillColor: "#55cbd5", fillOpacity: 0.38};

  function intersects(viewport, bbox) {
    if (!Array.isArray(bbox) || bbox.length !== 4) return false;
    const [west, south, east, north] = bbox.map(Number);
    return [west, south, east, north].every(Number.isFinite) &&
      viewport.west <= east && viewport.east >= west && viewport.south <= north && viewport.north >= south;
  }

  function validName(value) {
    if (value == null) return null;
    const name = String(value).trim();
    return name && name.toLowerCase() !== "null" && name.toLowerCase() !== "undefined" ? name : null;
  }

  function featureLabel(feature) {
    const properties = feature?.properties || {};
    const name = validName(properties.Nombre);
    if (name) return name;
    const type = validName(properties.Tipo);
    const commune = validName(properties.Comuna);
    if (type && commune) return `${type} - ${commune}`;
    return type;
  }

  function createLoader(map, options = {}) {
    const fetchJson = options.fetchJson || (async (path) => {
      const url = new URL(path, document.baseURI).href;
      const response = await fetch(path);
      console.info(`[GeoMA panel] fetch: ${url} HTTP ${response.status}`);
      if (!response.ok) throw new Error(`${url} respondió HTTP ${response.status}`);
      return response.json();
    });
    const createGeoJson = options.createGeoJson || ((data, settings) => L.geoJSON(data, settings));
    const renderer = options.renderer || (global.L?.canvas ? L.canvas({padding: 0.5}) : undefined);
    const loaded = new Map();
    const loading = new Map();
    let catalog = [];
    let catalogCrs = "EPSG:4326";
    let labelsVisible = false;

    function setFeatureLabel(layer, feature, enabled) {
      const label = featureLabel(feature);
      if (!label) return;
      if (enabled) layer.bindTooltip(label, {sticky: true, direction: "top", opacity: 0.92});
      else layer.unbindTooltip();
    }

    function setLabels(visible) {
      labelsVisible = Boolean(visible);
      loaded.forEach(({leafletLayer}) => leafletLayer.eachLayer((layer) => setFeatureLabel(layer, layer.feature, labelsVisible)));
    }

    async function loadLayer(entry) {
      if (loaded.has(entry.id)) return loaded.get(entry.id);
      if (loading.has(entry.id)) return loading.get(entry.id);
      console.info(`[GeoMA panel] cargando: ${entry.file}`);
      const request = fetchJson(PANEL_PATH + encodeURIComponent(entry.file))
        .then((geojson) => {
          const geometryTypes = [...new Set((geojson.features || []).map((feature) => feature.geometry?.type).filter(Boolean))];
          console.info(`[GeoMA panel] GeoJSON ${entry.id}: type=${geojson.type}; features=${geojson.features?.length || 0}; geometrías=${geometryTypes.join(" / ") || "ninguna"}`);
          const settings = {
            renderer,
            pane: "overlayPane",
            style: PANEL_STYLE,
            onEachFeature(feature, layer) { setFeatureLabel(layer, feature, labelsVisible); }
          };
          // The panel files are Web Mercator, while GeoJSON normally uses lon/lat.
          // Leaflet otherwise interprets metre coordinates as degrees and creates
          // paths far outside the visible world.
          if (catalogCrs === "EPSG:3857") {
            settings.coordsToLatLng = (coordinates) => global.L.CRS.EPSG3857.unproject(global.L.point(coordinates));
          }
          const leafletLayer = createGeoJson(geojson, settings);
          const layerCount = typeof leafletLayer.getLayers === "function" ? leafletLayer.getLayers().length : geojson.features?.length || 0;
          console.info(`[GeoMA panel] L.geoJSON ${entry.id}: ${layerCount} layers; pane=overlayPane`);
          leafletLayer.addTo(map);
          console.info(`[GeoMA panel] addTo(map): ${entry.id} confirmado`);
          const result = {entry, leafletLayer, featureCount: geojson.features?.length || 0};
          loaded.set(entry.id, result);
          console.info(`[GeoMA panel] cargada: ${entry.region} (${result.featureCount} features)`);
          return result;
        })
        .catch((error) => {
          console.warn(`[GeoMA panel] no se pudo cargar ${entry.file}; se reintentará cuando vuelva a ser requerida.`, error);
          return null;
        })
        .finally(() => loading.delete(entry.id));
      loading.set(entry.id, request);
      return request;
    }

    function requiredForViewport() {
      // A nationwide viewport intersects every regional bbox. Deferring until a
      // useful detail zoom avoids downloading all sixteen merely on application load.
      if (map.getZoom() < MIN_DETAIL_ZOOM) return [];
      const bounds = map.getBounds().pad(VIEWPORT_PADDING);
      const viewport = {west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth()};
      console.info(`[GeoMA panel] viewport: west=${viewport.west}; south=${viewport.south}; east=${viewport.east}; north=${viewport.north}`);
      return catalog.filter((entry) => intersects(viewport, entry.bbox));
    }

    function evaluate() {
      const required = requiredForViewport();
      console.info(`[GeoMA panel] required: ${required.map((entry) => entry.id).join(", ") || "ninguna (vista nacional)"}`);
      required.forEach(loadLayer);
      return required;
    }

    async function init() {
      const data = await fetchJson(CATALOG_PATH);
      catalogCrs = data.geojson_crs || data.crs || "EPSG:4326";
      catalog = Array.isArray(data.layers) ? data.layers.filter((entry) => entry.enabled === true) : [];
      console.info(`[GeoMA panel] catálogo cargado: ${catalog.length} capas`);
      map.on("moveend", evaluate);
      evaluate();
      return catalog;
    }

    return {init, evaluate, setLabels, loadLayer, requiredForViewport, loaded, loading};
  }

  function init(map) {
    const checkbox = document.getElementById("panel-labels-toggle");
    const mobileButton = document.getElementById("mobile-layer-toggle");
    const loader = createLoader(map);
    checkbox.addEventListener("change", () => {
      loader.setLabels(checkbox.checked);
      mobileButton.classList.toggle("active", checkbox.checked);
      mobileButton.setAttribute("aria-pressed", String(checkbox.checked));
    });
    mobileButton.addEventListener("click", () => {
      checkbox.checked = !checkbox.checked;
      checkbox.dispatchEvent(new Event("change"));
    });
    loader.init().then(() => {
      checkbox.disabled = false;
      checkbox.closest("label").classList.remove("is-disabled");
      mobileButton.disabled = false;
    }).catch((error) => console.warn("[GeoMA panel] catálogo no disponible; los polígonos no se cargarán.", error));
    return loader;
  }

  global.GeoMAPanel = {createLoader, init, intersects, validName, featureLabel, PANEL_STYLE, MIN_DETAIL_ZOOM};
})(window);
