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
  const summaryBar = document.getElementById("summary-bar");

  siteTitle.textContent = params.titulo || "GeoX";
  siteSubtitle.textContent = params.subtitulo || "Molde territorial genérico";
  panelTitle.textContent = params.panel_titulo || "Panel Territorial";
  searchBox.placeholder = params.search_placeholder || "Buscar...";

  if (Array.isArray(params.summary_items)) {
    summaryBar.innerHTML = "";

    params.summary_items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "summary-item";

      div.innerHTML = `
        <span class="summary-value">${item.value}</span>
        <span class="summary-label">${item.label}</span>
      `;

      summaryBar.appendChild(div);
    });
  }
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
  } else {
    osmLayer.addTo(map);
    currentBaseLayer = osmLayer;
  }

  // GEOFACTORY ESCALA GRÁFICA
  L.control.scale({
    position: "bottomleft",
    metric: true,
    imperial: false,
    maxWidth: 120
  }).addTo(map);

  map.invalidateSize();
}

function conectarEventos() {
  const regionSelector = document.getElementById("region-selector");

  if (regionSelector) {
    regionSelector.addEventListener("change", () => moverViewportPorRegion(regionSelector.value));
  }

  document.getElementById("btn-osm").addEventListener("click", () => {
    cambiarBase(osmLayer);
  });

  document.getElementById("btn-sat").addEventListener("click", () => {
    cambiarBase(satLayer);
  });

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

  conectarSearchBoxToSearch();
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

function cambiarBase(nuevaCapa) {
  if (currentBaseLayer) {
    map.removeLayer(currentBaseLayer);
  }

  nuevaCapa.addTo(map);
  currentBaseLayer = nuevaCapa;
  actualizarEstiloPerimetrosIptVisibles();
}

// GEOFACTORY TOSEARCH
const TOSEARCH_LISTADO_PATH = "capas_tosearch/listado_tosearch.json";
const toSearchIndice = [];
let toSearchResultadosActuales = [];
let toSearchHighlightLayer = null;

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
function seleccionarResultadoToSearch(item) {
  const searchBox = document.getElementById("search-box");
  if (searchBox) searchBox.value = item.texto_localidad;
  cerrarResultadosToSearch();

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

  // Actualizar DOM central #summary-bar
  const summaryBar = document.getElementById("summary-bar");
  if (!summaryBar) return;
  summaryBar.innerHTML = "";
  resultados.forEach((r) => {
    const div = document.createElement("div");
    div.className = "summary-item";
    div.innerHTML = `\n      <span class="summary-value">${r.value}</span>\n      <span class="summary-label">${r.label}</span>\n    `;
    summaryBar.appendChild(div);
  });
}
// GEOFACTORY PANEL TERRITORIAL
const PANEL_CAPAS_PATH = "capas_panel/listado_capas.json";
let panelCapasListado = [];
let panelPerimetrosActivo = false;
const panelCapasCargadas = new Map();
// ETIQUETAS LOCALIDAD PANEL
const panelLabelsCargados = new Map();
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
  if (!toggle || !map) return;

  toggle.addEventListener("change", () => {
    panelPerimetrosActivo = toggle.checked;
    // ON/OFF PERÍMETROS IPT
    if (panelPerimetrosActivo) {
      actualizarPerimetrosIptVisibles();
    } else {
      removerTodosPerimetrosIpt();
    }
  });

  map.on("moveend zoomend", () => {
    if (panelPerimetrosActivo) actualizarPerimetrosIptVisibles();
  });
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

  panelLabelsCargados.forEach((layerLabels, id) => {
    if (!idsCandidatas.has(id) && map.hasLayer(layerLabels)) {
      map.removeLayer(layerLabels);
    }
  });

  await Promise.all(candidatas.map((item) => cargarCapaPanelSiCorresponde(item)));
}

// CARGA DINÁMICA GEOJSON
async function cargarCapaPanelSiCorresponde(item) {
  if (!item || !item.id || !item.archivo || !map) return;

  const capaExistente = panelCapasCargadas.get(item.id);
  if (capaExistente) {
    capaExistente.setStyle(obtenerEstiloPerimetrosSegunBase(item.style || {}));
    if (!map.hasLayer(capaExistente)) capaExistente.addTo(map);
    const labelsExistentes = panelLabelsCargados.get(item.id);
    if (labelsExistentes && !map.hasLayer(labelsExistentes)) labelsExistentes.addTo(map);
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
    const layerLabels = crearLabelsLocalidadParaGeoJSON(geojson);

    panelCapasCargadas.set(item.id, layer);
    panelLabelsCargados.set(item.id, layerLabels);
    if (panelPerimetrosActivo && bboxIntersectaViewport(item.bbox, map.getBounds())) {
      layer.addTo(map);
      layerLabels.addTo(map);
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

function crearLabelsLocalidadParaGeoJSON(geojson) {
  const layerLabels = L.layerGroup();
  const features = Array.isArray(geojson?.features) ? geojson.features : [];

  features.forEach((feature) => {
    const center = obtenerCentroFeatureParaLabel(feature);
    const marker = crearMarkerLabelLocalidad(feature, center);
    if (marker) layerLabels.addLayer(marker);
  });

  return layerLabels;
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

function removerTodosLabelsLocalidad() {
  // REMOVER LABELS LOCALIDAD
  panelLabelsCargados.forEach((layerLabels) => {
    if (map && map.hasLayer(layerLabels)) map.removeLayer(layerLabels);
  });
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
