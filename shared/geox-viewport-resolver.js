(function (global) {
  const VIEWPORT_PRIORITY = { CROSS_ACCESS: 1, MEMORY_PREVIEW: 2, GPS: 3, IP: 4, SITE_DEFAULT: 5 };
  const VIEWPORT_DEBUG = false;
  const DEFAULT_CONFIG = { site: "geox", defaultViewport: { center: { lat: -30, lon: -71 }, zoom: 5, basemap: "osm" }, locationViewport: { zoom: 11 }, limits: { minimumZoom: 0, maximumZoom: 22 } };
  const finite = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
  const validLat = (v) => Number.isFinite(v) && v >= -90 && v <= 90;
  const validLon = (v) => Number.isFinite(v) && v >= -180 && v <= 180;
  const getLimit = (cfg, key, fallback) => finite(cfg?.limits?.[key]) ?? fallback;
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
  function canon(base, siteId, cfg) { return { source: base.source, center: base.center, zoom: finite(base.zoom), basemap: normalizeBasemap(base.basemap, cfg?.defaultViewport?.basemap), consultedCoordinate: base.consultedCoordinate || null, timestamp: finite(base.timestamp) || Date.now(), siteOrigin: base.siteOrigin || null, siteDestination: siteId, isCrossAccess: base.source === "cross-access" }; }
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
  async function loadSiteViewportConfig(siteId, path = "./parametros/viewport.json") { try { const res = await fetch(path, { cache: "no-store" }); if (!res.ok) throw new Error(`${res.status} ${res.statusText}`); return { ...DEFAULT_CONFIG, ...(await res.json()) }; } catch (e) { console.error(`[${siteId} Viewport] Error cargando JSON; se usa fallback seguro`, e); return { ...DEFAULT_CONFIG, site: siteId }; } }
  async function getLocationPermissionState() { try { if (!navigator.permissions?.query) return "prompt"; return (await navigator.permissions.query({ name: "geolocation" })).state || "prompt"; } catch (_) { return "prompt"; } }
  function getLocationZoom(cfg, kind) { return finite(cfg?.locationViewport?.[`${kind}Zoom`]) ?? finite(cfg?.locationViewport?.zoom) ?? finite(cfg?.locationZoom) ?? finite(cfg?.defaultViewport?.zoom) ?? 5; }
  async function tryGetGpsViewport(siteId, cfg, getGps) { if (typeof getGps !== "function") return null; try { log(siteId, "GPS iniciado"); const p = await getGps(); const lat = finite(p?.lat), lon = finite(p?.lon); if (!validLat(lat) || !validLon(lon)) return null; const v = canon({ source: "gps", center: { lat, lon }, zoom: getLocationZoom(cfg, "gps"), basemap: cfg.defaultViewport?.basemap, consultedCoordinate: null }, siteId, cfg); log(siteId, "GPS exitoso", v); return v; } catch (e) { log(siteId, "GPS fallido", e); return null; } }
  async function tryGetIpViewport(siteId, cfg, getIp) { if (typeof getIp !== "function") return null; try { log(siteId, "IP iniciada"); const p = await getIp(); const lat = finite(p?.lat), lon = finite(p?.lon); if (!validLat(lat) || !validLon(lon)) return null; const v = canon({ source: "ip", center: { lat, lon }, zoom: getLocationZoom(cfg, "ip"), basemap: cfg.defaultViewport?.basemap, consultedCoordinate: null }, siteId, cfg); log(siteId, "IP exitosa", v); return v; } catch (e) { log(siteId, "IP fallida", e); return null; } }
  function buildDefaultViewport(siteId, cfg) { const d = cfg.defaultViewport || DEFAULT_CONFIG.defaultViewport; return canon({ source: "site-default", center: { lat: finite(d.center?.lat), lon: finite(d.center?.lon) }, zoom: d.zoom, basemap: d.basemap, consultedCoordinate: null }, siteId, cfg); }
  async function resolveInitialViewport({ siteId, siteConfig, urlSearchParams, getGps, getIp }) { const p = urlSearchParams || new URLSearchParams(location.search); for (const v of [parseCrossAccessViewport(p, siteId, siteConfig), parseGeoQueryReturnViewport(p, siteId, siteConfig), loadSiteViewportPreview(siteId, siteConfig)]) if (isValidViewport(v, siteConfig)) return v; const permission = await getLocationPermissionState(); log(siteId, "Estado del permiso", permission); if (permission === "granted") { const gps = await tryGetGpsViewport(siteId, siteConfig, getGps); if (isValidViewport(gps, siteConfig)) return gps; const ip = await tryGetIpViewport(siteId, siteConfig, getIp); if (isValidViewport(ip, siteConfig)) return ip; } const def = buildDefaultViewport(siteId, siteConfig); log(siteId, "JSON por defecto utilizado", def); return def; }
  function applyResolvedViewport({ map, viewport, setBasemap, restoreConsultedCoordinate }) { if (typeof setBasemap === "function") setBasemap(viewport.basemap); map.setView([viewport.center.lat, viewport.center.lon], viewport.zoom, { animate: false }); if (typeof restoreConsultedCoordinate === "function") restoreConsultedCoordinate(viewport.consultedCoordinate); console.info(`[${viewport.siteDestination} Viewport] Fuente inicial:`, viewport.source); }
  function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
  function installViewportPreviewPersistence({ siteId, map, getBasemap, getConsultedCoordinate }) { const save = debounce(() => { const c = map.getCenter(); saveSiteViewportPreview(siteId, { center: { lat: c.lat, lon: c.lng }, zoom: map.getZoom(), basemap: normalizeBasemap(typeof getBasemap === "function" ? getBasemap() : "osm"), consultedCoordinate: typeof getConsultedCoordinate === "function" ? getConsultedCoordinate() : null }); }, 250); map.on("moveend zoomend", save); global.addEventListener("beforeunload", save); return save; }
  global.GeoXViewport = { VIEWPORT_PRIORITY, VIEWPORT_DEBUG, normalizeBasemap, loadSiteViewportConfig, resolveInitialViewport, applyResolvedViewport, installViewportPreviewPersistence, saveSiteViewportPreview, loadSiteViewportPreview, isValidViewport };
})(window);
