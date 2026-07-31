/* Filtro espacial de preselección de GeoQuery 2.0. Los buffers nunca salen de este módulo. */
(function exposeViewportFilter(globalScope) {
  function finiteValue(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function valueFrom(params, names) {
    for (const name of names) {
      const value = finiteValue(typeof params?.get === "function" ? params.get(name) : params?.[name]);
      if (value !== null) return value;
    }
    return null;
  }

  function createViewportPolygon(params, turfApi = globalScope.turf) {
    const west = valueFrom(params, ["viewWest", "west", "mapWest"]);
    const south = valueFrom(params, ["viewSouth", "south", "mapSouth"]);
    const east = valueFrom(params, ["viewEast", "east", "mapEast"]);
    const north = valueFrom(params, ["viewNorth", "north", "mapNorth"]);
    if (![west, south, east, north].every(Number.isFinite) || west >= east || south >= north ||
        west < -180 || east > 180 || south < -90 || north > 90 || !turfApi?.polygon) return null;
    return turfApi.polygon([[[west, south], [east, south], [east, north], [west, north], [west, south]]]);
  }

  function calculateEquivalentDiameterKm(feature, turfApi = globalScope.turf) {
    if (!["Polygon", "MultiPolygon"].includes(feature?.geometry?.type) || !feature.geometry.coordinates?.length) {
      console.warn("GeoNEMO: entidad excluida por geometría poligonal vacía o inválida");
      return null;
    }
    try {
      const areaM2 = turfApi.area(feature);
      if (!Number.isFinite(areaM2) || areaM2 <= 0) {
        console.warn("GeoNEMO: entidad excluida porque su superficie no es válida");
        return null;
      }
      return (2 * Math.sqrt(areaM2 / Math.PI)) / 1000;
    } catch (error) {
      console.warn("GeoNEMO: no fue posible calcular la superficie de una entidad", error);
      return null;
    }
  }

  /* Descarte conservador: nunca reemplaza la intersección Turf definitiva. */
  function bboxCouldReachViewport(featureBbox, viewportBbox, distanceKm) {
    if (![...(featureBbox || []), ...(viewportBbox || []), distanceKm].every(Number.isFinite) || distanceKm <= 0) return false;
    const latitudeDelta = distanceKm / 110.574;
    const maximumLatitude = Math.min(89.999, Math.max(Math.abs(featureBbox[1]), Math.abs(featureBbox[3]), Math.abs(viewportBbox[1]), Math.abs(viewportBbox[3])));
    const longitudeDelta = distanceKm / (111.32 * Math.max(Math.cos(maximumLatitude * Math.PI / 180), 0.00001));
    return featureBbox[0] - longitudeDelta <= viewportBbox[2] && featureBbox[2] + longitudeDelta >= viewportBbox[0] &&
      featureBbox[1] - latitudeDelta <= viewportBbox[3] && featureBbox[3] + latitudeDelta >= viewportBbox[1];
  }

  function isCandidateByViewport(feature, viewportPolygon, equivalentDiameterKm, turfApi = globalScope.turf, viewportBbox = null) {
    if (!feature || !viewportPolygon || !Number.isFinite(equivalentDiameterKm) || equivalentDiameterKm <= 0) return false;
    try {
      const targetBbox = viewportBbox || turfApi.bbox(viewportPolygon);
      if (!bboxCouldReachViewport(turfApi.bbox(feature), targetBbox, equivalentDiameterKm)) return false;
      const bufferedFeature = turfApi.buffer(feature, equivalentDiameterKm, { units: "kilometers", steps: 16 });
      if (!bufferedFeature) throw new Error("Turf no generó una geometría de buffer");
      return turfApi.booleanIntersects(bufferedFeature, viewportPolygon);
    } catch (error) {
      console.warn("GeoNEMO: no fue posible evaluar la intersección", error);
      return false;
    }
  }

  const api = { createViewportPolygon, calculateEquivalentDiameterKm, bboxCouldReachViewport, isCandidateByViewport };
  Object.assign(globalScope, api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
