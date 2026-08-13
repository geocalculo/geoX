(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get("lat") ?? params.get("queryLat"));
  const lon = Number(params.get("lon") ?? params.get("queryLon"));
  const requestedZoom = Number(params.get("zoom"));
  const basemap = String(params.get("basemap") || "osm").toLowerCase() === "sat" ? "sat" : "osm";

  const validPoint = Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  const fallback = [-41.47, -72.94];
  const center = validPoint ? [lat, lon] : fallback;
  const zoom = Number.isFinite(requestedZoom) ? Math.max(3, Math.min(16, requestedZoom)) : 12;

  document.getElementById("latitude").textContent = validPoint ? lat.toFixed(6) : "No disponible";
  document.getElementById("longitude").textContent = validPoint ? lon.toFixed(6) : "No disponible";

  const map = L.map("query-map", { zoomControl: true, minZoom: 3 }).setView(center, validPoint ? zoom : 7);
  const layers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles &copy; Esri" })
  };
  layers[basemap].addTo(map);
  L.control.scale({ position: "bottomleft", imperial: false }).addTo(map);

  if (validPoint) {
    L.circleMarker([lat, lon], {
      radius: 8,
      color: "#102a43",
      weight: 3,
      fillColor: "#38bdf8",
      fillOpacity: 1
    }).addTo(map).bindPopup(`<strong>Punto consultado</strong><br>${lat.toFixed(6)}, ${lon.toFixed(6)}`).openPopup();
  }

  const backLink = document.getElementById("back-link");
  backLink.addEventListener("click", (event) => {
    if (window.history.length > 1 && document.referrer) {
      event.preventDefault();
      window.history.back();
    }
  });
})();
