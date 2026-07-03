(function () {
  "use strict";

  const DEFAULT_CONFIG = {
    density_unit_km2: 100,
    global_defaults: {
      desktop: { max_labels_per_100km2: 8, min_labels: 1, hard_max_labels: 60 },
      mobile: { max_labels_per_100km2: 3, min_labels: 1, hard_max_labels: 20 }
    },
    zoom_limits: [],
    collision: { enabled: true, min_distance_px: { desktop: 18, mobile: 24 }, label_padding_px: { desktop: 6, mobile: 8 } },
    deduplication: { enabled: true, by_text: true, by_visual_cell: true, visual_cell_size_px: { desktop: 120, mobile: 160 }, max_same_text_per_cell: { desktop: 1, mobile: 1 } },
    area_calculation: { bbox_padding_px: { desktop: 24, mobile: 12 } }
  };

  const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
  const mode = () => (isMobile() ? "mobile" : "desktop");
  const num = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;
  const esc = (v) => String(v).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", '"': "&quot;" }[c]));
  const byMode = (v, fallback) => (v && typeof v === "object" && !Array.isArray(v)) ? num(v[mode()], fallback) : num(v, fallback);

  async function loadSmartLabelConfig(path = "./capas_panel/label_density_config.json") {
    try {
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar ${path}`);
      const data = await response.json();
      return { ...DEFAULT_CONFIG, ...(data && typeof data === "object" ? data : {}) };
    } catch (error) {
      console.info("Smart Labels GeoX: usando configuración interna por defecto.", error);
      return { ...DEFAULT_CONFIG };
    }
  }

  function getLayerConfig(config, layerId) {
    const layers = Array.isArray(config.layers) ? config.layers : [];
    return layers.find((l) => [l.layer_id, l.id, l.layerId].includes(layerId)) || {};
  }

  function mergedParams(config, layerId, zoom) {
    const m = mode();
    const def = (config.global_defaults && config.global_defaults[m]) || DEFAULT_CONFIG.global_defaults[m];
    const layer = getLayerConfig(config, layerId);
    const layerMode = (layer && layer[m]) || {};
    const z = (config.zoom_limits || []).find((it) => zoom >= num(it.min_zoom, -Infinity) && zoom <= num(it.max_zoom, Infinity)) || {};
    return {
      labelFields: [layer.label_field, ...(layer.fallback_label_fields || []), ...(layer.label_fields || [])].filter(Boolean),
      maxPer100: num(layerMode.max_labels_per_100km2 ?? layer.max_labels_per_100km2, num(def.max_labels_per_100km2, 8)),
      hardMax: num(layerMode.hard_max_labels ?? layer.hard_max_labels, num(def.hard_max_labels, 60)),
      minLabels: num(layerMode.min_labels ?? layer.min_labels, num(def.min_labels, 0)),
      zoomHardMax: num(z[`${m}_hard_max_labels`], Infinity),
      cellSize: byMode(config.deduplication && config.deduplication.visual_cell_size_px, 120),
      maxSameTextPerCell: byMode(config.deduplication && config.deduplication.max_same_text_per_cell, 1),
      minDistance: byMode(config.collision && config.collision.min_distance_px, 18),
      labelPadding: byMode(config.collision && config.collision.label_padding_px, 6),
      bboxPadding: byMode(config.area_calculation && config.area_calculation.bbox_padding_px, 24)
    };
  }

  function featureText(feature, fields, fallback) {
    if (fallback) return String(fallback(feature) || "").trim();
    const props = feature && feature.properties || {};
    for (const f of fields) if (props[f] !== undefined && props[f] !== null && String(props[f]).trim()) return String(props[f]).trim();
    return "";
  }

  function estimateAreaKm2(bounds) {
    const sw = bounds.getSouthWest(), ne = bounds.getNorthEast();
    const latKm = Math.abs(ne.lat - sw.lat) * 111.32;
    const mid = (ne.lat + sw.lat) / 2 * Math.PI / 180;
    const lonKm = Math.abs(ne.lng - sw.lng) * 111.32 * Math.max(Math.cos(mid), 0.05);
    return Math.max(latKm * lonKm, 0.01);
  }

  function intersects(a, b, gap) {
    return !(a.right + gap < b.left || a.left - gap > b.right || a.bottom + gap < b.top || a.top - gap > b.bottom);
  }

  function defaultLatLng(feature) {
    const g = feature && feature.geometry;
    if (g && g.type === "Point" && Array.isArray(g.coordinates)) return L.latLng(Number(g.coordinates[1]), Number(g.coordinates[0]));
    return null;
  }

  function updateSmartLabels(layerId, features, options = {}) {
    const map = options.map || window.geoxMap;
    const Lref = window.L;
    const labelGroup = options.labelGroup || options.labelsLayerGroup;
    if (!map || !Lref || !labelGroup) return { accepted: 0, candidates: 0, maxLabels: 0 };
    labelGroup.clearLayers();
    if (options.enabled === false) return { accepted: 0, candidates: 0, maxLabels: 0 };

    const config = options.config || window.geoxSmartLabelConfig || DEFAULT_CONFIG;
    const params = mergedParams(config, layerId, map.getZoom());
    const bounds = map.getBounds();
    const centerPt = map.latLngToLayerPoint(map.getCenter());
    const raw = Array.isArray(features) ? features : [];
    const candidates = [];

    for (const feature of raw) {
      const text = featureText(feature, params.labelFields, options.getLabelText);
      if (!text) continue;
      const latlng = (options.getLatLng && options.getLatLng(feature)) || defaultLatLng(feature);
      if (!latlng || !Number.isFinite(latlng.lat) || !Number.isFinite(latlng.lng) || !bounds.contains(latlng)) continue;
      const pt = map.latLngToLayerPoint(latlng);
      candidates.push({ feature, text, latlng, pt, priority: options.getPriority ? num(options.getPriority(feature), 0) : -pt.distanceTo(centerPt) });
    }

    if (!candidates.length) return { accepted: 0, candidates: 0, maxLabels: 0 };
    let useful = Lref.latLngBounds(candidates.map((c) => c.latlng));
    const nw = map.latLngToLayerPoint(useful.getNorthWest()).subtract([params.bboxPadding, params.bboxPadding]);
    const se = map.latLngToLayerPoint(useful.getSouthEast()).add([params.bboxPadding, params.bboxPadding]);
    useful = Lref.latLngBounds(map.layerPointToLatLng(nw), map.layerPointToLatLng(se));
    const maxByDensity = Math.floor((estimateAreaKm2(useful) / 100) * params.maxPer100);
    const maxLabels = Math.max(params.minLabels, Math.min(maxByDensity, params.hardMax, params.zoomHardMax, candidates.length));
    if (maxLabels <= 0) return { accepted: 0, candidates: candidates.length, maxLabels: 0 };

    candidates.sort((a, b) => b.priority - a.priority);
    const acceptedBoxes = [], usedTexts = new Set(), cellTextCounts = new Map();
    let accepted = 0;
    for (const c of candidates) {
      if (accepted >= maxLabels) break;
      const textKey = c.text.toLocaleLowerCase("es");
      const cellKey = `${Math.floor(c.pt.x / params.cellSize)}:${Math.floor(c.pt.y / params.cellSize)}`;
      const cellTextKey = `${cellKey}:${textKey}`;
      if (usedTexts.has(textKey)) continue;
      if ((cellTextCounts.get(cellTextKey) || 0) >= params.maxSameTextPerCell) continue;
      const width = Math.max(36, c.text.length * 7.2) + params.labelPadding * 2;
      const height = 18 + params.labelPadding * 2;
      const box = { left: c.pt.x - width / 2, right: c.pt.x + width / 2, top: c.pt.y - height / 2, bottom: c.pt.y + height / 2 };
      if (acceptedBoxes.some((b) => intersects(box, b, params.minDistance))) continue;
      Lref.marker(c.latlng, { interactive: false, keyboard: false, pane: options.pane, icon: Lref.divIcon({ className: options.className || "geox-smart-label", html: options.html ? options.html(c.text, c.feature) : esc(c.text), iconSize: null }) }).addTo(labelGroup);
      acceptedBoxes.push(box); usedTexts.add(textKey); cellTextCounts.set(cellTextKey, (cellTextCounts.get(cellTextKey) || 0) + 1); accepted += 1;
    }
    return { accepted, candidates: candidates.length, maxLabels, usefulAreaKm2: estimateAreaKm2(useful) };
  }

  window.GeoXSmartLabels = { loadSmartLabelConfig, updateSmartLabels, getLayerConfig };
})();
