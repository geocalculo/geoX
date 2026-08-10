(function (global) {
  "use strict";

  const DATA_PATH = "capas_summary/masas_geosummary.geojson";
  let points = [];

  function prepareFeatures(features) {
    return (Array.isArray(features) ? features : []).flatMap((feature) => {
      const coordinates = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null;
      const lon = Number(coordinates?.[0]);
      const lat = Number(coordinates?.[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
      const areaSquareMetres = Number(feature.properties?.st_area_sh);
      const rawType = feature.properties?.Tipo;
      return [{lat, lon, areaSquareMetres: Number.isFinite(areaSquareMetres) ? areaSquareMetres : 0, type: rawType == null || String(rawType).trim() === "" ? null : String(rawType).trim()}];
    });
  }

  function summarize(viewPoints) {
    const counts = new Map();
    let areaSquareMetres = 0;
    let unclassified = 0;
    viewPoints.forEach((point) => {
      areaSquareMetres += point.areaSquareMetres;
      if (point.type) counts.set(point.type, (counts.get(point.type) || 0) + 1);
      else unclassified += 1;
    });
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
    const dominant = ranked[0] || (unclassified ? ["Sin clasificación", unclassified] : [null, 0]);
    return {visible: viewPoints.length, areaHectares: areaSquareMetres / 10000, dominantType: dominant[0], dominantCount: dominant[1], typesPresent: counts.size};
  }

  function visibleWithin(bounds) {
    return points.filter((point) => bounds.contains([point.lat, point.lon]));
  }

  function formatNumber(value, maximumFractionDigits = 0) {
    return new Intl.NumberFormat("es-CL", {maximumFractionDigits}).format(value);
  }

  function render(summary) {
    document.getElementById("kpi-visible").textContent = formatNumber(summary.visible);
    document.getElementById("kpi-area").textContent = `${formatNumber(summary.areaHectares, summary.areaHectares < 100 ? 1 : 0)} ha`;
    document.getElementById("kpi-dominant").textContent = summary.dominantType || "Sin datos";
    document.getElementById("kpi-types").textContent = formatNumber(summary.typesPresent);
    const percentage = summary.visible ? Math.round(summary.dominantCount * 100 / summary.visible) : 0;
    document.getElementById("kpi-dominant-detail").textContent = summary.dominantType ? `${formatNumber(summary.dominantCount)} · ${percentage} %` : "";
  }

  function update(map) {
    const summary = summarize(visibleWithin(map.getBounds()));
    render(summary);
    global.dispatchEvent(new CustomEvent("geoma:summary-updated", {detail: summary}));
    return summary;
  }

  async function init(map) {
    const status = document.getElementById("summary-status");
    try {
      const response = await fetch(DATA_PATH, {cache: "no-store"});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const geojson = await response.json();
      points = prepareFeatures(geojson.features);
      status.textContent = `${formatNumber(points.length)} masas cargadas`;
      update(map);
      map.on("moveend", () => update(map));
      console.info(`GeoMA geosummary cargado: ${points.length} puntos; st_area_sh interpretado como m².`);
    } catch (error) {
      status.textContent = "No fue posible cargar el resumen";
      status.classList.add("error");
      render(summarize([]));
      console.error("GeoMA: error al cargar el geosummary", error);
    }
  }

  global.GeoMASummary = {init, prepareFeatures, summarize};
})(window);
