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

  territorialLabelsLayer = L.layerGroup().addTo(map);

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

function mostrarMsgboxCoordenadas(clickedLatLng) {
  if (!clickedLatLng) return;

  alert(
    "Consulta territorial\n\n" +
    "Punto consultado:\n" +
    "Lat: " + clickedLatLng.lat.toFixed(6) + "\n" +
    "Lng: " + clickedLatLng.lng.toFixed(6)
  );
}

function buscarItemPrcContenedor(latLng) {
  return toSearchIndice.find((item) => item?.bounds?.contains?.(latLng) && puntoEnFeature(latLng, item.feature)) || null;
}

function handleMapClick(event) {
  if (!event?.latlng) return;

  const clickedLatLng = event.latlng;
  const lat = clickedLatLng.lat;
  const lon = clickedLatLng.lng;

  colocarMarcadorPunto(clickedLatLng);

  const containingPRC = findContainingPRCFromPerimetros(clickedLatLng);

  if (containingPRC) {
    ocultarResultadosBusqueda();
    mostrarMsgboxCoordenadas(clickedLatLng);
    return;
  }

  const cercanos = obtenerPrcCercanosDesdePerimetros(lat, lon, 3);
  bloquearCierreBusquedaPorClickMapa = true;
  renderFallbackResultadosCercanos(cercanos);
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
const TERRITORIAL_LABELS_MAX = 50;
const TERRITORIAL_LABELS_DEBOUNCE_MS = 200;
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
  if (!panelPerimetrosActivo || !map) {
    scheduleTerritorialLabelUpdate();
    return;
  }

  const candidatas = obtenerCapasPanelCandidatas();
  const idsCandidatas = new Set(candidatas.map((item) => item.id));

  panelCapasCargadas.forEach((layer, id) => {
    if (!idsCandidatas.has(id) && map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });


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
    if (panelPerimetrosActivo && bboxIntersectaViewport(item.bbox, map.getBounds())) {
      layer.addTo(map);
    }
  } catch (error) {
    console.warn("GEOFACTORY PANEL TERRITORIAL: error cargando GeoJSON regional.", item.archivo, error);
  } finally {
    panelCapasEnCarga.delete(item.id);
  }
}

function removerTodosPerimetrosIpt() {
  panelCapasCargadas.forEach((layer) => {
    if (map && map.hasLayer(layer)) map.removeLayer(layer);
  });
  scheduleTerritorialLabelUpdate();
}



function getFeatureLabelText(feature) {
  const props = feature?.properties || {};
  const fields = ["LOC", "LOCALIDAD", "SECTOR", "COMUNA"];

  for (const field of fields) {
    const value = props[field];
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
    interactive: false,
    keyboard: false,
    icon: L.divIcon({
      className: "territorial-label",
      html: escapeHtml(labelText),
      iconSize: null
    })
  });
}

function updateTerritorialLabels() {
  if (!map) return;

  if (!territorialLabelsLayer) territorialLabelsLayer = L.layerGroup().addTo(map);
  territorialLabelsLayer.clearLayers();

  if (!panelPerimetrosActivo) return;

  const mapBounds = map.getBounds();
  let labelCount = 0;

  for (const item of panelCapasListado) {
    if (labelCount >= TERRITORIAL_LABELS_MAX) break;

    const panelLayer = panelCapasCargadas.get(item.id);
    if (!panelLayer || !map.hasLayer(panelLayer)) continue;

    panelLayer.eachLayer((featureLayer) => {
      if (labelCount >= TERRITORIAL_LABELS_MAX) return;
      if (!layerIntersectsViewport(featureLayer, mapBounds)) return;

      const labelText = getFeatureLabelText(featureLayer.feature);
      if (!labelText) return;

      const latlng = getVisibleLabelLatLng(featureLayer, map);
      if (!latlng || !mapBounds.contains(latlng)) return;

      const marker = createTerritorialLabelMarker(labelText, latlng);
      if (!marker) return;

      marker.addTo(territorialLabelsLayer);
      labelCount += 1;
    });
  }
}

function scheduleTerritorialLabelUpdate() {
  if (territorialLabelsUpdateTimer) window.clearTimeout(territorialLabelsUpdateTimer);

  territorialLabelsUpdateTimer = window.setTimeout(() => {
    territorialLabelsUpdateTimer = null;
    updateTerritorialLabels();
  }, TERRITORIAL_LABELS_DEBOUNCE_MS);
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
