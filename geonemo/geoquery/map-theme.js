(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GeoQueryMapTheme = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SATELLITE_COLOR = "#F8FF3D";
  const DISTANCE_SATELLITE_COLOR = "#00FFFF";

  function normalizeTheme(theme) {
    return String(theme).toLowerCase() === "sat" ? "sat" : "osm";
  }

  function stylesFor(theme, institutionalColor) {
    const satellite = normalizeTheme(theme) === "sat";
    return {
      polygon: satellite
        ? { color: SATELLITE_COLOR, weight: 3, fillColor: SATELLITE_COLOR, fillOpacity: 0.20 }
        : { color: institutionalColor, weight: 3, fillColor: institutionalColor, fillOpacity: 0.18 },
      distance: satellite
        ? { color: DISTANCE_SATELLITE_COLOR, weight: 3, dashArray: "6 5" }
        : { color: institutionalColor, weight: 2, dashArray: "6 5" },
      poi: { radius: 7, color: "#fff", weight: 3, fillColor: "#dc443b", fillOpacity: 1 }
    };
  }

  function applyTheme(theme, themedMap) {
    const normalized = normalizeTheme(theme);
    const styles = stylesFor(normalized, themedMap.institutionalColor);
    themedMap.polygon.setStyle(styles.polygon);
    themedMap.distanceLine.setStyle(styles.distance);
    themedMap.poiMarker.setStyle(styles.poi);
    themedMap.map.getContainer().dataset.mapTheme = normalized;
    themedMap.legend.style.setProperty("--map-entity-color", styles.polygon.color);
    themedMap.legend.style.setProperty("--map-distance-color", styles.distance.color);
    return normalized;
  }

  return { applyTheme, normalizeTheme, stylesFor };
});
