/* Preselección espacial liviana de GeoQuery 2.0 (sin buffers por entidad). */
(function exposeViewportFilter(globalScope) {
  function finiteValue(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function valueFrom(params, name) {
    return finiteValue(typeof params?.get === "function" ? params.get(name) : params?.[name]);
  }

  function readOriginalViewport(params) {
    const viewport = {
      west: valueFrom(params, "viewWest") ?? valueFrom(params, "west"),
      south: valueFrom(params, "viewSouth") ?? valueFrom(params, "south"),
      east: valueFrom(params, "viewEast") ?? valueFrom(params, "east"),
      north: valueFrom(params, "viewNorth") ?? valueFrom(params, "north")
    };
    if (!Object.values(viewport).every(Number.isFinite) || viewport.east <= viewport.west || viewport.north <= viewport.south) return null;
    if (viewport.west < -180 || viewport.east > 180 || viewport.south < -90 || viewport.north > 90) return null;
    return viewport;
  }

  function expandViewportByFactor(viewport, factor = 2) {
    if (!viewport || !Number.isFinite(factor) || factor <= 0) return null;
    const centerLon = (viewport.west + viewport.east) / 2;
    const centerLat = (viewport.south + viewport.north) / 2;
    const halfWidth = ((viewport.east - viewport.west) / 2) * factor;
    const halfHeight = ((viewport.north - viewport.south) / 2) * factor;
    return { west: centerLon - halfWidth, east: centerLon + halfWidth, south: centerLat - halfHeight, north: centerLat + halfHeight };
  }

  function clampExpandedViewport(viewport) {
    if (!viewport) return null;
    return { west: Math.max(-180, viewport.west), east: Math.min(180, viewport.east), south: Math.max(-90, viewport.south), north: Math.min(90, viewport.north) };
  }

  function viewportToPolygon(viewport, turfApi = globalScope.turf) {
    if (!viewport || !turfApi?.polygon) return null;
    return turfApi.polygon([[[viewport.west, viewport.south], [viewport.east, viewport.south], [viewport.east, viewport.north], [viewport.west, viewport.north], [viewport.west, viewport.south]]]);
  }

  function bboxIntersects(a, b) {
    return Array.isArray(a) && Array.isArray(b) && a.length >= 4 && b.length >= 4 &&
      [...a.slice(0, 4), ...b.slice(0, 4)].every(Number.isFinite) &&
      !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  }

  async function processInBatches(items, batchSize, callback) {
    const results = [];
    const size = Math.max(1, batchSize || 1);
    for (let index = 0; index < items.length; index += size) {
      for (const item of items.slice(index, index + size)) {
        const result = callback(item);
        if (result) results.push(result);
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return results;
  }

  async function filterFeaturesByViewport(features, viewportPolygon, viewportBbox, turfApi = globalScope.turf, batchSize = 200) {
    if (!viewportPolygon || !viewportBbox) return { roughCandidates: [], spatialCandidates: [] };
    const roughCandidates = await processInBatches(features || [], batchSize, (feature) => {
      try { return bboxIntersects(turfApi.bbox(feature), viewportBbox) ? feature : null; }
      catch (error) { console.warn("GeoNEMO: bbox inválido", error); return null; }
    });
    const spatialCandidates = await processInBatches(roughCandidates, batchSize, (feature) => {
      try { return turfApi.booleanIntersects(feature, viewportPolygon) ? feature : null; }
      catch (error) { console.warn("GeoNEMO: intersección inválida", error); return null; }
    });
    return { roughCandidates, spatialCandidates };
  }

  function calculateEquivalentDiameterKm(feature, turfApi = globalScope.turf) {
    if (!["Polygon", "MultiPolygon"].includes(feature?.geometry?.type) || !feature.geometry.coordinates?.length) return null;
    try {
      const areaM2 = turfApi.area(feature);
      return Number.isFinite(areaM2) && areaM2 > 0 ? (2 * Math.sqrt(areaM2 / Math.PI)) / 1000 : null;
    } catch (error) { console.warn("GeoNEMO: superficie inválida", error); return null; }
  }

  const api = { readOriginalViewport, expandViewportByFactor, clampExpandedViewport, viewportToPolygon, bboxIntersects, processInBatches, filterFeaturesByViewport, calculateEquivalentDiameterKm };
  Object.assign(globalScope, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
