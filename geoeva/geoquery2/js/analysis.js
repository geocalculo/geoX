(function (global) {
  "use strict";
  const validCoordinate = (lat, lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  const normalizeStatus = value => String(value || "").trim().toLowerCase();
  const approved = feature => ["aprobado", "aprobada", "proyecto aprobado"].includes(normalizeStatus(feature.properties?.estado));
  const rejected = feature => normalizeStatus(feature.properties?.estado) === "rechazado";
  const qualification = feature => normalizeStatus(feature.properties?.estado) === "en calificación";
  const normalizeSector = value => String(value || "").trim().replace(/\s+/g, " ") || "Sin sector informado";
  function averageEvaluationBySector(features) {
    const groups = new Map();
    features.forEach(feature => {
      const properties = feature?.properties || {};
      const sector = String(properties.sector || "").trim().replace(/\s+/g, " ");
      const months = Number(properties.meses_tramitacion);
      if (normalizeStatus(properties.estado) !== "aprobado" || !sector || !Number.isFinite(months) || months <= 0) return;
      const group = groups.get(sector) || { totalMonths: 0, projectCount: 0 };
      group.totalMonths += months;
      group.projectCount += 1;
      groups.set(sector, group);
    });
    return [...groups].map(([sector, group]) => ({
      sector,
      averageMonths: group.totalMonths / group.projectCount,
      projectCount: group.projectCount
    })).sort((a, b) => b.averageMonths - a.averageMonths || a.sector.localeCompare(b.sector, "es")).map(row => ({
      ...row,
      averageMonths: Number(row.averageMonths.toFixed(1))
    }));
  }
  function evaluationComparisons(base, features) {
    const clusterSectors = [...new Set(base.map(item => String(item.feature.properties?.sector || "").trim().replace(/\s+/g, " ")).filter(Boolean))];
    const aggregate = (items, featureOf) => {
      const groups = new Map();
      items.forEach(item => {
        const feature = featureOf(item); const properties = feature?.properties || {};
        const sector = String(properties.sector || "").trim().replace(/\s+/g, " ");
        if (!clusterSectors.includes(sector) || properties.meses_tramitacion == null) return;
        const months = Number(properties.meses_tramitacion); if (!Number.isFinite(months) || months <= 0) return;
        const group = groups.get(sector) || { totalMonths: 0, projectCount: 0 };
        group.totalMonths += months; group.projectCount += 1; groups.set(sector, group);
      });
      return groups;
    };
    const clusterGroups = aggregate(base, item => item.feature);
    const nationalGroups = aggregate(features.filter(approved), feature => feature);
    const average = (groups, sector) => { const group = groups.get(sector); return group ? { sector, averageMonths: group.totalMonths / group.projectCount, projectCount: group.projectCount } : { sector, averageMonths: null, projectCount: 0 }; };
    const order = [...clusterSectors].sort((a, b) => (clusterGroups.get(b)?.totalMonths / clusterGroups.get(b)?.projectCount || -Infinity) - (clusterGroups.get(a)?.totalMonths / clusterGroups.get(a)?.projectCount || -Infinity) || a.localeCompare(b, "es"));
    const clusterEvaluationBySector = order.map(sector => average(clusterGroups, sector));
    const nationalEvaluationByClusterSectors = order.map(sector => average(nationalGroups, sector));
    const sharedEvaluationMax = Math.max(0, ...clusterEvaluationBySector.map(row => row.averageMonths || 0), ...nationalEvaluationByClusterSectors.map(row => row.averageMonths || 0));
    return { clusterSectors: order, clusterEvaluationBySector, nationalEvaluationByClusterSectors, sharedEvaluationMax };
  }
  function coordinates(feature) {
    const pair = feature.geometry?.type === "Point" ? feature.geometry.coordinates : [feature.properties?.lon, feature.properties?.lat];
    const lon = Number(pair?.[0]); const lat = Number(pair?.[1]);
    return validCoordinate(lat, lon) ? { lat, lon } : null;
  }
  function distance(query, feature) {
    const point = coordinates(feature); if (!point || !global.turf) return null;
    const km = turf.distance(turf.point([query.lon, query.lat]), turf.point([point.lon, point.lat]), { units: "kilometers" });
    return Number.isFinite(km) ? { feature, ...point, distance_km: km, distance_m: km * 1000 } : null;
  }
  function pairStats(projects) {
    const result = { count: projects.length, pairCount: 0, minKm: null, meanKm: null }; let total = 0; let min = Infinity;
    for (let i = 0; i < projects.length - 1; i += 1) for (let j = i + 1; j < projects.length; j += 1) {
      const km = turf.distance(turf.point([projects[i].lon, projects[i].lat]), turf.point([projects[j].lon, projects[j].lat]), { units: "kilometers" });
      if (Number.isFinite(km)) { total += km; min = Math.min(min, km); result.pairCount += 1; }
    }
    if (result.pairCount) { result.minKm = min; result.meanKm = total / result.pairCount; } return result;
  }
  function pointStats(projects) {
    if (!projects.length) return { count: 0, minKm: null, meanKm: null, maxKm: null };
    const values = projects.map(project => project.distance_km).filter(Number.isFinite);
    return { count: values.length, minKm: Math.min(...values), meanKm: values.reduce((a, b) => a + b, 0) / values.length, maxKm: Math.max(...values) };
  }
  function run(query, features) {
    const measured = features.map(feature => distance(query, feature)).filter(Boolean);
    const base = measured.filter(item => approved(item.feature)).sort((a, b) => a.distance_km - b.distance_km).slice(0, 10);
    const radiusMeters = base.length ? base[base.length - 1].distance_m : null;
    const inside = Number.isFinite(radiusMeters) ? measured.filter(item => item.distance_m <= radiusMeters) : [];
    const counts = new Map(); base.forEach(item => { const sector = normalizeSector(item.feature.properties?.sector); counts.set(sector, (counts.get(sector) || 0) + 1); });
    let dominantSector = base.length ? "Sin sector informado" : "Sin proyectos aprobados disponibles"; let dominantSectorCount = 0;
    counts.forEach((count, sector) => { if (count > dominantSectorCount) { dominantSector = sector; dominantSectorCount = count; } });
    const dominant = base.filter(item => normalizeSector(item.feature.properties?.sector) === dominantSector);
    const investment = feature => { const value = Number(feature.properties?.inversion_mmusd); return Number.isFinite(value) ? value : 0; };
    const approvedInside = inside.filter(item => approved(item.feature));
    const approvedInvestment = approvedInside.reduce((sum, item) => sum + investment(item.feature), 0);
    const dominantSectorInvestment = approvedInside
      .filter(item => normalizeSector(item.feature.properties?.sector) === dominantSector)
      .reduce((sum, item) => sum + investment(item.feature), 0);
    const evaluation = evaluationComparisons(base, features);
    return { query, base, inside, radiusMeters, total: inside.length, approved: inside.filter(item => approved(item.feature)).length,
      rejected: inside.filter(item => rejected(item.feature)).length, inQualification: inside.filter(item => qualification(item.feature)).length,
      totalInvestment: inside.reduce((sum, item) => sum + investment(item.feature), 0), approvedInvestment,
      dominantSectorInvestment, dominantSectorInvestmentShare: approvedInvestment ? dominantSectorInvestment / approvedInvestment * 100 : 0,
      dominantSector, dominantSectorCount, dominantSectorShare: base.length ? dominantSectorCount / base.length * 100 : null, dominant,
      ...evaluation,
      approvedPointStats: pointStats(base), dominantPointStats: pointStats(dominant), approvedPairStats: pairStats(base), dominantPairStats: pairStats(dominant) };
  }
  global.GeoQueryAnalysis = { run, validCoordinate, normalizeSector, normalizeStatus, averageEvaluationBySector };
})(window);
