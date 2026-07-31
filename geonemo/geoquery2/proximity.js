/* Reglas territoriales compartidas por todas las salidas de GeoQuery 2.0. */
(function exposeTerritorialExposure(globalScope) {
  function classifyTerritorialExposure(ratio) {
    if (!Number.isFinite(ratio) || ratio < 0) return { key: "unknown", label: "Sin información", rank: -1 };
    if (ratio <= 0.25) return { key: "very-high", label: "Muy alta", rank: 4 };
    if (ratio <= 1) return { key: "high", label: "Alta", rank: 3 };
    if (ratio <= 3) return { key: "medium", label: "Media", rank: 2 };
    if (ratio <= 8) return { key: "low", label: "Baja", rank: 1 };
    return { key: "very-low", label: "Muy baja", rank: 0 };
  }

  function classifyTerritorialAlert(result) {
    if (result?.posicion !== "interior") return classifyTerritorialExposure(result?.relacionDiametros);
    const depth = result.profundidadRelativa;
    if (!Number.isFinite(depth) || depth < 0) return { key: "unknown", label: "Sin información", rank: -1 };
    if (depth >= .8) return { key: "very-high", label: "Muy alta", rank: 4 };
    if (depth >= .6) return { key: "high", label: "Alta", rank: 3 };
    if (depth >= .4) return { key: "medium", label: "Media", rank: 2 };
    if (depth >= .2) return { key: "low", label: "Baja", rank: 1 };
    return { key: "very-low", label: "Muy baja", rank: 0 };
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
      .filter((result) => classifyTerritorialAlert(result).rank >= 0)
      .reduce((dominant, current) => {
        if (!dominant) return current;
        const difference = classifyTerritorialAlert(current).rank - classifyTerritorialAlert(dominant).rank;
        if (difference) return difference > 0 ? current : dominant;
        if (current.posicion === "interior" && dominant.posicion === "interior") return current.profundidadRelativa > dominant.profundidadRelativa ? current : dominant;
        return current.relacionDiametros < dominant.relacionDiametros ? current : dominant;
      }, null);
  }

  const api = { classifyTerritorialExposure, classifyTerritorialAlert, getExposureVisualPosition, getDominantResult };
  Object.assign(globalScope, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
