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
    if (depth > .6) return { key: "very-high", label: "Muy alto", rank: 4 };
    if (depth > .3) return { key: "high", label: "Alto", rank: 3 };
    if (depth > .1) return { key: "medium", label: "Medio", rank: 2 };
    return { key: "low", label: "Bajo", rank: 1 };
  }

  function getExposureVisualPosition(ratio) {
    if (!Number.isFinite(ratio) || ratio <= 0) return 0;
    const minRatio = 0.0625;
    const maxRatio = 16;
    const normalized = (Math.log2(ratio) - Math.log2(minRatio)) /
      (Math.log2(maxRatio) - Math.log2(minRatio));
    return Math.max(0, Math.min(100, normalized * 100));
  }

  /*
   * El ICT exterior interpola de forma continua los puntos de referencia
   * ejecutivos. El ICT interior conserva exactamente la profundidad calculada
   * por el análisis geométrico; esta capa no altera ninguna medición.
   */
  const exteriorIctAnchors = [[0, 100], [.25, 90], [.5, 80], [1, 60], [2, 40], [3, 20], [5, 0]];

  function calculateIct(result) {
    if (result?.posicion === "interior") {
      if (!Number.isFinite(result.profundidadRelativa)) return null;
      return Math.max(0, Math.min(100, result.profundidadRelativa * 100));
    }
    const ratio = result?.relacionDiametros;
    if (!Number.isFinite(ratio) || ratio < 0) return null;
    if (ratio >= exteriorIctAnchors.at(-1)[0]) return 0;
    for (let index = 1; index < exteriorIctAnchors.length; index += 1) {
      const [rightRatio, rightIct] = exteriorIctAnchors[index];
      if (ratio <= rightRatio) {
        const [leftRatio, leftIct] = exteriorIctAnchors[index - 1];
        const progress = (ratio - leftRatio) / (rightRatio - leftRatio);
        return leftIct + progress * (rightIct - leftIct);
      }
    }
    return 0;
  }

  function classifyIct(ict) {
    if (!Number.isFinite(ict)) return { key: "unknown", label: "Sin información", rank: -1 };
    if (ict <= 20) return { key: "very-low", label: "Muy bajo", rank: 0 };
    if (ict <= 40) return { key: "low", label: "Bajo", rank: 1 };
    if (ict <= 60) return { key: "medium", label: "Medio", rank: 2 };
    if (ict <= 80) return { key: "high", label: "Alto", rank: 3 };
    return { key: "very-high", label: "Muy alto", rank: 4 };
  }

  function getDominantResult(results) {
    return results
      .filter((result) => Number.isFinite(calculateIct(result)))
      .reduce((dominant, current) => {
        if (!dominant) return current;
        return calculateIct(current) > calculateIct(dominant) ? current : dominant;
      }, null);
  }

  const api = { classifyTerritorialExposure, classifyTerritorialAlert, getExposureVisualPosition, calculateIct, classifyIct, getDominantResult };
  Object.assign(globalScope, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
