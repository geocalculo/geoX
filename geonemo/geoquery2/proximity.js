/* Reglas territoriales compartidas por todas las salidas de GeoQuery 2.0. */
(function exposeRelativeProximity(globalScope) {
  function classifyRelativeProximity(ratio) {
    if (!Number.isFinite(ratio) || ratio < 0) return { key: "unknown", label: "Sin información" };
    if (ratio <= 0.125) return { key: "very-high", label: "Muy alta" };
    if (ratio <= 0.5) return { key: "high", label: "Alta" };
    if (ratio <= 1) return { key: "medium", label: "Media" };
    if (ratio <= 2) return { key: "low", label: "Baja" };
    return { key: "very-low", label: "Muy baja" };
  }

  function getVisualRatioPosition(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return 0;
    const cappedRatio = Math.min(ratio, 2.5);
    return (cappedRatio / 2.5) * 100;
  }

  function getDominantResult(results) {
    return results
      .filter((result) => Number.isFinite(result.relacionDiametros))
      .reduce((closest, current) => {
        if (!closest) return current;
        return current.relacionDiametros < closest.relacionDiametros ? current : closest;
      }, null);
  }

  const api = { classifyRelativeProximity, getVisualRatioPosition, getDominantResult };
  Object.assign(globalScope, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
