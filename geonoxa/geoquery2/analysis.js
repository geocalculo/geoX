(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GeoNoxaAnalysis = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const clamp = value => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const entityKey = (feature, group) => {
    const p = feature.properties || {};
    const fields = group === 'relaves' ? ['id_relave', 'id', 'faena', 'nombre'] : ['id_zona', 'id', 'nombre', 'zona'];
    const field = fields.find(key => p[key] !== undefined && normalize(p[key]));
    return field ? `${field}:${normalize(p[field])}` : `geometry:${JSON.stringify(feature.geometry || {})}`;
  };
  function groupLogicalEntities(features, group) {
    const grouped = new Map();
    (features || []).forEach(feature => {
      const key = entityKey(feature, group);
      if (!grouped.has(key)) grouped.set(key, { key, properties: feature.properties || {}, features: [] });
      grouped.get(key).features.push(feature);
    });
    return [...grouped.values()];
  }
  function bboxIntersects(a, b) {
    return Array.isArray(a) && a.length === 4 && Array.isArray(b) && b.length === 4 &&
      [...a, ...b].every(Number.isFinite) &&
      !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
  }
  function pointInsideViewport(lat, lon, viewport) {
    return Number.isFinite(Number(lat)) && Number.isFinite(Number(lon)) &&
      Number(lon) >= viewport.west && Number(lon) <= viewport.east &&
      Number(lat) >= viewport.south && Number(lat) <= viewport.north;
  }
  function exposureCategory(score) {
    const value = clamp(score);
    if (value <= 20) return { label: 'Muy baja', color: '#16803a' };
    if (value <= 40) return { label: 'Baja', color: '#75b843' };
    if (value <= 60) return { label: 'Media', color: '#eab308' };
    if (value <= 80) return { label: 'Alta', color: '#f97316' };
    return { label: 'Muy alta', color: '#dc2626' };
  }
  function equivalentDiameterKm(areaM2) { return areaM2 > 0 ? (2 * Math.sqrt(Number(areaM2) / Math.PI)) / 1000 : null; }
  function relativeExposure({ inside, distanceKm, diameterKm, depthRatio }) {
    return clamp(inside ? 100 * Math.max(0, Math.min(1, Number(depthRatio) || 0)) : 100 * Math.exp(-1.45 * (Number(distanceKm) || 0) / Math.max(Number(diameterKm) || 1, 0.001)));
  }
  function indicatorSemantics(kind, inside, score) {
    const category = score === null ? null : exposureCategory(score);
    if (kind === 'relaves') return { code: 'IER', name: 'Índice de Exposición a Relaves', concept: 'Exposición', interpretation: category ? `Exposición ${category.label.toLowerCase()}` : 'No calculable', category };
    if (inside) return { code: 'IIT', name: 'Índice de Inmersión Territorial', concept: 'Inmersión', interpretation: category ? `Inmersión ${category.label.toLowerCase()}` : 'No calculable', category };
    return { code: 'IPT', name: 'Índice de Proximidad Territorial', concept: 'Proximidad', interpretation: category ? `Proximidad ${category.label.toLowerCase()}` : 'No calculable', category };
  }
  function pointTailingsExposure(distanceKm, areaM2) {
    const diameter = equivalentDiameterKm(areaM2);
    // Conserva la precisión del cálculo. El redondeo corresponde a la capa de
    // presentación; hacerlo aquí convertía exposiciones pequeñas pero válidas en 0.
    return Math.max(0, Math.min(100, 100 * Math.exp(-(Number(distanceKm) || 0) / Math.max(diameter || 5, 0.25))));
  }
  function dominant(items, getter) {
    const counts = new Map();
    items.forEach(item => { const value = getter(item) || 'Sin información'; counts.set(value, (counts.get(value) || 0) + 1); });
    return [...counts].map(([name, count]) => ({ name, count, percent: items.length ? Math.round(count * 100 / items.length) : 0 })).sort((a, b) => b.count - a.count)[0] || null;
  }
  function selectNearestTailings(results, limit = 10) {
    return [...(results || [])]
      .filter(item => Number.isFinite(item.distanceKm))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, limit);
  }
  function selectRelatedZones(candidates) {
    return [...(candidates || [])]
      .filter(item => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score || a.distanceKm - b.distanceKm)
      .slice(0, 1);
  }
  function isValidCoordinate(lat, lon) {
    return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }
  // Reutiliza pointCoords() del GeoQuery productivo: primero GeoJSON Point y,
  // como respaldo, los campos reales de la fuente (`latitud`/`longitud`).
  function getRelaveCoordinates(feature) {
    const properties = feature?.properties || {};
    const geometry = feature?.geometry;
    if (geometry?.type === 'Point' && Array.isArray(geometry.coordinates)) {
      const [lon, lat] = geometry.coordinates.map(Number);
      if (isValidCoordinate(lat, lon)) return { lat, lon };
    }
    const latCandidates = [properties.latitud];
    const lonCandidates = [properties.longitud];
    const lat = Number(latCandidates.find(value => Number.isFinite(Number(value))));
    const lon = Number(lonCandidates.find(value => Number.isFinite(Number(value))));
    return isValidCoordinate(lat, lon) ? { lat, lon } : null;
  }
  function getTailingsName(feature) {
    const p = feature?.properties || {};
    const candidates = [p.NOMBRE, p.Nombre, p.nombre, p.NOM_RELAVE, p.NOMBRE_RELAVE, p.FAENA, p.Faena, p.faena, p.EMPRESA, p.Empresa, p.empresa, p.INSTALACION, p.IDENTIFICADOR, p.ID, p.id_relave, p.id];
    const value = candidates.find(item => item !== null && item !== undefined && String(item).trim() !== '');
    return value === undefined ? 'Relave sin nombre' : String(value).trim();
  }
  const firstProperty = (item, names) => {
    const p = item?.feature?.properties || item?.properties || item?.p || {};
    const key = names.find(name => p[name] !== null && p[name] !== undefined && String(p[name]).trim() !== '');
    return key ? p[key] : '';
  };
  const getRelaveName = item => getTailingsName(item?.feature || item);
  const getRelaveResource = item => firstProperty(item, ['recurso', 'RECURSO', 'mineral', 'MINERAL']);
  const getRelaveStatus = item => firstProperty(item, ['estado', 'ESTADO', 'tipo_deposito', 'TIPO_DEPOSITO', 'tipo']);
  const getRelaveArea = item => {
    const value = Number(item?.area ?? firstProperty(item, ['shape_area_m2', 'superficie_m2', 'area_m2', 'superficie', 'Shape_Area']));
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const getRelaveOwner = item => firstProperty(item, ['empresa', 'EMPRESA', 'titular', 'TITULAR', 'propietario']);
  const getRelaveCommune = item => firstProperty(item, ['comuna', 'COMUNA']);
  const getRelaveRegion = item => firstProperty(item, ['region', 'REGION', 'región', 'nombre_region', 'cut_reg']);
  const getRelaveId = item => firstProperty(item, ['id_relave', 'ID_RELAVE', 'identificador', 'IDENTIFICADOR', 'objectid', 'OBJECTID', 'id', 'ID']);
  function buildTailingsKmlMetadata(item, index, total) {
    const isNearest = index === 0;
    const isClusterLimit = index === total - 1;
    return {
      order: index + 1,
      total,
      name: getRelaveName(item),
      resource: getRelaveResource(item),
      status: getRelaveStatus(item),
      distanceKm: Number.isFinite(Number(item?.distanceKm)) ? Number(item.distanceKm) : null,
      area: getRelaveArea(item),
      owner: getRelaveOwner(item),
      commune: getRelaveCommune(item),
      region: getRelaveRegion(item),
      id: getRelaveId(item),
      role: isNearest ? 'Relave más cercano' : isClusterLimit ? 'Límite del clúster' : 'Relave relacionado'
    };
  }
  function escapeXml(value = '') {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }
  function createAnalysisResults() {
    return {
      relaves: { detected: [], related: [], ier: null },
      zonas: { detected: [], related: [], iez: null }
    };
  }
  function totalRelatedEntities(analysisResults) {
    return analysisResults.relaves.related.length + analysisResults.zonas.related.length;
  }

  function distribution(items, getter, visibleLimit = 5) {
    const counts = new Map();
    (items || []).forEach(item => {
      const name = getter(item) || 'Sin información';
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    const ordered = [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    if (ordered.length <= visibleLimit) return ordered;
    const shown = ordered.slice(0, visibleLimit - 1);
    return [...shown, { name: 'Otros', count: ordered.slice(visibleLimit - 1).reduce((sum, item) => sum + item.count, 0) }];
  }
  function resourceMagnitude(items) {
    const groups = new Map();
    let invalidAreaCount = 0;
    (items || []).forEach(item => {
      const name = getRelaveResource(item) || 'Sin información';
      if (!groups.has(name)) groups.set(name, { name, count: 0, areaM2: 0 });
      const group = groups.get(name);
      group.count += 1;
      const area = getRelaveArea(item);
      if (area === null) invalidAreaCount += 1;
      else group.areaM2 += area;
    });
    const totalCount = (items || []).length;
    const totalAreaM2 = [...groups.values()].reduce((sum, group) => sum + group.areaM2, 0);
    const categories = [...groups.values()]
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .map(group => ({ ...group, countPercent: totalCount ? group.count * 100 / totalCount : 0, areaPercent: totalAreaM2 ? group.areaM2 * 100 / totalAreaM2 : 0 }));
    return { totalCount, totalAreaM2, missingAreaCount: invalidAreaCount, invalidAreaCount, categories };
  }
  return { clamp, normalize, entityKey, groupLogicalEntities, bboxIntersects, pointInsideViewport, exposureCategory, indicatorSemantics, equivalentDiameterKm, relativeExposure, pointTailingsExposure, dominant, selectNearestTailings, selectRelatedZones, isValidCoordinate, getRelaveCoordinates, getTailingsCoordinates: getRelaveCoordinates, getTailingsName, getRelaveName, getRelaveResource, getRelaveStatus, getRelaveArea, getRelaveOwner, getRelaveCommune, getRelaveRegion, getRelaveId, buildTailingsKmlMetadata, escapeXml, createAnalysisResults, totalRelatedEntities, distribution, resourceMagnitude };
});
