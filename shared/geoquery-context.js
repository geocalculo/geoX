(function (global) {
  "use strict";

  const DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

  function toFiniteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function validLat(value) {
    return Number.isFinite(value) && value >= -90 && value <= 90;
  }

  function validLon(value) {
    return Number.isFinite(value) && value >= -180 && value <= 180;
  }

  function validZoom(value) {
    return Number.isFinite(value) && value >= 0 && value <= 22;
  }

  function defaultNormalizeBasemap(value) {
    return String(value || "").toLowerCase() === "sat" ? "sat" : "osm";
  }

  function create(options = {}) {
    const site = String(options.site || "").trim().toLowerCase();
    if (!site) throw new Error("GeoXGeoQueryContext: site es obligatorio.");

    const normalizeBasemap =
      typeof options.normalizeBasemap === "function"
        ? options.normalizeBasemap
        : defaultNormalizeBasemap;
    const maxAgeMs = Number.isFinite(Number(options.maxAgeMs))
      ? Number(options.maxAgeMs)
      : DEFAULT_MAX_AGE_MS;
    const locationApi = options.location || global.location;
    const historyApi = options.history || global.history;
    const storageApi = options.storage || global.sessionStorage;

    function getStorageKey(targetSite = site) {
      return `geox:${targetSite}:geoquery-origin`;
    }

    function normalizeState(raw, targetSite = site) {
      if (!raw || raw.site !== targetSite) return null;

      const centerLat = toFiniteNumber(raw.map?.centerLat);
      const centerLon = toFiniteNumber(raw.map?.centerLon);
      const zoom = toFiniteNumber(raw.map?.zoom);
      const queryLat = toFiniteNumber(raw.queryPoint?.lat);
      const queryLon = toFiniteNumber(raw.queryPoint?.lon);
      const west = toFiniteNumber(raw.map?.bounds?.west);
      const south = toFiniteNumber(raw.map?.bounds?.south);
      const east = toFiniteNumber(raw.map?.bounds?.east);
      const north = toFiniteNumber(raw.map?.bounds?.north);
      const savedAt = toFiniteNumber(raw.savedAt) || Date.now();

      if (!validLat(centerLat) || !validLon(centerLon) || !validZoom(zoom)) return null;
      if (!validLat(queryLat) || !validLon(queryLon)) return null;
      if (
        !validLon(west) ||
        !validLon(east) ||
        !validLat(south) ||
        !validLat(north) ||
        !(west < east) ||
        !(south < north)
      ) return null;
      if (Date.now() - savedAt > maxAgeMs) return null;

      return {
        version: 1,
        site: targetSite,
        source: "geoquery",
        savedAt,
        queryPoint: { lat: queryLat, lon: queryLon },
        map: {
          centerLat,
          centerLon,
          zoom,
          basemap: normalizeBasemap(raw.map?.basemap),
          bounds: { west, south, east, north }
        },
        navigation: {
          from: raw.navigation?.from || "index",
          crossAccess:
            raw.navigation?.crossAccess === true ||
            raw.navigation?.from === "crossaccess"
        }
      };
    }

    function readFromUrl(targetSite = site) {
      const params = new URLSearchParams(locationApi?.search || "");
      const finiteParam = (name) => toFiniteNumber(params.get(name));
      const centerLat = finiteParam("mapCenterLat") ?? finiteParam("viewLat");
      const centerLon = finiteParam("mapCenterLon") ?? finiteParam("viewLon");
      const zoom = finiteParam("mapZoom") ?? finiteParam("zoom");
      const queryLat = finiteParam("queryLat") ?? finiteParam("lat");
      const queryLon = finiteParam("queryLon") ?? finiteParam("lon");
      const west = finiteParam("viewWest");
      const south = finiteParam("viewSouth");
      const east = finiteParam("viewEast");
      const north = finiteParam("viewNorth");

      return normalizeState({
        version: 1,
        site: targetSite,
        source: "geoquery",
        savedAt: Date.now(),
        queryPoint: { lat: queryLat, lon: queryLon },
        map: {
          centerLat,
          centerLon,
          zoom,
          basemap: params.get("basemap"),
          bounds: { west, south, east, north }
        },
        navigation: {
          from: params.get("from") || "index",
          crossAccess:
            params.get("from") === "crossaccess" ||
            params.get("source") === "crossaccess"
        }
      }, targetSite);
    }

    function readFromHistory(targetSite = site) {
      return normalizeState(historyApi?.state?.geoQueryOrigin, targetSite);
    }

    function readFromSessionStorage(targetSite = site) {
      try {
        const stored = storageApi?.getItem(getStorageKey(targetSite));
        return normalizeState(JSON.parse(stored || "null"), targetSite);
      } catch (_) {
        return null;
      }
    }

    function resolve(targetSite = site) {
      return (
        readFromUrl(targetSite) ||
        readFromHistory(targetSite) ||
        readFromSessionStorage(targetSite) ||
        null
      );
    }

    function capture({ site: targetSite = site, map, queryLat, queryLon, basemap, from }) {
      if (!map || typeof map.getCenter !== "function" || typeof map.getBounds !== "function") {
        return null;
      }
      const center = map.getCenter();
      const bounds = map.getBounds();

      return normalizeState({
        version: 1,
        site: targetSite,
        source: "geoquery",
        savedAt: Date.now(),
        queryPoint: { lat: Number(queryLat), lon: Number(queryLon) },
        map: {
          centerLat: center.lat,
          centerLon: center.lng,
          zoom: map.getZoom(),
          basemap,
          bounds: {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth()
          }
        },
        navigation: {
          from: from || "index",
          crossAccess: from === "crossaccess"
        }
      }, targetSite);
    }

    function setOriginParams(params, originState, includeViewAliases) {
      if (includeViewAliases) {
        params.set("viewLat", originState.map.centerLat);
        params.set("viewLon", originState.map.centerLon);
      }
      params.set("mapCenterLat", originState.map.centerLat);
      params.set("mapCenterLon", originState.map.centerLon);
      params.set("mapZoom", originState.map.zoom);
      params.set("basemap", originState.map.basemap);
      params.set("queryLat", originState.queryPoint.lat);
      params.set("queryLon", originState.queryPoint.lon);
      params.set("viewWest", originState.map.bounds.west);
      params.set("viewSouth", originState.map.bounds.south);
      params.set("viewEast", originState.map.bounds.east);
      params.set("viewNorth", originState.map.bounds.north);
    }

    function persist(originState) {
      if (!originState) return null;
      const state = normalizeState(originState, originState.site || site);
      if (!state) return null;

      try {
        storageApi?.setItem(getStorageKey(state.site), JSON.stringify(state));
      } catch (_) {}

      if (locationApi?.href && historyApi?.replaceState) {
        const currentUrl = new URL(locationApi.href);
        setOriginParams(currentUrl.searchParams, state, false);
        currentUrl.searchParams.set("restoreViewport", "1");
        currentUrl.searchParams.set(
          "from",
          state.navigation.crossAccess ? "crossaccess" : "geoquery"
        );
        historyApi.replaceState(
          { ...(historyApi.state || {}), geoQueryOrigin: state },
          "",
          currentUrl
        );
      }
      return state;
    }

    function appendToGeoQueryUrl(url, originState) {
      const state = normalizeState(originState, originState?.site || site);
      if (!state) return url;

      const target = new URL(url, locationApi?.href || global.location.href);
      setOriginParams(target.searchParams, state, true);
      target.searchParams.set("zoom", state.map.zoom);

      return target.pathname.split("/").pop() === "geoquery.html"
        ? `./geoquery/geoquery.html?${target.searchParams.toString()}`
        : target.toString();
    }

    function restore(mapInstance, restoreState, callbacks = {}) {
      const targetSite = callbacks.site || site;
      const state = normalizeState(restoreState, targetSite);
      if (!mapInstance || !state) return false;

      callbacks.applyBasemap?.(state.map.basemap);
      mapInstance.setView(
        [state.map.centerLat, state.map.centerLon],
        state.map.zoom,
        { animate: false }
      );
      callbacks.applyQueryPoint?.(
        state.queryPoint.lat,
        state.queryPoint.lon,
        state
      );
      callbacks.onRestore?.(state);
      return true;
    }

    function installRestoreHandlers(options = {}) {
      if (typeof global.addEventListener !== "function") return;
      const getMap = options.getMap;
      const restoreCallback = options.restore;
      if (typeof getMap !== "function" || typeof restoreCallback !== "function") {
        throw new Error("GeoXGeoQueryContext: getMap y restore son obligatorios.");
      }

      global.addEventListener("pageshow", (event) => {
        if (!event.persisted) return;
        const mapInstance = getMap();
        const state = resolve(options.site || site);
        if (state && mapInstance) {
          restoreCallback(mapInstance, state);
          global.setTimeout?.(() => mapInstance.invalidateSize(false), 0);
        }
      });

      global.addEventListener("popstate", (event) => {
        const mapInstance = getMap();
        const targetSite = options.site || site;
        const state =
          normalizeState(event.state?.geoQueryOrigin, targetSite) ||
          resolve(targetSite);
        if (state && mapInstance) restoreCallback(mapInstance, state);
      });
    }

    return Object.freeze({
      site,
      getStorageKey,
      normalizeState,
      readFromUrl,
      readFromHistory,
      readFromSessionStorage,
      resolve,
      capture,
      persist,
      appendToGeoQueryUrl,
      restore,
      installRestoreHandlers
    });
  }

  global.GeoXGeoQueryContext = Object.freeze({
    create,
    defaultNormalizeBasemap
  });
})(window);
