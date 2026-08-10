(function () {
  "use strict";
  const CHILE_BOUNDS = [[-56.1, -76.5], [-17.4, -66.2]];
  const map = L.map("map", {zoomControl: true, minZoom: 3}).fitBounds(CHILE_BOUNDS);
  const layers = {
    osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"}),
    sat: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {maxZoom: 19, attribution: "Tiles &copy; Esri"})
  };
  let activeLayer = layers.osm.addTo(map);

  function selectBasemap(name) {
    if (layers[name] === activeLayer) return;
    map.removeLayer(activeLayer);
    activeLayer = layers[name].addTo(map);
    ["osm", "sat"].forEach((id) => {
      const button = document.getElementById(`btn-${id}`);
      const selected = id === name;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }
  document.getElementById("btn-osm").addEventListener("click", () => selectBasemap("osm"));
  document.getElementById("btn-sat").addEventListener("click", () => selectBasemap("sat"));

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
    } catch (error) {
      selector.disabled = true;
      console.warn("GeoMA: selector regional no disponible", error);
    }
  }
  initRegionSelector();
  GeoMASummary.init(map);
  window.geomaMap = map;
})();
