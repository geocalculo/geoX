/* Reglas territoriales compartidas por todas las salidas de GeoQuery 2.0. */
(function exposeTerritorialExposure(globalScope) {
  function classifyTerritorialExposure(ratio) {
    if (!Number.isFinite(ratio) || ratio < 0) return { key: "unknown", label: "Sin información" };
    if (ratio <= 0.125) return { key: "very-high", label: "Muy alta" };
    if (ratio <= 0.5) return { key: "high", label: "Alta" };
    if (ratio < 1) return { key: "medium-high", label: "Media alta" };
    if (ratio <= 2) return { key: "medium-low", label: "Media baja" };
    if (ratio <= 8) return { key: "low", label: "Baja" };
    return { key: "very-low", label: "Muy baja" };
  }

  function getExposureVisualPosition(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return 0;
    const minRatio = 0.0625;
    const maxRatio = 16;
    const normalized = (Math.log2(ratio) - Math.log2(minRatio)) /
      (Math.log2(maxRatio) - Math.log2(minRatio));
    return Math.max(0, Math.min(100, normalized * 100));
  }

  function getDominantResult(results) {
    return results
      .filter((result) => Number.isFinite(result.relacionDiametros) && result.relacionDiametros >= 0)
      .reduce((closest, current) => {
        if (!closest) return current;
        return current.relacionDiametros < closest.relacionDiametros ? current : closest;
      }, null);
  }

  const api = { classifyTerritorialExposure, getExposureVisualPosition, getDominantResult };
  Object.assign(globalScope, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
