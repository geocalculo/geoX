(function () {
  "use strict";
  const SITE_ID = "geoma";
  const CHILE_BOUNDS = [[-56.1, -76.5], [-17.4, -66.2]];
  const DEFAULT_REGION_ID = "LA";
  const DEFAULT_REGION_ZOOM = 7; // Escala de referencia cercana a 1:500.000.
  const map = L.map("map", {zoomControl: true, minZoom: 3}).fitBounds(CHILE_BOUNDS);
  const layers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"}),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom: 19, attribution: "Tiles &copy; Esri"})
  };
  let activeLayer = layers.osm.addTo(map);
  let activeBasemap = "osm";

  function normalizeBasemap(value) {
    return String(value || "").toLowerCase() === "sat" ? "sat" : "osm";
  }

  const geoQueryContext = window.GeoXGeoQueryContext.create({
    site: SITE_ID,
    normalizeBasemap
  });

  function selectBasemap(name) {
    if (!layers[name]) name = "osm";
    if (layers[name] !== activeLayer) {
      map.removeLayer(activeLayer);
      activeLayer = layers[name].addTo(map);
    }
    activeBasemap = name;
    ["osm", "sat"].forEach((id) => {
      const button = document.getElementById(`btn-${id}`);
      const selected = id === name;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  document.getElementById("btn-osm").addEventListener("click", () => selectBasemap("osm"));
  document.getElementById("btn-sat").addEventListener("click", () => selectBasemap("sat"));
  L.control.scale({position: "bottomleft", imperial: false}).addTo(map);

  document.getElementById("btn-my-location").addEventListener("click", () => {
    map.locate({setView: true, maxZoom: 15, enableHighAccuracy: true});
  });
  map.on("locationerror", () => console.warn("GeoMA: no fue posible obtener la ubicación."));

  document.getElementById("btn-clear").addEventListener("click", () => {
    document.getElementById("region-selector").value = "";
    map.fitBounds(CHILE_BOUNDS);
  });

  function isCrossAccessNavigationFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get("from") === "crossaccess" || params.get("crossAccess") === "1";
  }

  function openGeoQuery(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

    const navigationFrom = isCrossAccessNavigationFromUrl() ? "crossaccess" : "index";
    const originState = geoQueryContext.capture({
      site: SITE_ID,
      map,
      queryLat: lat,
      queryLon: lon,
      basemap: activeBasemap,
      from: navigationFrom
    });
    if (!originState) return;

    geoQueryContext.persist(originState);

    const url = new URL("./geoquery/geoquery.html", window.location.href);
    url.searchParams.set("site", SITE_ID);
    url.searchParams.set("lat", lat.toFixed(7));
    url.searchParams.set("lon", lon.toFixed(7));
    url.searchParams.set("from", originState.navigation.crossAccess ? "crossaccess" : "index");

    window.location.href = geoQueryContext.appendToGeoQueryUrl(url.href, originState);
  }

  map.on("click", (event) => {
    openGeoQuery(event.latlng.lat, event.latlng.lng);
  });

  function restoreGeoQueryViewport() {
    const params = new URLSearchParams(window.location.search);
    const isGeoQueryReturn =
      params.get("from") === "geoquery" ||
      params.get("restoreViewport") === "1";
    if (!isGeoQueryReturn) return false;

    const state = geoQueryContext.resolve(SITE_ID);
    if (!state) return false;

    const restored = geoQueryContext.restore(map, state, {
      site: SITE_ID,
      applyBasemap: selectBasemap
    });
    if (restored) console.info("GeoMA: contexto GeoQuery restaurado.");
    return restored;
  }

  function installGeoQueryRestoreHandlers() {
    geoQueryContext.installRestoreHandlers({
      site: SITE_ID,
      getMap: () => map,
      restore: (mapInstance, state) => geoQueryContext.restore(mapInstance, state, {
        site: SITE_ID,
        applyBasemap: selectBasemap
      })
    });
  }

  function applyCrossAccess() {
    const viewport = window.GeoXViewport?.readCrossAccessViewport(new URLSearchParams(window.location.search));
    if (!viewport?.isValid) return false;
    selectBasemap(viewport.basemap);
    map.setView([viewport.centerLat, viewport.centerLon], viewport.zoom, {animate: false});
    console.info("GeoMA: viewport Cross Access aplicado.");
    return true;
  }

  function updateCrossAccessLinks() {
    document.querySelectorAll("[data-geox-target]").forEach((link) => {
      link.addEventListener("click", () => {
        const center = map.getCenter();
        const url = new URL(link.getAttribute("data-geox-target"), window.location.href);
        url.searchParams.set("from", "crossaccess");
        url.searchParams.set("lat", center.lat.toFixed(6));
        url.searchParams.set("lon", center.lng.toFixed(6));
        url.searchParams.set("zoom", String(map.getZoom()));
        url.searchParams.set("basemap", activeBasemap);
        link.href = url.href;
      });
    });
  }

  async function initRegionSelector() {
    const selector = document.getElementById("region-selector");
    try {
      const response = await fetch("capas_selector/regiones.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const regions = (await response.json()).filter((region) => region.activo !== false && Array.isArray(region.bbox));
      regions.forEach((region, index) => selector.add(new Option(region.nombre, String(index))));
      selector.addEventListener("change", () => {
        if (selector.value === "") map.fitBounds(CHILE_BOUNDS);
        else map.fitBounds(regions[Number(selector.value)].bbox);
      });
      if (!hasExternalViewport) {
        const defaultRegionIndex = regions.findIndex((region) => region.id === DEFAULT_REGION_ID);
        if (defaultRegionIndex >= 0) {
          selector.value = String(defaultRegionIndex);
          map.setView(regions[defaultRegionIndex].centro, DEFAULT_REGION_ZOOM, {animate: false});
        }
      }
    } catch (error) {
      selector.disabled = true;
      console.warn("GeoMA: selector regional no disponible", error);
    }
  }

  installGeoQueryRestoreHandlers();
  const hasGeoQueryViewport = restoreGeoQueryViewport();
  const hasCrossAccessViewport = hasGeoQueryViewport ? false : applyCrossAccess();
  const hasExternalViewport = hasGeoQueryViewport || hasCrossAccessViewport;

  updateCrossAccessLinks();
  initRegionSelector();
  GeoMASummary.init(map);
  GeoMAPanel.init(map);
  GeoMASearch.init(map);
  window.geomaMap = map;
})();
