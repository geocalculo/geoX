let map;
let osmLayer;
let satLayer;
let currentBaseLayer;
// GEOFACTORY MI UBICACIÓN
let myLocationLayer = null;

const PARAMS_PATH = "parametros/parametros_index.json";
const REGIONES_PATH = "capas_selector/regiones.json";
let regionesSelector = [];

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
    await cargarRegionesSelector();
    conectarEventos();
    cargarListadoToSearch();
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
  panelTitle.textContent = params.panel_titulo || "Panel Territorial";
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

  if (params.mapa_base === "sat") {
    satLayer.addTo(map);
    currentBaseLayer = satLayer;
    setMapToggleActive("sat");
  } else {
    osmLayer.addTo(map);
    currentBaseLayer = osmLayer;
    setMapToggleActive("osm");
  }

  // GEOFACTORY ESCALA GRÁFICA
  L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false,
    maxWidth: 120
  }).addTo(map);

  map.invalidateSize();
  map.on("click", manejarClickConsultaPrc);
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

  const btnMyLocation = document.getElementById("btn-my-location");
  if (btnMyLocation) {
    btnMyLocation.addEventListener("click", centrarEnMiUbicacion);
  }

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

// CENTRAR EN MI UBICACIÓN
function centrarEnMiUbicacion() {
  if (!navigator.geolocation) {
    alert("Tu navegador no permite obtener ubicación.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      map.flyTo([lat, lon], 14, {
        animate: true,
        duration: 0.8
      });

      mostrarMarcadorMiUbicacion(lat, lon, accuracy);
    },
    (error) => {
      console.warn("No se pudo obtener ubicación:", error);
      alert("No se pudo obtener tu ubicación. Revisa permisos del navegador.");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    }
  );
}

// MARCADOR MI UBICACIÓN
function mostrarMarcadorMiUbicacion(lat, lon, accuracy) {
  if (myLocationLayer && map.hasLayer(myLocationLayer)) {
    map.removeLayer(myLocationLayer);
  }

  const marker = L.marker([lat, lon]).bindPopup("Mi ubicación aproximada");

  const circle = L.circle([lat, lon], {
    radius: accuracy || 50,
    color: "#0ea5e9",
    weight: 2,
    opacity: 0.8,
    fillColor: "#0ea5e9",
    fillOpacity: 0.12
  });

  myLocationLayer = L.layerGroup([circle, marker]).addTo(map);
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
  }

  if (type === "sat") {
    if (osmLayer && map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
    if (satLayer && !map.hasLayer(satLayer)) satLayer.addTo(map);
    currentBaseLayer = satLayer;
  }

  setMapToggleActive(type);
  actualizarEstiloPerimetrosIptVisibles();
}

// GEOFACTORY TOSEARCH
const TOSEARCH_LISTADO_PATH = "capas_tosearch/listado_tosearch.json";
const toSearchIndice = [];
let toSearchResultadosActuales = [];
let toSearchHighlightLayer = null;
let nearestPrcResultadosActuales = [];
let lastConsultedLatLng = null;

function normalizarTextoToSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// CARGA listado_tosearch.json
async function cargarListadoToSearch() {
  try {
    const response = await fetch(TOSEARCH_LISTADO_PATH);
    if (!response.ok) throw new Error(`No se pudo cargar ${TOSEARCH_LISTADO_PATH}`);

    const listado = await response.json();
    const capasActivas = Array.isArray(listado)
      ? listado.filter((item) => item && item.activo === true && item.archivo)
      : [];

    await Promise.all(capasActivas.map((item) => cargarCapaToSearch(item)));
  } catch (error) {
    console.warn("GEOFACTORY TOSEARCH: listado_tosearch.json no disponible. El sitio continúa sin búsqueda por localidad.", error);
  }
}

async function cargarCapaToSearch(layerConfig) {
  try {
    const response = await fetch(layerConfig.archivo);
    if (!response.ok) throw new Error(`No se pudo cargar ${layerConfig.archivo}`);

    const geojson = await response.json();
    const features = Array.isArray(geojson.features) ? geojson.features : [];

    features.forEach((feature) => agregarFeatureAlIndiceToSearch(feature, layerConfig));
  } catch (error) {
    console.warn("GEOFACTORY TOSEARCH: no se pudo cargar GeoJSON de búsqueda.", layerConfig.archivo, error);
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
  const nombrePrc = obtenerNombrePrc(feature);
  const source = options.source || "direct";
  const coords = punto
    ? `${punto.lat.toFixed(6)}, ${punto.lng.toFixed(6)}`
    : "Sin coordenadas disponibles";

  const detalle = [
    "Consulta PRC",
    `Coordenadas consultadas: ${coords}`,
    `PRC seleccionado: ${nombrePrc}`,
    `Modo de selección: ${source}`
  ];

  if (Number.isFinite(options.rank)) detalle.push(`Ranking cercano: ${options.rank}`);
  if (Number.isFinite(options.distanceMeters)) detalle.push(`Distancia: ${Math.round(options.distanceMeters).toLocaleString("es-CL")} m`);

  alert(detalle.join("\n"));
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

function calcularDistanciaPrcMetros(latLng, item) {
  if (!latLng || !item?.bounds?.isValid?.()) return Infinity;
  if (puntoEnFeature(latLng, item.feature)) return 0;
  const center = item.bounds.getCenter();
  return map.distance(latLng, center);
}

function buscarItemPrcContenedor(latLng) {
  return toSearchIndice.find((item) => item?.bounds?.contains?.(latLng) && puntoEnFeature(latLng, item.feature)) || null;
}

function buscarPrcMasCercanos(latLng, cantidad = 3) {
  return toSearchIndice
    .map((item) => ({ ...item, distanceMeters: calcularDistanciaPrcMetros(latLng, item) }))
    .filter((item) => Number.isFinite(item.distanceMeters))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, cantidad);
}

function mostrarPrcCercanosEnSearchBox(items, clickedLatLng) {
  const contenedor = document.getElementById("search-results");
  const searchBox = document.getElementById("search-box");
  if (!contenedor) return;

  nearestPrcResultadosActuales = items;
  toSearchResultadosActuales = [];
  lastConsultedLatLng = clickedLatLng;
  if (searchBox) searchBox.value = "PRC más cercanos";
  contenedor.innerHTML = "";

  if (!items.length) {
    contenedor.classList.remove("is-visible");
    return;
  }

  items.forEach((item, index) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "search-result-item";
    const distancia = Math.round(item.distanceMeters).toLocaleString("es-CL");
    boton.textContent = `${index + 1}. ${item.texto_resultado} · ${distancia} m`;
    boton.addEventListener("click", () => seleccionarPrcCercano(item, clickedLatLng, index + 1));
    contenedor.appendChild(boton);
  });

  contenedor.classList.add("is-visible");
}

function seleccionarPrcCercano(item, clickedLatLng, rank) {
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.value = item.texto_localidad;
  cerrarResultadosToSearch();
  handlePRCSelection(item.feature, clickedLatLng, {
    source: "nearest",
    rank,
    distanceMeters: item.distanceMeters
  });
}

function manejarClickConsultaPrc(event) {
  if (!event?.latlng) return;
  const clickedLatLng = event.latlng;
  const itemDirecto = buscarItemPrcContenedor(clickedLatLng);

  if (itemDirecto) {
    handlePRCSelection(itemDirecto.feature, clickedLatLng, { source: "direct" });
    return;
  }

  mostrarPrcCercanosEnSearchBox(buscarPrcMasCercanos(clickedLatLng, 3), clickedLatLng);
}

// RESULTADO LOCALIDAD COMUNA REGION
function construirTextoResultadoToSearch(props) {
  const localidad = obtenerPropTexto(props, ["localidad", "LOC", "LOCALIDAD"]);
  const comuna = obtenerPropTexto(props, ["comuna", "COM", "COMUNA"]);
  const region = obtenerPropTexto(props, ["region", "REG", "REGION", "region_nombre"]);

  const partes = [];
  for (const valor of [localidad, comuna, region]) {
    if (!valor) continue;
    const anterior = partes[partes.length - 1];
    if (anterior && anterior.toLowerCase() === valor.toLowerCase()) continue;
    partes.push(valor);
  }

  return {
    texto_localidad: localidad,
    texto_comuna: comuna,
    texto_region: region,
    texto_resultado: partes.join(" - "),
    texto_busqueda: normalizarTextoToSearch([localidad, comuna, region].join(" "))
  };
}

function agregarFeatureAlIndiceToSearch(feature, layerConfig) {
  if (!feature || !feature.geometry) return;

  const props = feature.properties || {};
  const textosTerritoriales = construirTextoResultadoToSearch(props);

  if (!textosTerritoriales.texto_localidad || !textosTerritoriales.texto_resultado) return;

  const bounds = obtenerBoundsFeatureToSearch(feature);
  if (!bounds || !bounds.isValid()) return;

  toSearchIndice.push({
    ...textosTerritoriales,
    texto_display: textosTerritoriales.texto_resultado,
    feature,
    layer_config: layerConfig,
    bounds
  });
}

function obtenerBoundsFeatureToSearch(feature) {
  try {
    return L.geoJSON(feature).getBounds();
  } catch (error) {
    console.warn("GEOFACTORY TOSEARCH: no se pudieron calcular bounds de feature.", error);
    return null;
  }
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
    const wrapper = document.getElementById("search-box-wrapper");
    if (wrapper && !wrapper.contains(event.target)) cerrarResultadosToSearch();
  });
}

// RESULTADOS SEARCH BOX
function buscarResultadosToSearch(texto) {
  const query = normalizarTextoToSearch(texto);
  if (!query) return [];

  return toSearchIndice
    .filter((item) => item.texto_busqueda.includes(query))
    .sort((a, b) => a.texto_resultado.localeCompare(b.texto_resultado, "es"))
    .slice(0, 20);
}

function mostrarResultadosToSearch(texto) {
  const contenedor = document.getElementById("search-results");
  if (!contenedor) return;

  toSearchResultadosActuales = buscarResultadosToSearch(texto);
  contenedor.innerHTML = "";

  if (!toSearchResultadosActuales.length) {
    contenedor.classList.remove("is-visible");
    return;
  }

  toSearchResultadosActuales.forEach((item) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "search-result-item";
    boton.textContent = item.texto_resultado;
    boton.addEventListener("click", () => seleccionarResultadoToSearch(item));
    contenedor.appendChild(boton);
  });

  contenedor.classList.add("is-visible");
}

function cerrarResultadosToSearch() {
  const contenedor = document.getElementById("search-results");
  toSearchResultadosActuales = [];
  nearestPrcResultadosActuales = [];
  if (contenedor) {
    contenedor.innerHTML = "";
    contenedor.classList.remove("is-visible");
  }
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
function seleccionarResultadoToSearch(item, options = {}) {
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.value = item.texto_localidad;
  cerrarResultadosToSearch();

  const clickedLatLng = options.clickedLatLng || obtenerLatLngRepresentativoFeature(item.feature, item.bounds);
  handlePRCSelection(item.feature, clickedLatLng, { source: options.source || "search" });

  if (!map || !item.bounds || !item.bounds.isValid()) return;

  const layerConfig = item.layer_config || {};
  const padding = Array.isArray(layerConfig.padding) ? layerConfig.padding : [40, 40];
  const maxZoom = Number.isFinite(Number(layerConfig.max_zoom)) ? Number(layerConfig.max_zoom) : 15;

  map.fitBounds(item.bounds, {
    padding,
    maxZoom
  });

  resaltarTemporalmenteFeatureToSearch(item.feature);
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
// ETIQUETAS LOCALIDAD PANEL
const panelGeojsonCargados = new Map();
let panelLabelsSmartLayer = null;
const panelCapasEnCarga = new Set();

const LABEL_RULES = {
  desktop: { lowZoomMax: 12, midZoomMax: 25, highZoomMax: 45 },
  mobile: { lowZoomMax: 6, midZoomMax: 12, highZoomMax: 20 }
};

const LABEL_ZOOM_BREAKPOINTS = { low: 10, high: 13 };

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

  sincronizarControlesPerimetrosIpt();

  map.on("moveend zoomend", () => {
    if (panelPerimetrosActivo) actualizarPerimetrosIptVisibles();
  });
}

function alternarPerimetrosIpt(activo) {
  panelPerimetrosActivo = Boolean(activo);
  sincronizarControlesPerimetrosIpt();

  // ON/OFF PERÍMETROS IPT
  if (panelPerimetrosActivo) {
    actualizarPerimetrosIptVisibles();
  } else {
    removerTodosPerimetrosIpt();
  }
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
  const etiqueta = `${accion} Perímetros IPT`;
  mobileToggle.setAttribute("aria-label", etiqueta);
  mobileToggle.setAttribute("title", etiqueta);

  const icono = mobileToggle.querySelector(".mobile-layer-toggle-icon");
  if (icono) icono.textContent = panelPerimetrosActivo ? "👁️" : "🙈";
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
  if (!panelPerimetrosActivo || !map) return;

  const candidatas = obtenerCapasPanelCandidatas();
  const idsCandidatas = new Set(candidatas.map((item) => item.id));

  panelCapasCargadas.forEach((layer, id) => {
    if (!idsCandidatas.has(id) && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });


  await Promise.all(candidatas.map((item) => cargarCapaPanelSiCorresponde(item)));
  renderizarLabelsInteligentesPerimetrosIpt(candidatas);
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
      onEachFeature: (feature, featureLayer) => vincularPopupPanel(feature, featureLayer, item)
    });
    panelCapasCargadas.set(item.id, layer);
    panelGeojsonCargados.set(item.id, geojson);
    if (panelPerimetrosActivo && bboxIntersectaViewport(item.bbox, map.getBounds())) {
      layer.addTo(map);
    }
  } catch (error) {
    console.warn("GEOFACTORY PANEL TERRITORIAL: error cargando GeoJSON regional.", item.archivo, error);
  } finally {
    panelCapasEnCarga.delete(item.id);
  }
}

function vincularPopupPanel(feature, layer, item) {
  const props = feature && feature.properties ? feature.properties : {};
  const popup = item.popup || {};
  const partes = [];
  const titulo = popup.titulo && props[popup.titulo] ? props[popup.titulo] : "";
  const subtitulo = popup.subtitulo && props[popup.subtitulo] ? props[popup.subtitulo] : "";

  if (titulo) partes.push(`<strong>${escapeHtml(titulo)}</strong>`);
  if (subtitulo && subtitulo !== titulo) partes.push(`<span>${escapeHtml(subtitulo)}</span>`);
  if (partes.length) layer.bindPopup(`<div class="panel-popup">${partes.join("<br>")}</div>`);
}

function removerTodosPerimetrosIpt() {
  panelCapasCargadas.forEach((layer) => {
    if (map && map.hasLayer(layer)) map.removeLayer(layer);
  });
  removerTodosLabelsLocalidad();
}


function obtenerCentroFeatureParaLabel(feature) {
  if (!feature) return null;

  const bounds = L.geoJSON(feature).getBounds();
  if (!bounds.isValid()) return null;

  return bounds.getCenter();
}

function crearMarkerLabelLocalidad(feature, center) {
  // CREAR LABEL LOCALIDAD
  const localidad = feature?.properties?.localidad;
  if (!localidad || !center) return null;

  return L.marker(center, {
    interactive: false,
    icon: L.divIcon({
      className: "geofactory-localidad-label",
      html: escapeHtml(localidad),
      iconSize: null
    })
  });
}

function renderizarLabelsInteligentesPerimetrosIpt(candidatas) {
  if (!map || !panelPerimetrosActivo) return;

  if (!panelLabelsSmartLayer) panelLabelsSmartLayer = L.layerGroup();
  panelLabelsSmartLayer.clearLayers();

  const zoom = map.getZoom();
  const esMobile = window.matchMedia("(max-width: 768px)").matches;
  const maxLabels = obtenerMaximoLabelsPorZoom(zoom, esMobile);
  const minArea = obtenerAreaMinimaLabelsPorZoom(zoom, esMobile);
  const bounds = map.getBounds();
  const candidatasIds = new Set(candidatas.map((item) => item.id));

  const featuresVisibles = [];
  panelGeojsonCargados.forEach((geojson, id) => {
    if (!candidatasIds.has(id)) return;
    const features = Array.isArray(geojson?.features) ? geojson.features : [];

    features.forEach((feature) => {
      const area = obtenerAreaFeature(feature);
      if (area < minArea || !featureIntersectaViewport(feature, bounds)) return;
      featuresVisibles.push({ feature, area });
    });
  });

  featuresVisibles.sort((a, b) => b.area - a.area);

  const labelsAceptados = [];
  let labelsCreados = 0;

  for (const item of featuresVisibles) {
    if (labelsCreados >= maxLabels) break;

    const labelText = obtenerTextoLabelFeature(item.feature);
    const center = obtenerCentroFeatureParaLabel(item.feature);
    if (!labelText || !center || !bounds.contains(center)) continue;

    const labelBox = estimarCajaLabel(center, labelText);
    if (!labelBox || colisionaConLabelsAceptados(labelBox, labelsAceptados)) continue;

    const marker = crearMarkerLabelLocalidad(item.feature, center);
    if (!marker) continue;

    panelLabelsSmartLayer.addLayer(marker);
    labelsAceptados.push(labelBox);
    labelsCreados += 1;
  }

  if (!map.hasLayer(panelLabelsSmartLayer)) panelLabelsSmartLayer.addTo(map);
}

function obtenerMaximoLabelsPorZoom(zoom, esMobile) {
  const reglas = esMobile ? LABEL_RULES.mobile : LABEL_RULES.desktop;
  if (zoom < LABEL_ZOOM_BREAKPOINTS.low) return reglas.lowZoomMax;
  if (zoom < LABEL_ZOOM_BREAKPOINTS.high) return reglas.midZoomMax;
  return reglas.highZoomMax;
}

function obtenerAreaMinimaLabelsPorZoom(zoom, esMobile) {
  const factorMobile = esMobile ? 1.7 : 1;
  if (zoom < LABEL_ZOOM_BREAKPOINTS.low) return 0.01 * factorMobile;
  if (zoom < LABEL_ZOOM_BREAKPOINTS.high) return 0.0025 * factorMobile;
  return 0;
}

function featureIntersectaViewport(feature, bounds) {
  const featureBounds = L.geoJSON(feature).getBounds();
  return featureBounds.isValid() && featureBounds.intersects(bounds);
}

function obtenerTextoLabelFeature(feature) {
  return feature?.properties?.localidad || "";
}

function estimarCajaLabel(latlng, labelText) {
  if (!map || !latlng || !labelText) return null;

  const point = map.latLngToContainerPoint(latlng);
  const width = Math.max(44, String(labelText).length * 7 + 18);
  const height = 24;
  const padding = window.matchMedia("(max-width: 768px)").matches ? 10 : 6;

  return {
    minX: point.x - (width / 2) - padding,
    maxX: point.x + (width / 2) + padding,
    minY: point.y - (height / 2) - padding,
    maxY: point.y + (height / 2) + padding
  };
}

function colisionaConLabelsAceptados(labelBox, labelsAceptados) {
  return labelsAceptados.some((accepted) => cajasIntersectan(labelBox, accepted));
}

function cajasIntersectan(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function obtenerAreaFeature(feature) {
  const geometry = feature?.geometry;
  if (!geometry) return 0;
  return obtenerAreaGeometry(geometry);
}

function obtenerAreaGeometry(geometry) {
  if (geometry.type === "Polygon") {
    return Math.abs(obtenerAreaAnillos(geometry.coordinates));
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((total, polygon) => total + Math.abs(obtenerAreaAnillos(polygon)), 0);
  }

  return 0;
}

function obtenerAreaAnillos(rings) {
  if (!Array.isArray(rings) || !Array.isArray(rings[0])) return 0;

  const exterior = Math.abs(obtenerAreaAnillo(rings[0]));
  const interiores = rings.slice(1).reduce((total, ring) => total + Math.abs(obtenerAreaAnillo(ring)), 0);
  return Math.max(exterior - interiores, 0);
}

function obtenerAreaAnillo(ring) {
  if (!Array.isArray(ring) || ring.length < 3) return 0;

  let area = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i].map(Number);
    const [x2, y2] = ring[(i + 1) % ring.length].map(Number);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    area += (x1 * y2) - (x2 * y1);
  }

  return area / 2;
}

function removerTodosLabelsLocalidad() {
  // REMOVER LABELS LOCALIDAD
  if (map && panelLabelsSmartLayer && map.hasLayer(panelLabelsSmartLayer)) {
    map.removeLayer(panelLabelsSmartLayer);
  }
  if (panelLabelsSmartLayer) panelLabelsSmartLayer.clearLayers();
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
