(function () {
  "use strict";

  const NEAREST_LIMIT = 5;
  const CATALOG_URL = "../capas_geoquery/catalogo.json";
  const params = new URLSearchParams(window.location.search);
  const queryLat = Number(params.get("lat") ?? params.get("queryLat"));
  const queryLon = Number(params.get("lon") ?? params.get("queryLon"));
  const requestedZoom = Number(params.get("zoom"));
  const requestedBasemap = String(params.get("basemap") || "osm").toLowerCase() === "sat" ? "sat" : "osm";
  const validPoint = Number.isFinite(queryLat) && queryLat >= -90 && queryLat <= 90 && Number.isFinite(queryLon) && queryLon >= -180 && queryLon <= 180;

  const els = {
    status: document.getElementById("query-status"),
    count: document.getElementById("water-count"),
    nearest: document.getElementById("nearest-distance"),
    lat: document.getElementById("latitude"),
    lon: document.getElementById("longitude"),
    coords: document.getElementById("decimal-coordinates"),
    list: document.getElementById("nearest-list")
  };

  els.lat.textContent = validPoint ? queryLat.toFixed(6) : "No disponible";
  els.lon.textContent = validPoint ? queryLon.toFixed(6) : "No disponible";
  els.coords.textContent = validPoint ? `${queryLat.toFixed(6)}, ${queryLon.toFixed(6)}` : "No disponible";

  const map = L.map("geoquery-map", { zoomControl: true, minZoom: 3 });
  const basemaps = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" })
  };
  let activeBasemap = requestedBasemap;
  basemaps[activeBasemap].addTo(map);
  L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

  function setBasemap(name) {
    if (!basemaps[name] || name === activeBasemap) return;
    map.removeLayer(basemaps[activeBasemap]);
    activeBasemap = name;
    basemaps[activeBasemap].addTo(map);
    ["osm", "sat"].forEach((id) => {
      const button = document.getElementById(`btn-${id}`);
      const active = id === activeBasemap;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  document.getElementById("btn-osm").addEventListener("click", () => setBasemap("osm"));
  document.getElementById("btn-sat").addEventListener("click", () => setBasemap("sat"));
  setTimeout(() => {
    document.getElementById("btn-osm").classList.toggle("active", activeBasemap === "osm");
    document.getElementById("btn-sat").classList.toggle("active", activeBasemap === "sat");
  }, 0);

  const fallback = [-41.47, -72.94];
  map.setView(validPoint ? [queryLat, queryLon] : fallback, validPoint && Number.isFinite(requestedZoom) ? Math.max(3, Math.min(16, requestedZoom)) : 7);

  let queryMarker = null;
  if (validPoint) {
    queryMarker = L.circleMarker([queryLat, queryLon], {
      radius: 8, color: "#102a43", weight: 3, fillColor: "#38bdf8", fillOpacity: 1
    }).addTo(map).bindPopup(`<strong>Punto consultado</strong><br>${queryLat.toFixed(6)}, ${queryLon.toFixed(6)}`);
  }

  function lonLatToMercator(lon, lat) {
    const x = lon * 20037508.34 / 180;
    let y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);
    y = y * 20037508.34 / 180;
    return [x, y];
  }

  function mercatorToLonLat(x, y) {
    const lon = x / 20037508.34 * 180;
    let lat = y / 20037508.34 * 180;
    lat = 180 / Math.PI * (2 * Math.atan(Math.exp(lat * Math.PI / 180)) - Math.PI / 2);
    return [lon, lat];
  }

  const queryMercator = validPoint ? lonLatToMercator(queryLon, queryLat) : null;
  const mercatorScaleCorrection = validPoint ? Math.cos(queryLat * Math.PI / 180) : 1;

  function pointInRing(point, ring) {
    let inside = false;
    const x = point[0], y = point[1];
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = Number(ring[i][0]), yi = Number(ring[i][1]);
      const xj = Number(ring[j][0]), yj = Number(ring[j][1]);
      const intersects = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || Number.EPSILON) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }

  function pointInPolygon(point, rings) {
    if (!rings?.length || !pointInRing(point, rings[0])) return false;
    for (let i = 1; i < rings.length; i += 1) if (pointInRing(point, rings[i])) return false;
    return true;
  }

  function squaredDistanceToSegment(point, a, b) {
    const px = point[0], py = point[1], ax = Number(a[0]), ay = Number(a[1]), bx = Number(b[0]), by = Number(b[1]);
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return (px - ax) ** 2 + (py - ay) ** 2;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    const x = ax + t * dx, y = ay + t * dy;
    return (px - x) ** 2 + (py - y) ** 2;
  }

  function polygonDistanceMeters(point, rings) {
    if (pointInPolygon(point, rings)) return 0;
    let minSq = Infinity;
    for (const ring of rings || []) {
      for (let i = 1; i < ring.length; i += 1) minSq = Math.min(minSq, squaredDistanceToSegment(point, ring[i - 1], ring[i]));
      if (ring.length > 2) minSq = Math.min(minSq, squaredDistanceToSegment(point, ring[ring.length - 1], ring[0]));
    }
    return Math.sqrt(minSq) * mercatorScaleCorrection;
  }

  function geometryDistanceMeters(geometry) {
    if (!geometry) return Infinity;
    if (geometry.type === "Polygon") return polygonDistanceMeters(queryMercator, geometry.coordinates);
    if (geometry.type === "MultiPolygon") return Math.min(...geometry.coordinates.map((polygon) => polygonDistanceMeters(queryMercator, polygon)));
    return Infinity;
  }

  function bboxDistanceMeters(bbox) {
    if (!Array.isArray(bbox) || bbox.length < 4) return Infinity;
    const [west, south, east, north] = bbox.map(Number);
    const clampedLon = Math.max(west, Math.min(east, queryLon));
    const clampedLat = Math.max(south, Math.min(north, queryLat));
    const meanLat = (queryLat + clampedLat) * Math.PI / 360;
    const dx = (queryLon - clampedLon) * 111320 * Math.cos(meanLat);
    const dy = (queryLat - clampedLat) * 110540;
    return Math.hypot(dx, dy);
  }

  function transformCoordinates(coords) {
    if (!Array.isArray(coords)) return coords;
    if (coords.length >= 2 && typeof coords[0] === "number" && typeof coords[1] === "number") return mercatorToLonLat(coords[0], coords[1]);
    return coords.map(transformCoordinates);
  }

  function toLeafletFeature(feature) {
    return {
      type: "Feature",
      properties: feature.properties || {},
      geometry: feature.geometry ? { ...feature.geometry, coordinates: transformCoordinates(feature.geometry.coordinates) } : null
    };
  }

  function featureLabel(feature) {
    const p = feature.properties || {};
    const name = String(p.Nombre || "").trim();
    const type = String(p.Tipo || "Masa de agua").trim() || "Masa de agua";
    const commune = String(p.Comuna || "").trim();
    return name || [type, commune].filter(Boolean).join(" – ") || "Masa de agua sin nombre";
  }

  function formatDistance(meters) {
    if (!Number.isFinite(meters)) return "—";
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} km`;
  }

  function formatArea(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "Superficie s/i";
    const ha = n / 10000;
    return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits: ha < 10 ? 1 : 0 }).format(ha)} ha`;
  }

  async function loadRegion(layerConfig) {
    const url = `../capas_geoquery/${encodeURIComponent(layerConfig.file).replace(/%2F/g, "/")}`;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${layerConfig.region}: HTTP ${response.status}`);
    const geojson = await response.json();
    return Array.isArray(geojson.features) ? geojson.features : [];
  }

  async function findNearest(catalog) {
    const regions = (catalog.layers || []).filter((layer) => layer.enabled !== false).map((layer) => ({ ...layer, bboxDistance: bboxDistanceMeters(layer.bbox) })).sort((a, b) => a.bboxDistance - b.bboxDistance);
    const nearest = [];
    let loadedRegions = 0;

    for (const region of regions) {
      const currentCutoff = nearest.length >= NEAREST_LIMIT ? nearest[NEAREST_LIMIT - 1].distance : Infinity;
      if (nearest.length >= NEAREST_LIMIT && region.bboxDistance > currentCutoff) break;
      els.status.textContent = `Analizando ${region.region}…`;
      const features = await loadRegion(region);
      loadedRegions += 1;
      for (const feature of features) {
        const distance = geometryDistanceMeters(feature.geometry);
        if (!Number.isFinite(distance)) continue;
        nearest.push({ feature, distance, region: region.region });
      }
      nearest.sort((a, b) => a.distance - b.distance);
      if (nearest.length > NEAREST_LIMIT) nearest.length = NEAREST_LIMIT;
    }

    console.info(`[GeoMA GeoQuery] regiones cargadas: ${loadedRegions}; candidatos finales: ${nearest.length}`);
    return nearest;
  }

  const waterLayers = [];
  function renderResults(results) {
    els.count.textContent = String(results.length);
    els.nearest.textContent = results.length ? formatDistance(results[0].distance) : "—";
    els.list.innerHTML = "";

    const group = L.featureGroup();
    if (queryMarker) group.addLayer(queryMarker);

    results.forEach((item, index) => {
      const p = item.feature.properties || {};
      const label = featureLabel(item.feature);
      const transformed = toLeafletFeature(item.feature);
      const layer = L.geoJSON(transformed, {
        style: { color: "#0284c7", weight: 2.5, opacity: 1, fillColor: "#38bdf8", fillOpacity: 0.24 }
      }).addTo(map);
      layer.bindTooltip(`${index + 1}. ${label}`, { sticky: true, className: "water-tooltip" });
      waterLayers.push(layer);
      group.addLayer(layer);

      const row = document.createElement("div");
      row.className = "nearest-item";
      row.tabIndex = 0;
      row.innerHTML = `<span class="nearest-rank">${String(index + 1).padStart(2, "0")}</span><span class="nearest-main"><strong class="nearest-name"></strong><span class="nearest-meta"></span></span><strong class="nearest-distance">${formatDistance(item.distance)}</strong>`;
      row.querySelector(".nearest-name").textContent = label;
      row.querySelector(".nearest-meta").textContent = [p.Tipo || "Masa de agua", p.Comuna || "Comuna s/i", formatArea(p.st_area_sh)].join(" · ");

      const highlight = (active) => {
        row.classList.toggle("is-active", active);
        layer.setStyle(active ? { color: "#102a43", weight: 4, fillOpacity: .38 } : { color: "#0284c7", weight: 2.5, fillOpacity: .24 });
        if (active) layer.bringToFront();
      };
      row.addEventListener("mouseenter", () => highlight(true));
      row.addEventListener("mouseleave", () => highlight(false));
      row.addEventListener("focus", () => highlight(true));
      row.addEventListener("blur", () => highlight(false));
      row.addEventListener("click", () => {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds.pad(.25), { maxZoom: 14 });
      });
      els.list.appendChild(row);
    });

    if (results.length && group.getBounds().isValid()) map.fitBounds(group.getBounds().pad(.12), { maxZoom: 12 });
    els.status.textContent = results.length ? `Consulta lista · ${results.length} masas de agua más cercanas` : "No se encontraron masas de agua para esta consulta.";
  }

  async function init() {
    if (!validPoint) {
      els.status.textContent = "No se recibió un punto de consulta válido.";
      els.list.innerHTML = '<p class="placeholder-text">Vuelva a GeoMA y seleccione un punto sobre el mapa.</p>';
      return;
    }
    try {
      const response = await fetch(CATALOG_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`Catálogo GeoQuery no disponible (HTTP ${response.status})`);
      const catalog = await response.json();
      const results = await findNearest(catalog);
      renderResults(results);
    } catch (error) {
      console.error("[GeoMA GeoQuery]", error);
      els.status.textContent = "No fue posible cargar las capas de GeoQuery.";
      els.list.innerHTML = '<p class="placeholder-text">Revise que <strong>geoma/capas_geoquery</strong> esté disponible y vuelva a intentar.</p>';
    }
  }

  document.getElementById("back-link").addEventListener("click", (event) => {
    if (window.history.length > 1 && document.referrer) {
      event.preventDefault();
      window.history.back();
    }
  });

  init();
})();
