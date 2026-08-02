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
  function expandedViewport(bounds) {
    const west = Number(bounds.west), east = Number(bounds.east), south = Number(bounds.south), north = Number(bounds.north);
    const cx = (west + east) / 2, cy = (south + north) / 2;
    return { west: cx - (east - west), east: cx + (east - west), south: cy - (north - south), north: cy + (north - south) };
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
    return clamp(inside ? 65 + 35 * Math.max(0, Math.min(1, Number(depthRatio) || 0)) : 100 * Math.exp(-1.45 * (Number(distanceKm) || 0) / Math.max(Number(diameterKm) || 1, 0.001)));
  }
  function pointTailingsExposure(distanceKm, areaM2) {
    const diameter = equivalentDiameterKm(areaM2);
    return clamp(100 * Math.exp(-(Number(distanceKm) || 0) / Math.max(diameter || 5, 0.25)));
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
  function getTailingsName(feature) {
    const p = feature?.properties || {};
    const candidates = [p.NOMBRE, p.Nombre, p.nombre, p.NOM_RELAVE, p.NOMBRE_RELAVE, p.FAENA, p.Faena, p.faena, p.EMPRESA, p.Empresa, p.empresa, p.INSTALACION, p.IDENTIFICADOR, p.ID, p.id_relave, p.id];
    const value = candidates.find(item => item !== null && item !== undefined && String(item).trim() !== '');
    return value === undefined ? 'Relave sin nombre' : String(value).trim();
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
  function maximumExposure(analysisResults) {
    const candidates = [];
    if (Number.isFinite(analysisResults.relaves.ier)) candidates.push({ group: 'RELAVES', kind: 'relaves', index: analysisResults.relaves.ier });
    if (Number.isFinite(analysisResults.zonas.iez)) candidates.push({ group: 'ZONAS SATURADAS / LATENTES', kind: 'zonas', index: analysisResults.zonas.iez });
    return candidates.sort((a, b) => b.index - a.index)[0] || null;
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
  return { clamp, normalize, entityKey, groupLogicalEntities, expandedViewport, exposureCategory, equivalentDiameterKm, relativeExposure, pointTailingsExposure, dominant, selectNearestTailings, selectRelatedZones, isValidCoordinate, getTailingsName, createAnalysisResults, totalRelatedEntities, maximumExposure, distribution };
});
