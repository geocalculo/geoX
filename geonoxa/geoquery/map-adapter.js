(function (root, factory) {
  const api = factory(root.L);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GeoNoxaMapAdapter = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (L) {
  "use strict";

  if (!L) throw new Error("GeoNoxaMapAdapter requiere Leaflet.");

  const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

  function formatDistance(km) {
    return !Number.isFinite(km)
      ? "—"
      : km < 1
        ? `${fmt.format(km * 1000)} m`
        : `${fmt.format(km)} km`;
  }

  function setupMobileMapGesture(map, mapEl) {
    if (!mapEl) return;
    const isTouchDevice = root.matchMedia?.("(pointer: coarse)")?.matches || root.navigator?.maxTouchPoints > 0;
    if (!isTouchDevice) return;

    map.dragging.disable();
    const hint = document.createElement("div");
    hint.className = "map-touch-hint";
    hint.textContent = "Usa dos dedos para mover el mapa";
    mapEl.appendChild(hint);

    let hintTimer = null;
    function showHint() {
      clearTimeout(hintTimer);
      hint.classList.add("visible");
      hintTimer = setTimeout(() => hint.classList.remove("visible"), 1400);
    }

    mapEl.addEventListener("touchstart", (event) => {
      if (event.touches.length >= 2) {
        map.dragging.enable();
        hint.classList.remove("visible");
      } else {
        map.dragging.disable();
        showHint();
      }
    }, { passive: true });

    mapEl.addEventListener("touchmove", (event) => {
      if (event.touches.length >= 2) map.dragging.enable();
      else map.dragging.disable();
    }, { passive: true });

    mapEl.addEventListener("touchend", (event) => {
      if (event.touches.length < 2) map.dragging.disable();
    }, { passive: true });

    mapEl.addEventListener("touchcancel", () => map.dragging.disable(), { passive: true });
  }

  function create({ elementId = "geoquery-map", lat, lon, zoom = 14, basemap = "osm", onBasemapChange } = {}) {
    const map = L.map(elementId, { tap: true, scrollWheelZoom: true });
    const mapEl = document.getElementById(elementId);

    const osm = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
      crossOrigin: true
    });
    const sat = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 20,
      attribution: "Tiles &copy; Esri",
      crossOrigin: true
    });

    let currentBasemap = basemap === "sat" ? "sat" : "osm";

    function setBasemapButtonActive(type) {
      document.getElementById("geoquery-osm-btn")?.classList.toggle("active", type === "osm");
      document.getElementById("geoquery-sat-btn")?.classList.toggle("active", type === "sat");
    }

    function setBasemap(type) {
      if (map.hasLayer(osm)) map.removeLayer(osm);
      if (map.hasLayer(sat)) map.removeLayer(sat);
      currentBasemap = type === "sat" ? "sat" : "osm";
      (currentBasemap === "sat" ? sat : osm).addTo(map);
      setBasemapButtonActive(currentBasemap);
      onBasemapChange?.(currentBasemap);
      return currentBasemap;
    }

    const toggle = L.DomUtil.create("div", "map-toggle");
    toggle.innerHTML = '<button id="geoquery-osm-btn" class="map-toggle-btn" type="button" data-map="osm">OSM</button><button id="geoquery-sat-btn" class="map-toggle-btn" type="button" data-map="sat">SAT</button>';
    mapEl?.appendChild(toggle);
    L.DomEvent.disableClickPropagation(toggle);
    L.DomEvent.disableScrollPropagation(toggle);
    toggle.querySelector('[data-map="osm"]')?.addEventListener("click", () => setBasemap("osm"));
    toggle.querySelector('[data-map="sat"]')?.addEventListener("click", () => setBasemap("sat"));

    setBasemap(currentBasemap);
    map.setView([lat, lon], zoom);

    const layers = { results: L.featureGroup().addTo(map) };

    L.circleMarker([lat, lon], {
      radius: 7,
      weight: 3,
      color: "#111827",
      fillColor: "#facc15",
      fillOpacity: .95
    }).bindPopup("Punto consultado").addTo(map);

    L.control.scale({ metric: true, imperial: false }).addTo(map);
    setupMobileMapGesture(map, mapEl);

    function drawGroup(group) {
      const cfg = group?.cfg || {};
      const res = group?.result || {};
      if (res.status !== "resolved") return;

      const style = cfg.estilo || {};

      if (cfg.id === "relaves") {
        const rels = (res.selectedRelaves || res.items || []).slice(0, 10);
        rels.forEach((relave, index) => {
          const nearest = index === 0;
          L.circleMarker([relave.coordinates[1], relave.coordinates[0]], {
            radius: nearest ? 9 : 6,
            color: nearest ? "#a16207" : style.color || "#ea580c",
            fillColor: nearest ? "#facc15" : style.fillColor || "#f97316",
            fillOpacity: .85,
            weight: 2
          })
            .bindPopup(`${relave.siteName || "Relave"}<br>${formatDistance(relave.distanceKm)}`)
            .addTo(layers.results);
        });

        if (Number.isFinite(res.clusterRadiusKm ?? res.radiusKm) && rels[0]) {
          L.circle([lat, lon], {
            radius: (res.clusterRadiusKm ?? res.radiusKm) * 1000,
            color: style.color || "#ea580c",
            dashArray: "4 8",
            fillColor: style.fillColor || "#f97316",
            fillOpacity: .12,
            weight: 2
          }).addTo(layers.results);
        }

        if (rels[0]) {
          L.polyline([[lat, lon], [rels[0].coordinates[1], rels[0].coordinates[0]]], {
            color: "#38bdf8",
            dashArray: "4 6",
            weight: 3
          }).addTo(layers.results);
        }
        return;
      }

      if (res.items?.[0]) {
        L.geoJSON(res.items[0].feature, {
          style: {
            color: style.color || "#7c2d12",
            fillColor: style.fillColor || "#fb923c",
            fillOpacity: style.fillOpacity ?? .25,
            weight: style.weight || 2
          }
        }).addTo(layers.results);

        if (res.nearestPoint) {
          const coords = res.nearestPoint.geometry.coordinates;
          L.polyline([[lat, lon], [coords[1], coords[0]]], {
            color: "#7c2d12",
            dashArray: "4 6"
          }).addTo(layers.results);
        }
      }
    }

    function fitResults() {
      if (!layers.results.getLayers().length) return false;
      const bounds = layers.results.getBounds();
      if (!bounds.isValid()) return false;
      map.fitBounds(bounds.pad(0.2), { maxZoom: 14 });
      return true;
    }

    function invalidateSoon(delay = 150) {
      setTimeout(() => map.invalidateSize(), delay);
    }

    return Object.freeze({
      map,
      mapEl,
      layers,
      drawGroup,
      fitResults,
      invalidateSoon,
      getBasemap: () => currentBasemap,
      setBasemap
    });
  }

  return Object.freeze({
    create,
    setupMobileMapGesture
  });
});
