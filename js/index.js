let map;
let osmLayer;
let satLayer;
let currentBaseLayer;

const PARAMS_PATH = "parametros/parametros_index.json";

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
    conectarEventos();
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

  L.control.scale({
    metric: true,
    imperial: false
  }).addTo(map);

  map.invalidateSize();
}

function conectarEventos() {
  document.getElementById("btn-osm").addEventListener("click", () => {
    cambiarBase(osmLayer);
  });

  document.getElementById("btn-sat").addEventListener("click", () => {
    cambiarBase(satLayer);
  });

  document.getElementById("btn-clear").addEventListener("click", () => {
    document.getElementById("search-box").value = "";
  });

  document.getElementById("btn-search").addEventListener("click", () => {
    const texto = document.getElementById("search-box").value.trim();

    if (!texto) {
      alert("Ingrese un texto de búsqueda.");
      return;
    }

    alert(`GeoX aún no tiene buscador conectado. Texto ingresado: ${texto}`);
  });
}

function cambiarBase(nuevaCapa) {
  if (currentBaseLayer) {
    map.removeLayer(currentBaseLayer);
  }

  nuevaCapa.addTo(map);
  currentBaseLayer = nuevaCapa;
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
const panelCapasEnCarga = new Set();

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

  await Promise.all(candidatas.map((item) => cargarCapaPanelSiCorresponde(item)));
}

// CARGA DINÁMICA GEOJSON
async function cargarCapaPanelSiCorresponde(item) {
  if (!item || !item.id || !item.archivo || !map) return;

  const capaExistente = panelCapasCargadas.get(item.id);
  if (capaExistente) {
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
      style: item.style || {},
      onEachFeature: (feature, featureLayer) => vincularPopupPanel(feature, featureLayer, item)
    });

    panelCapasCargadas.set(item.id, layer);
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
