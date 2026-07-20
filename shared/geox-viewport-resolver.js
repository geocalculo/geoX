(function (global) {
  const VIEWPORT_PRIORITY = { CROSS_ACCESS: 1, GEOQUERY_RETURN: 2, MEMORY_PREVIEW: 3, GPS: 4, IP: 5, SITE_DEFAULT: 6 };
  const VIEWPORT_DEBUG = false;
  const EMERGENCY_VIEWPORTS = {
    geoipt: { center: { lat: -33.4489, lon: -70.6693 }, scaleDenominator: 20000, fallbackZoom: 14.5, basemap: "osm" },
    geoeva: { center: { lat: -23.6509, lon: -70.3975 }, scaleDenominator: 50000, fallbackZoom: 13.5, basemap: "osm" },
    geonemo: { center: { lat: -28.5758, lon: -70.7581 }, scaleDenominator: 50000, fallbackZoom: 13.5, basemap: "osm" },
    geonoxa: { center: { lat: -30.2303, lon: -71.0858 }, scaleDenominator: 25000, fallbackZoom: 14.25, basemap: "osm" }
  };
  const DEFAULT_CONFIG = { site: "geox", defaultViewport: { center: { lat: -30, lon: -71 }, scaleDenominator: 5000000, fallbackZoom: 5, basemap: "osm" }, locationViewport: { scaleDenominator: 5000000, fallbackZoom: 5, basemap: "osm" }, zoomLimits: { min: 3, max: 19, snap: 0.25 }, limits: { minimumZoom: 0, maximumZoom: 22 } };
  const finite = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const validLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
  const validLon = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
  const getLimit = (cfg, key, fallback) => {
    if (key === "minimumZoom") return finite(cfg?.zoomLimits?.min) ?? finite(cfg?.limits?.minimumZoom) ?? fallback;
    if (key === "maximumZoom") return finite(cfg?.zoomLimits?.max) ?? finite(cfg?.limits?.maximumZoom) ?? fallback;
    return finite(cfg?.limits?.[key]) ?? fallback;
  };
  function clampZoom(zoom, minimumZoom, maximumZoom) { return Math.min(maximumZoom, Math.max(minimumZoom, zoom)); }
  function calculateLeafletZoomForScale({ latitude, scaleDenominator, dpi = 96 }) {
    const lat = Number(latitude); const scale = Number(scaleDenominator);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(scale) || scale <= 0) return null;
    const earthResolutionAtZoom0 = 156543.03392804097;
    const metersPerPixel = scale * 0.0254 / dpi;
    const latitudeFactor = Math.cos(lat * Math.PI / 180);
    if (latitudeFactor <= 0) return null;
    return Math.log2(earthResolutionAtZoom0 * latitudeFactor / metersPerPixel);
  }
  function log(siteId, ...args) { if (VIEWPORT_DEBUG) console.debug(`[${siteId} Viewport]`, ...args); }
  function normalizeBasemap(value, fallback = "osm") {
    const raw = String(value || "").trim().toLowerCase();
    if (["sat", "satellite", "satelital"].includes(raw)) return "sat";
    if (["osm", "openstreetmap", "open street map"].includes(raw)) return "osm";
    return fallback === "sat" ? "sat" : "osm";
  }
  function validZoom(z, cfg) { const n = finite(z); return n !== null && n >= getLimit(cfg, "minimumZoom", 0) && n <= getLimit(cfg, "maximumZoom", 22); }
  function validCoord(c) { return c == null || (validLat(c.lat) && validLon(c.lon)); }
  function isValidViewport(v, cfg) { return !!v && validLat(v.center?.lat) && validLon(v.center?.lon) && validZoom(v.zoom, cfg) && ["osm", "sat"].includes(v.basemap) && validCoord(v.consultedCoordinate); }
  function readParam(params, names) { for (const n of names) { const v = params.get(n); if (v !== null && v !== "") return v; } return null; }
  function parseConsulted(params) { const lat = finite(readParam(params, ["queryLat", "lat"])); const lon = finite(readParam(params, ["queryLon", "lon"])); return validLat(lat) && validLon(lon) ? { lat, lon } : null; }
  function canon(base, siteId, cfg) { return { source: base.source, center: base.center, zoom: finite(base.zoom), basemap: normalizeBasemap(base.basemap, cfg?.defaultViewport?.basemap), consultedCoordinate: base.consultedCoordinate || null, timestamp: finite(base.timestamp) || Date.now(), siteOrigin: base.siteOrigin || null, siteDestination: siteId, isCrossAccess: base.source === "cross-access", scaleDenominator: finite(base.scaleDenominator) }; }
  function parseCrossAccessViewport(params, siteId, cfg) {
    const isCross = params.get("from") === "crossaccess" || params.get("source") === "crossaccess" || params.get("cross") === "true" || params.get("cross") === "1";
    if (!isCross) return null;
    const center = { lat: finite(readParam(params, ["mapCenterLat", "viewLat", "centerLat"])), lon: finite(readParam(params, ["mapCenterLon", "viewLon", "centerLon"])) };
    const v = canon({ source: "cross-access", center, zoom: readParam(params, ["mapZoom", "zoom"]), basemap: params.get("basemap"), consultedCoordinate: parseConsulted(params), siteOrigin: readParam(params, ["originSite", "siteOrigin", "site"]) }, siteId, cfg);
    log(siteId, "Cross Access detectado", v); return v;
  }
  function parseGeoQueryReturnViewport(params, siteId, cfg) {
    if (params.get("from") !== "geoquery" && params.get("restoreViewport") !== "1") return null;
    return canon({ source: "geoquery-return", center: { lat: finite(readParam(params, ["mapCenterLat", "viewLat", "centerLat"])), lon: finite(readParam(params, ["mapCenterLon", "viewLon", "centerLon"])) }, zoom: readParam(params, ["mapZoom", "zoom"]), basemap: params.get("basemap"), consultedCoordinate: parseConsulted(params), siteOrigin: "geoquery" }, siteId, cfg);
  }
  const previewKey = (siteId) => `geox:${siteId}:viewportPreview`;
  function loadSiteViewportPreview(siteId, cfg) { try { const raw = JSON.parse(sessionStorage.getItem(previewKey(siteId)) || "null"); if (!raw) return null; const v = canon({ ...raw, source: "memory-preview", siteOrigin: raw.siteOrigin || siteId }, siteId, cfg); if (raw.site && raw.site !== siteId) throw new Error("site mismatch"); if (!isValidViewport(v, cfg)) throw new Error("invalid viewport"); log(siteId, "Preview encontrado", v); return v; } catch (e) { try { sessionStorage.removeItem(previewKey(siteId)); } catch (_) {} if (e.message !== "Unexpected token u in JSON at position 0") console.warn(`[${siteId} Viewport] Preview descartado`, e); return null; } }
  function saveSiteViewportPreview(siteId, preview) { try { sessionStorage.setItem(previewKey(siteId), JSON.stringify({ site: siteId, ...preview, timestamp: Date.now() })); } catch (_) {} }
  function getEmergencyViewport(siteId) { return EMERGENCY_VIEWPORTS[siteId] || DEFAULT_CONFIG.defaultViewport; }
  async function loadSiteViewportConfig(siteId, path = "./parametros/viewport.json") {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const raw = await res.json();
      return { ...DEFAULT_CONFIG, ...raw, site: raw.site || siteId, __configLoadError: null };
    } catch (e) {
      console.error(`[${siteId}] Error cargando configuración`, e);
      console.warn(`[${siteId}] Se utilizará viewport de emergencia`);
      const emergency = getEmergencyViewport(siteId);
      return { ...DEFAULT_CONFIG, site: siteId, defaultViewport: emergency, locationViewport: emergency, __configLoadError: e };
    }
  }
  async function getLocationPermissionState() { try { if (!navigator.permissions?.query) return "prompt"; return (await navigator.permissions.query({ name: "geolocation" })).state || "prompt"; } catch (_) { return "prompt"; } }
  function resolveLocationZoom(cfg, latitude) {
    const locationConfig = cfg.locationViewport || cfg.defaultViewport || DEFAULT_CONFIG.defaultViewport;
    const calculated = calculateLeafletZoomForScale({ latitude, scaleDenominator: locationConfig.scaleDenominator });
    const zoom = Number.isFinite(calculated) ? calculated : (finite(locationConfig.fallbackZoom) ?? finite(locationConfig.zoom) ?? 5);
    return clampZoom(zoom, getLimit(cfg, "minimumZoom", 0), getLimit(cfg, "maximumZoom", 22));
  }
  async function tryGetGpsViewport(siteId, cfg, getGps) { if (typeof getGps !== "function") return null; try { log(siteId, "GPS iniciado"); const p = await getGps(); const lat = finite(p?.lat), lon = finite(p?.lon); if (!validLat(lat) || !validLon(lon)) return null; const v = canon({ source: "gps", center: { lat, lon }, zoom: resolveLocationZoom(cfg, lat), basemap: normalizeBasemap((cfg.locationViewport || cfg.defaultViewport)?.basemap, cfg.defaultViewport?.basemap), consultedCoordinate: null }, siteId, cfg); log(siteId, "GPS exitoso", v); return v; } catch (e) { log(siteId, "GPS fallido", e); return null; } }
  async function tryGetIpViewport(siteId, cfg, getIp) { if (typeof getIp !== "function") return null; try { log(siteId, "IP iniciada"); const p = await getIp(); const lat = finite(p?.lat), lon = finite(p?.lon); if (!validLat(lat) || !validLon(lon)) return null; const v = canon({ source: "ip", center: { lat, lon }, zoom: resolveLocationZoom(cfg, lat), basemap: normalizeBasemap((cfg.locationViewport || cfg.defaultViewport)?.basemap, cfg.defaultViewport?.basemap), consultedCoordinate: null }, siteId, cfg); log(siteId, "IP exitosa", v); return v; } catch (e) { log(siteId, "IP fallida", e); return null; } }
  function validateViewportConfig(rawConfig, siteId) {
    const viewport = rawConfig?.defaultViewport;
    if (!viewport) throw new Error(`[${siteId}] Falta defaultViewport`);
    const lat = Number(viewport?.center?.lat); const lon = Number(viewport?.center?.lon);
    const scale = Number(viewport.scaleDenominator); const fallbackZoom = Number(viewport.fallbackZoom);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`[${siteId}] Latitud default inválida`);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error(`[${siteId}] Longitud default inválida`);
    if (!Number.isFinite(scale) || scale <= 0) throw new Error(`[${siteId}] Escala default inválida`);
    if (!Number.isFinite(fallbackZoom)) throw new Error(`[${siteId}] fallbackZoom inválido`);
    return { center: { lat, lon }, scaleDenominator: scale, fallbackZoom, basemap: normalizeBasemap(viewport.basemap) };
  }
  function buildDefaultViewport(siteId, cfg) {
    let configured;
    try { configured = validateViewportConfig(cfg, siteId); }
    catch (error) {
      console.error(`[${siteId}] Error cargando configuración`, error);
      console.warn(`[${siteId}] Se utilizará viewport de emergencia`);
      configured = { ...getEmergencyViewport(siteId) };
    }
    const calculatedZoom = calculateLeafletZoomForScale({ latitude: configured.center.lat, scaleDenominator: configured.scaleDenominator });
    const zoom = Number.isFinite(calculatedZoom) ? calculatedZoom : configured.fallbackZoom;
    return canon({ source: "site-default", center: { ...configured.center }, zoom: clampZoom(zoom, getLimit(cfg, "minimumZoom", 0), getLimit(cfg, "maximumZoom", 22)), basemap: configured.basemap, consultedCoordinate: null, scaleDenominator: configured.scaleDenominator }, siteId, cfg);
  }
  async function resolveInitialViewport({ siteId, siteConfig, urlSearchParams, getGps, getIp }) { const p = urlSearchParams || new URLSearchParams(location.search); for (const v of [parseCrossAccessViewport(p, siteId, siteConfig), parseGeoQueryReturnViewport(p, siteId, siteConfig), loadSiteViewportPreview(siteId, siteConfig)]) if (isValidViewport(v, siteConfig)) return v; const permission = await getLocationPermissionState(); log(siteId, "Estado del permiso", permission); if (permission === "granted") { const gps = await tryGetGpsViewport(siteId, siteConfig, getGps); if (isValidViewport(gps, siteConfig)) return gps; const ip = await tryGetIpViewport(siteId, siteConfig, getIp); if (isValidViewport(ip, siteConfig)) return ip; } const def = buildDefaultViewport(siteId, siteConfig); log(siteId, "JSON por defecto utilizado", def); return def; }
  function applyResolvedViewport({ map, viewport, setBasemap, restoreConsultedCoordinate }) { if (typeof setBasemap === "function") setBasemap(viewport.basemap); map.setView([viewport.center.lat, viewport.center.lon], viewport.zoom, { animate: false }); if (typeof restoreConsultedCoordinate === "function") restoreConsultedCoordinate(viewport.consultedCoordinate); console.info(`[${viewport.siteDestination} Viewport] Fuente inicial:`, viewport.source); }
  function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
  function installViewportPreviewPersistence({ siteId, map, getBasemap, getConsultedCoordinate }) { const save = debounce(() => { const c = map.getCenter(); saveSiteViewportPreview(siteId, { center: { lat: c.lat, lon: c.lng }, zoom: map.getZoom(), basemap: normalizeBasemap(typeof getBasemap === "function" ? getBasemap() : "osm"), consultedCoordinate: typeof getConsultedCoordinate === "function" ? getConsultedCoordinate() : null }); }, 250); map.on("moveend zoomend", save); global.addEventListener("beforeunload", save); return save; }
  global.GeoXViewport = { VIEWPORT_PRIORITY, VIEWPORT_DEBUG, normalizeBasemap, calculateLeafletZoomForScale, clampZoom, validateViewportConfig, buildDefaultViewport, loadSiteViewportConfig, resolveInitialViewport, applyResolvedViewport, installViewportPreviewPersistence, saveSiteViewportPreview, loadSiteViewportPreview, isValidViewport };
})(window);
