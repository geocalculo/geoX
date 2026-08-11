(function (global) {
  const VIEWPORT_PRIORITY = { CROSS_ACCESS: 1, MEMORY: 2, GPS: 3, IP: 4, SITE_DEFAULT: 5 };
  const DEBUG_VIEWPORT = false;
  const EMERGENCY_VIEWPORTS = {
    geoipt: { center: { lat: -33.4489, lon: -70.6693 }, scaleDenominator: 20000, fallbackZoom: 14.5, basemap: "osm" },
    geoeva: { center: { lat: -23.6509, lon: -70.3975 }, scaleDenominator: 50000, fallbackZoom: 13.5, basemap: "osm" },
    geonemo: { center: { lat: -28.5758, lon: -70.7581 }, scaleDenominator: 50000, fallbackZoom: 13.5, basemap: "osm" },
    geonoxa: { center: { lat: -30.2303, lon: -71.0858 }, scaleDenominator: 25000, fallbackZoom: 14.25, basemap: "osm" }
  };
  const DEFAULT_CONFIG = { site: "geox", defaultViewport: { center: { lat: -30, lon: -71 }, scaleDenominator: 5000000, fallbackZoom: 5, basemap: "osm" }, locationViewport: { scaleDenominator: 5000000, fallbackZoom: 5, basemap: "osm" }, zoomLimits: { min: 3, max: 19, snap: 0.25 }, limits: { minimumZoom: 0, maximumZoom: 22 } };
  const finite = (v) => { if (v === null || v === undefined || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
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
  function log(siteId, ...args) { if (DEBUG_VIEWPORT) console.debug(`[${siteId} Viewport]`, ...args); }
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
  function canon(base, siteId, cfg) { return { source: base.source, center: base.center, zoom: finite(base.zoom), basemap: normalizeBasemap(base.basemap, cfg?.defaultViewport?.basemap), consultedCoordinate: base.consultedCoordinate || null, queryPoint: base.consultedCoordinate || null, timestamp: finite(base.timestamp) || Date.now(), siteOrigin: base.siteOrigin || null, siteDestination: siteId, isCrossAccess: base.source === "cross-access", scaleDenominator: finite(base.scaleDenominator) }; }
  function parseCrossAccessViewport(params, siteId, cfg) {
    const isCross = params.get("from") === "crossaccess" || params.get("source") === "crossaccess" || params.get("cross") === "true" || params.get("cross") === "1" || params.get("crossAccess") === "1";
    if (!isCross) return null;
    const center = { lat: finite(readParam(params, ["mapCenterLat", "viewLat", "centerLat"])), lon: finite(readParam(params, ["mapCenterLon", "viewLon", "centerLon"])) };
    const v = canon({ source: "cross-access", center, zoom: readParam(params, ["mapZoom", "zoom"]), basemap: params.get("basemap"), consultedCoordinate: parseConsulted(params), siteOrigin: readParam(params, ["originSite", "siteOrigin", "site"]) }, siteId, cfg);
    log(siteId, "Cross Access detectado", v); return v;
  }
  function parseGeoQueryReturnViewport(params, siteId, cfg) {
    if (params.get("from") !== "geoquery" && params.get("restoreViewport") !== "1") return null;
    return canon({ source: "memory", center: { lat: finite(readParam(params, ["mapCenterLat", "viewLat", "centerLat"])), lon: finite(readParam(params, ["mapCenterLon", "viewLon", "centerLon"])) }, zoom: readParam(params, ["mapZoom", "zoom"]), basemap: params.get("basemap"), consultedCoordinate: parseConsulted(params), siteOrigin: "geoquery" }, siteId, cfg);
  }
  const previewKey = (siteId) => `geox:${siteId}:viewportPreview`;
  function loadSiteViewportPreview(siteId, cfg) { try { const raw = JSON.parse(sessionStorage.getItem(previewKey(siteId)) || "null"); if (!raw) return null; const v = canon({ ...raw, source: "memory", siteOrigin: raw.siteOrigin || siteId }, siteId, cfg); if (raw.site && raw.site !== siteId) throw new Error("site mismatch"); if (!isValidViewport(v, cfg)) throw new Error("invalid viewport"); log(siteId, "Preview encontrado", v); return v; } catch (e) { try { sessionStorage.removeItem(previewKey(siteId)); } catch (_) {} if (e.message !== "Unexpected token u in JSON at position 0") console.warn(`[${siteId} Viewport] Preview descartado`, e); return null; } }
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
  function normalizeConfiguredViewport(rawConfig) {
    if (rawConfig?.initialViewport) {
      const initial = rawConfig.initialViewport;
      const referenceDenominator = String(initial.referenceScale || "").split(":").pop().replace(/[^0-9]/g, "");
      return { center: initial.center, scaleDenominator: Number(referenceDenominator) || initial.scaleDenominator, fallbackZoom: initial.zoom ?? initial.fallbackZoom, zoom: initial.zoom, basemap: initial.basemap };
    }
    return rawConfig?.defaultViewport;
  }
  function validateViewportConfig(rawConfig, siteId) {
    const viewport = normalizeConfiguredViewport(rawConfig);
    if (!viewport) throw new Error(`[${siteId}] Falta defaultViewport`);
    const lat = Number(viewport?.center?.lat); const lon = Number(viewport?.center?.lon);
    const scale = Number(viewport.scaleDenominator); const fallbackZoom = Number(viewport.fallbackZoom);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error(`[${siteId}] Latitud default inválida`);
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new Error(`[${siteId}] Longitud default inválida`);
    if (!Number.isFinite(scale) || scale <= 0) throw new Error(`[${siteId}] Escala default inválida`);
    if (!Number.isFinite(fallbackZoom)) throw new Error(`[${siteId}] fallbackZoom inválido`);
    return { center: { lat, lon }, scaleDenominator: scale, fallbackZoom, zoom: finite(viewport.zoom), basemap: normalizeBasemap(viewport.basemap) };
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
    const zoom = Number.isFinite(configured.zoom) ? configured.zoom : (Number.isFinite(calculatedZoom) ? calculatedZoom : configured.fallbackZoom);
    return canon({ source: "site-default", center: { ...configured.center }, zoom: clampZoom(zoom, getLimit(cfg, "minimumZoom", 0), getLimit(cfg, "maximumZoom", 22)), basemap: configured.basemap, consultedCoordinate: null, scaleDenominator: configured.scaleDenominator }, siteId, cfg);
  }
  function getInitialRegion(siteId, cfg) {
    const defaults = {
      geoipt: "Región Metropolitana de Santiago",
      geoeva: "Región de Antofagasta",
      geonemo: "Región de Los Lagos",
      geonoxa: "Región de Coquimbo"
    };
    return cfg?.initialRegion || defaults[siteId] || "";
  }
  function readCrossAccessViewport(params = new URLSearchParams(location.search)) {
    const isCrossAccess = params.get("from") === "crossaccess" || params.get("crossAccess") === "1";
    if (!isCrossAccess) return null;
    const centerLat = finite(params.get("mapCenterLat")) ?? finite(params.get("lat"));
    const centerLon = finite(params.get("mapCenterLon")) ?? finite(params.get("lon"));
    const zoom = finite(params.get("mapZoom")) ?? finite(params.get("zoom"));
    return {
      centerLat,
      centerLon,
      zoom,
      basemap: normalizeBasemap(params.get("basemap"), "osm"),
      isValid: validLat(centerLat) && validLon(centerLon) && Number.isFinite(zoom)
    };
  }
  function normalizeRegionName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/^region metropolitana de santiago$/, "metropolitana")
      .replace(/^region de /, "")
      .replace(/^region /, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function findRegionOption(regionSelector, configuredRegion) {
    const target = normalizeRegionName(configuredRegion);
    return Array.from(regionSelector?.options || []).find((option) => {
      return normalizeRegionName(option.textContent) === target || normalizeRegionName(option.value) === target;
    }) || null;
  }
  async function waitForRegionSelector(regionSelector, timeoutMs = 4000) {
    const started = Date.now();
    while (regionSelector && regionSelector.options.length === 0 && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return regionSelector;
  }
  async function selectAndZoomInitialRegion({ siteId, siteConfig, regionSelector, executeExistingRegionSearch }) {
    const configuredRegion = getInitialRegion(siteId, siteConfig);
    await waitForRegionSelector(regionSelector);
    const matchingOption = findRegionOption(regionSelector, configuredRegion);
    if (!matchingOption) {
      console.error("[Initial Viewport] Región predeterminada no encontrada:", configuredRegion);
      return false;
    }
    regionSelector.value = matchingOption.value;
    await executeExistingRegionSearch(matchingOption.value, { source: "initialization" });
    return true;
  }
  async function initializeInitialViewport({ map, siteId, siteConfig, regionSelector, executeExistingRegionSearch, applyBasemap }) {
    const crossAccessViewport = readCrossAccessViewport(new URLSearchParams(location.search));

    if (crossAccessViewport?.isValid) {
      if (typeof applyBasemap === "function") applyBasemap(crossAccessViewport.basemap);
      map.setView([crossAccessViewport.centerLat, crossAccessViewport.centerLon], crossAccessViewport.zoom, { animate: false });
      map.__geoxInitialViewportApplied = true;
      map.__geoxInitialViewport = { source: "cross-access", center: { lat: crossAccessViewport.centerLat, lon: crossAccessViewport.centerLon }, zoom: crossAccessViewport.zoom, basemap: crossAccessViewport.basemap };
      console.info("[Viewport Init] Source: cross-access");
      return true;
    }

    if (typeof applyBasemap === "function") applyBasemap("osm");
    const selected = await selectAndZoomInitialRegion({ siteId, siteConfig, regionSelector, executeExistingRegionSearch });
    map.__geoxInitialViewportApplied = selected;
    map.__geoxInitialViewport = { source: "initial-region", region: getInitialRegion(siteId, siteConfig), basemap: "osm" };
    return selected;
  }
  async function resolveInitialViewport({ siteId, siteConfig, urlSearchParams }) { const p = urlSearchParams || new URLSearchParams(location.search); const cross = readCrossAccessViewport(p); if (cross?.isValid) return canon({ source: "cross-access", center: { lat: cross.centerLat, lon: cross.centerLon }, zoom: cross.zoom, basemap: cross.basemap, consultedCoordinate: null }, siteId, siteConfig); return buildDefaultViewport(siteId, siteConfig); }
  function applyResolvedViewport({ map, viewport, setBasemap, restoreConsultedCoordinate }) {
    if (map.__geoxInitialViewportApplied) return;
    if (typeof setBasemap === "function") setBasemap(viewport.basemap);
    map.setView([viewport.center.lat, viewport.center.lon], viewport.zoom, { animate: false });
    map.__geoxInitialViewportApplied = true;
    map.__geoxInitialViewport = viewport;
    if (typeof restoreConsultedCoordinate === "function") restoreConsultedCoordinate(viewport.consultedCoordinate || viewport.queryPoint);
  }
  function debounce(fn, wait) { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); }; }
  function installViewportPreviewPersistence({ siteId, map, getBasemap, getConsultedCoordinate }) { const save = debounce(() => { const c = map.getCenter(); saveSiteViewportPreview(siteId, { center: { lat: c.lat, lon: c.lng }, zoom: map.getZoom(), basemap: normalizeBasemap(typeof getBasemap === "function" ? getBasemap() : "osm"), consultedCoordinate: typeof getConsultedCoordinate === "function" ? getConsultedCoordinate() : null }); }, 250); map.on("moveend zoomend", save); global.addEventListener("beforeunload", save); return save; }
  global.GeoXViewport = { VIEWPORT_PRIORITY, DEBUG_VIEWPORT, normalizeBasemap, calculateLeafletZoomForScale, clampZoom, validateViewportConfig, buildDefaultViewport, loadSiteViewportConfig, readCrossAccessViewport, normalizeRegionName, findRegionOption, waitForRegionSelector, selectAndZoomInitialRegion, initializeInitialViewport, resolveInitialViewport, applyResolvedViewport, installViewportPreviewPersistence, saveSiteViewportPreview, loadSiteViewportPreview, isValidViewport };
})(window);
