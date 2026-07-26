(function () {
  "use strict";

  const ENDPOINT = "https://hidden-mud-ce7a.geocalculo.workers.dev/api/registro";
  const SITES = ["geoipt", "geoeva", "geonemo", "geonoxa"];
  const SESSION_KEY = "geocalculo_session_id";
  const JOURNEY_KEY = "geocalculo_journey_id";

  function uuid() {
    return (window.crypto && typeof window.crypto.randomUUID === "function")
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function storageGet(storage, key) { try { return storage.getItem(key); } catch (_) { return null; } }
  function storageSet(storage, key, value) { try { storage.setItem(key, value); } catch (_) {} }

  function obtenerSitioActual() {
    const path = window.location.pathname.toLowerCase();
    return SITES.find((site) => path.includes(`/${site}/`)) || null;
  }

  function obtenerSessionId() {
    let id = storageGet(window.sessionStorage, SESSION_KEY);
    if (!id) { id = uuid(); storageSet(window.sessionStorage, SESSION_KEY, id); }
    return id;
  }

  function obtenerJourneyId() {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get("journey_id");
    if (incoming) storageSet(window.localStorage, JOURNEY_KEY, incoming);
    let id = storageGet(window.localStorage, JOURNEY_KEY);
    if (!id) { id = uuid(); storageSet(window.localStorage, JOURNEY_KEY, id); }
    return id;
  }

  function normalizarBasemap(value) {
    return String(value || "osm").toLowerCase() === "sat" ? "SAT" : "OSM";
  }

  function getMap() {
    if (window.geoxMap && typeof window.geoxMap.getCenter === "function") return window.geoxMap;
    if (window.map && typeof window.map.getCenter === "function") return window.map;
    return null;
  }

  function obtenerEstadoMapa() {
    const map = getMap();
    if (!map) return { latitud: null, longitud: null, zoom: null, basemap: normalizarBasemap(window.currentBasemap) };
    const center = map.getCenter();
    return { latitud: center.lat, longitud: center.lng, zoom: map.getZoom(), basemap: normalizarBasemap(window.currentBasemap) };
  }

  function registrarEventoGeocalculo({ tipoEvento, origen, estado, latitud, longitud, zoom, basemap, metadata } = {}) {
    const mapState = obtenerEstadoMapa();
    const payload = {
      tipo_evento: tipoEvento,
      sitio: obtenerSitioActual(),
      latitud: Number.isFinite(Number(latitud)) ? Number(latitud) : mapState.latitud,
      longitud: Number.isFinite(Number(longitud)) ? Number(longitud) : mapState.longitud,
      region: null,
      comuna: null,
      localidad: null,
      zoom: Number.isFinite(Number(zoom)) ? Number(zoom) : mapState.zoom,
      basemap: normalizarBasemap(basemap || mapState.basemap),
      origen,
      estado,
      metadata: metadata || {},
      session_id: obtenerSessionId(),
      journey_id: obtenerJourneyId()
    };
    if (!payload.tipo_evento || !payload.sitio || payload.latitud === null || payload.longitud === null) return;
    fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), keepalive: true }).catch(() => {});
  }

  function leerCrossAccess() {
    const params = new URLSearchParams(window.location.search);
    const site = obtenerSitioActual();
    const isCross = params.get("access") === "cross" || params.get("from") === "crossaccess" || params.get("crossAccess") === "1";
    const from = params.get("from");
    obtenerJourneyId();
    if (params.has("access") || params.has("journey_id")) {
      params.delete("access"); params.delete("journey_id");
      if (from && SITES.includes(from)) params.delete("from");
      const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
      window.history.replaceState(window.history.state, "", next);
    }
    return { isCross, from: SITES.includes(from) ? from : null, to: site };
  }

  function registrarIndexLoadUnaVez() {
    if (window.__geocalculoIndexLoadRegistrado) return;
    const mapState = obtenerEstadoMapa();
    if (mapState.latitud === null || mapState.longitud === null || mapState.zoom === null) return;
    window.__geocalculoIndexLoadRegistrado = true;
    const nav = performance.getEntriesByType("navigation")[0]?.type || null;
    const cross = window.__geocalculoCrossAccessInfo || leerCrossAccess();
    registrarEventoGeocalculo({
      tipoEvento: "index_load",
      origen: cross.isCross ? "cross" : "direct",
      estado: "ok",
      metadata: cross.isCross
        ? { access_type: "cross", sitio_origen: cross.from, sitio_destino: cross.to, navigation_type: nav }
        : { access_type: "direct", navigation_type: nav }
    });
  }

  function destinoDesdeHref(href) {
    try { const path = new URL(href, window.location.href).pathname.toLowerCase(); return SITES.find((site) => path.includes(`/${site}/`)) || null; } catch (_) { return null; }
  }

  function prepararCrossAccessUrl(href, destino) {
    const state = obtenerEstadoMapa();
    const url = new URL(href, window.location.href);
    url.searchParams.set("access", "cross");
    url.searchParams.set("from", obtenerSitioActual());
    url.searchParams.set("journey_id", obtenerJourneyId());
    if (state.latitud !== null) url.searchParams.set("lat", Number(state.latitud).toFixed(6));
    if (state.longitud !== null) url.searchParams.set("lon", Number(state.longitud).toFixed(6));
    if (state.zoom !== null) url.searchParams.set("zoom", String(state.zoom));
    url.searchParams.set("basemap", String(state.basemap).toLowerCase());
    return url.toString();
  }

  function geolocationStatus(error) {
    if (!error) return "success";
    if (error.code === 1) return "denied";
    if (error.code === 2) return "unavailable";
    if (error.code === 3) return "timeout";
    return "error";
  }

  function installGeolocationWrapper() {
    const geo = navigator.geolocation;
    if (!geo || geo.__geocalculoWrapped || typeof geo.getCurrentPosition !== "function") return;
    const original = geo.getCurrentPosition.bind(geo);
    geo.getCurrentPosition = function (success, error, options) {
      return original((position) => {
        if (window.__geocalculoUserLocationClickPending) {
          window.__geocalculoUserLocationClickPending = false;
          registrarEventoGeocalculo({ tipoEvento: "geolocation", origen: "gps", estado: "success", latitud: position.coords.latitude, longitud: position.coords.longitude, metadata: { accion: "result", metodo: "gps" } });
        }
        if (typeof success === "function") success(position);
      }, (err) => {
        if (window.__geocalculoUserLocationClickPending) {
          registrarEventoGeocalculo({ tipoEvento: "geolocation", origen: "gps", estado: geolocationStatus(err), metadata: { accion: "result", metodo: "gps" } });
        }
        if (typeof error === "function") error(err);
      }, options);
    };
    geo.__geocalculoWrapped = true;
  }

  function installIpLocationFetchWrapper() {
    if (window.__geocalculoFetchWrapped || typeof window.fetch !== "function") return;
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      const requestUrl = typeof input === "string" ? input : input?.url;
      const isIpLookup = /ipapi\.co\/json/i.test(String(requestUrl || ""));
      return originalFetch(input, init).then((response) => {
        if (isIpLookup && window.__geocalculoUserLocationClickPending && response?.ok) {
          response.clone().json().then((data) => {
            const lat = Number(data.latitude);
            const lon = Number(data.longitude);
            if (Number.isFinite(lat) && Number.isFinite(lon)) {
              window.__geocalculoUserLocationClickPending = false;
              registrarEventoGeocalculo({ tipoEvento: "geolocation", origen: "ip", estado: "success", latitud: lat, longitud: lon, metadata: { accion: "result", metodo: "ip" } });
            }
          }).catch(() => {});
        }
        return response;
      }).catch((error) => {
        if (isIpLookup && window.__geocalculoUserLocationClickPending) {
          window.__geocalculoUserLocationClickPending = false;
          registrarEventoGeocalculo({ tipoEvento: "geolocation", origen: "ip", estado: "unavailable", metadata: { accion: "result", metodo: "ip" } });
        }
        throw error;
      });
    };
    window.__geocalculoFetchWrapped = true;
  }

  function installGenericListeners() {
    if (window.__geocalculoTelemetryListeners) return;
    window.__geocalculoTelemetryListeners = true;
    document.addEventListener("click", (event) => {
      const site = obtenerSitioActual();
      const anchor = event.target.closest("a[data-geox-target], footer a[href*='geo']");
      if (anchor) {
        const destino = destinoDesdeHref(anchor.getAttribute("data-geox-target") || anchor.href);
        if (destino && destino !== site) {
          registrarEventoGeocalculo({ tipoEvento: "cross_access", origen: "cross_panel", estado: "ok", metadata: { accion: "click", sitio_origen: site, sitio_destino: destino } });
          anchor.href = prepararCrossAccessUrl(anchor.getAttribute("data-geox-target") || anchor.href, destino);
        }
      }
      if (event.target.closest("#btn-my-location, #my-location-btn, #locate-btn, .my-location-btn, .locate-btn, [data-action='my-location']")) {
        window.__geocalculoUserLocationClickPending = true;
        registrarEventoGeocalculo({ tipoEvento: "geolocation", origen: "mi_ubicacion", estado: "ok", metadata: { accion: "click" } });
      }
      const basemapButton = event.target.closest("#btn-osm, #btn-sat, [data-map]");
      if (basemapButton) {
        const nuevo = String(basemapButton.dataset.map || basemapButton.id?.replace("btn-", "") || "").toLowerCase() === "sat" ? "SAT" : "OSM";
        const anterior = normalizarBasemap(window.currentBasemap);
        if (nuevo !== anterior) {
          registrarEventoGeocalculo({ tipoEvento: "basemap_change", origen: "basemap_toggle", estado: "ok", basemap: nuevo, metadata: { accion: "change", anterior, nuevo } });
        }
      }
      const searchResult = event.target.closest(".search-result-item");
      if (searchResult) {
        registrarEventoGeocalculo({ tipoEvento: "search_result", origen: "buscador", estado: "ok", metadata: { accion: "select", nombre: searchResult.textContent?.trim() || null, tipo: searchResult.dataset.type || null, region: searchResult.dataset.region || null, comuna: searchResult.dataset.comuna || null } });
      }
      const downloadButton = event.target.closest(".download-button, [data-pdf-button='true']");
      if (downloadButton) {
        const label = downloadButton.textContent || "";
        const tipo = /KML/i.test(label) ? "descarga_kml" : /PDF/i.test(label) ? "descarga_pdf" : null;
        if (tipo && !(tipo === "descarga_kml" && downloadButton.dataset.geocalculoArchivo === "r2")) registrarEventoGeocalculo({ tipoEvento: tipo, origen: "geoquery", estado: "ok", metadata: { accion: "download" } });
      }
    }, true);
    document.addEventListener("change", (event) => {
      const el = event.target;
      if (el?.id === "region-selector" && el.dataset.telemetryReady === "1" && el.value !== el.dataset.telemetryPrevious) {
        registrarEventoGeocalculo({ tipoEvento: "region_change", origen: "selector_region", estado: "ok", metadata: { accion: "change", region_anterior: el.dataset.telemetryPrevious || null, region_nueva: el.value || null } });
        el.dataset.telemetryPrevious = el.value;
      }
      if (el?.id === "region-selector" && el.dataset.telemetryReady !== "1") { el.dataset.telemetryReady = "1"; el.dataset.telemetryPrevious = el.value || ""; }
      if (el?.matches?.("[data-nemo-label-toggle], #toggle-relaves, #toggle-zonas, .panel-layer-toggle input")) {
        registrarEventoGeocalculo({ tipoEvento: "labels_toggle", origen: "labels_control", estado: el.checked ? "on" : "off", metadata: { accion: "toggle", elemento: el.dataset.nemoLabelToggle || el.id || "layer", visible: Boolean(el.checked) } });
      }
    }, true);
  }

  function registrarGeoqueryOpenUnaVez() {
    if (window.__geocalculoGeoqueryOpenRegistrado || !/geoquery\.html$/i.test(window.location.pathname)) return;
    const p = new URLSearchParams(window.location.search);
    const lat = Number(p.get("lat") || p.get("queryLat"));
    const lon = Number(p.get("lon") || p.get("queryLon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    window.__geocalculoGeoqueryOpenRegistrado = true;
    registrarEventoGeocalculo({ tipoEvento: "geoquery_open", origen: "geoquery", estado: "ok", latitud: lat, longitud: lon, zoom: Number(p.get("zoom") || p.get("mapZoom")), basemap: p.get("basemap"), metadata: { accion: "load", sitio_origen: p.get("site") || obtenerSitioActual() } });
  }

  window.GeocalculoTelemetry = { obtenerSitioActual, obtenerSessionId, obtenerJourneyId, registrarEventoGeocalculo, obtenerEstadoMapa, registrarIndexLoadUnaVez, leerCrossAccess, registrarGeoqueryOpenUnaVez };
  window.obtenerSitioActual = obtenerSitioActual;
  window.obtenerSessionId = obtenerSessionId;
  window.obtenerJourneyId = obtenerJourneyId;
  window.registrarEventoGeocalculo = registrarEventoGeocalculo;

  window.__geocalculoCrossAccessInfo = leerCrossAccess();
  installGeolocationWrapper();
  installIpLocationFetchWrapper();
  installGenericListeners();
  document.addEventListener("DOMContentLoaded", () => {
    const selector = document.getElementById("region-selector");
    if (selector) { selector.dataset.telemetryReady = "1"; selector.dataset.telemetryPrevious = selector.value || ""; }
    registrarGeoqueryOpenUnaVez();
    setTimeout(registrarIndexLoadUnaVez, 1200);
  });
})();
