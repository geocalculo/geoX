(function (root, factory) {
  const api = factory(root.GeoNoxaSpatialEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GeoNoxaReportModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (spatialEngine) {
  "use strict";

  if (!spatialEngine) throw new Error("GeoNoxaReportModel requiere GeoNoxaSpatialEngine.");

  const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
  const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const {
    dominantResource,
    dominantResourceRelaves,
    pairDistanceStats,
    pointDistanceStats
  } = spatialEngine;

  function cleanText(v) {
    const text = String(v ?? "").replace(/\s+/g, " ").trim();
    return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null;
  }

  function formatDistanceKm(km) {
    return Number.isFinite(km) ? `${fmtKm.format(km)} km` : "N/D";
  }

  function isPresentValue(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "object") return false;
    const text = String(value).trim();
    return text !== "" && !["undefined", "null", "nan", "N/D", "—"].includes(text.toLowerCase());
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${fmt.format(value)}%` : null;
  }

  function relationLabel(result) {
    return (result?.relationType || result?.relation) === "intersects"
      ? "Punto dentro de la zona relacionada"
      : "Zona más cercana al punto consultado";
  }

  function relaveTitle(relave) {
    return cleanText(relave?.siteName) || cleanText(relave?.company) || cleanText(relave?.idRelave) || "Relave relacionado";
  }

  function shouldRenderRelaves(result) {
    return Boolean(result && result.status === "resolved" && Array.isArray(result.selectedRelaves) && result.selectedRelaves.length > 0);
  }

  function relaveContext(result) {
    const selectedRelaves = Array.isArray(result?.selectedRelaves)
      ? result.selectedRelaves
      : (Array.isArray(result?.items) ? result.items : []);
    const dominant = result?.dominantResource
      ? {
          resource: result.dominantResource,
          count: result.dominantResourceCount || dominantResource(selectedRelaves)?.count || 0
        }
      : dominantResource(selectedRelaves);
    const dominantRelaves = Array.isArray(result?.dominantResourceRelaves)
      ? result.dominantResourceRelaves
      : dominantResourceRelaves(selectedRelaves, dominant);
    return { selectedRelaves, dominant, dominantRelaves };
  }

function buildRelavesSummary(result){
  if (!shouldRenderRelaves(result)) return "";
  const { selectedRelaves } = relaveContext(result);
  const fragments = [`Se analizaron ${selectedRelaves.length} relaves presentes en el viewport.`];
  if (result.dominantResource) fragments.push(`El recurso dominante es ${result.dominantResource}${Number.isFinite(result.dominantResourcePercentage) ? `, con una participación del ${fmt.format(result.dominantResourcePercentage)} %.` : "."}`);
  if (Number.isFinite(result.pointRelationStats?.minKm)) fragments.push(`El relave más cercano se encuentra a ${formatDistanceKm(result.pointRelationStats.minKm)} del punto consultado.`);
  return fragments.join(" ");
}
function buildZonasSummary(result){
  const z = result.items?.[0];
  if (!z) return "";
  const name = cleanText(z.name) || "sin nombre informado";
  const pollutantText = cleanText(z.pollutant) ? `, asociada al contaminante ${cleanText(z.pollutant)}` : "";
  if (result.relation === "intersects") return `El punto consultado se encuentra dentro de la zona saturada o latente ${name}${pollutantText}.`;
  return `La zona saturada o latente más cercana es ${name}, ubicada a ${formatDistanceKm(result.distanceKm)} del punto consultado.`;
}
function buildExecutiveSummary({ relavesResult, zonasResult }){
  const fragments=[];
  if(relavesResult?.status==="resolved") { try { fragments.push(buildRelavesSummary(relavesResult)); } catch(error) { console.error("[GeoNOXA][relaves][summary]", error); relavesResult.summaryError = error; } }
  if(zonasResult?.status==="resolved") { try { fragments.push(buildZonasSummary(zonasResult)); } catch(error) { console.error("[GeoNOXA][zonas][summary]", error); zonasResult.summaryError = error; } }
  if(fragments.length===0 && relavesResult?.status==="empty" && zonasResult?.status==="empty") return "No se identificaron relaves ni zonas saturadas o latentes dentro del viewport consultado.";
  if(fragments.length===0) return "No se identificaron elementos territoriales dentro del viewport consultado.";
  return fragments.filter(Boolean).join(" ");
}

function objectToPdfItems(object) {
  return Object.entries(object || {}).filter(([, value]) => isPresentValue(value)).map(([label, value]) => ({ label, value }));
}
function relavePdfFields(relave) {
  return [
    { label: "Empresa", value: relave.company },
    { label: "Recurso", value: relave.resourceOriginal },
    { label: "Estado", value: relave.status || relave.originalProperties?.estado },
    { label: "Comuna", value: relave.commune },
    { label: "Tipo depósito", value: relave.depositType },
    { label: "Distancia", value: formatDistanceKm(relave.distanceKm) }
  ].filter(item => isPresentValue(item.value));
}
function buildGeoNoxaReportModel({ lat, lon, from, currentBasemap, relavesResult, zonasResult, relavesGroup, zonasGroup, executiveSummary, overallStatus, viewport }) {
  const selectedRelaves = Array.isArray(relavesResult?.selectedRelaves) ? relavesResult.selectedRelaves : (relavesResult?.items || []);
  const selectedStats = pointDistanceStats(selectedRelaves);
  const selectedPairStats = pairDistanceStats(selectedRelaves);
  const dominantRelaves = relaveContext(relavesResult || {}).dominantRelaves || [];
  const dominantPairStats = pairDistanceStats(dominantRelaves);
  const dominantPointStats = pointDistanceStats(dominantRelaves);
  const zone = zonasResult?.items?.[0] || null;
  const zoneDistance = zonasResult?.relation === "intersects" ? "Dentro de zona" : formatDistanceKm(zonasResult?.distanceKm);
  const relaveCards = selectedRelaves.slice(0, 10).map((relave, index) => ({ title: `${index + 1}. ${relaveTitle(relave)}`, fields: relavePdfFields(relave) }));
  const relaveRows = selectedRelaves.slice(0, 10).map((relave, index) => [index + 1, relaveTitle(relave), cleanText(relave.resourceOriginal) || "N/D", cleanText(relave.status || relave.originalProperties?.estado) || "N/D", cleanText(relave.commune) || "N/D", formatDistanceKm(relave.distanceKm)]);
  const sources = [relavesResult?.sourceFile, zonasResult?.items?.[0]?.sourceFile, relavesGroup?.entry?.nombre, zonasGroup?.entry?.nombre].filter(Boolean);
  const model = {
    identity: { site: "GeoNOXA", title: "Reporte del punto consultado", generatedAt: new Date() },
    query: { lat, lon, region: null, commune: null, originSite: (from || "geonoxa").toUpperCase(), status: overallStatus?.label, basemap: currentBasemap },
    summary: { executiveText: executiveSummary },
    relaves: {
      related: selectedRelaves.slice(0, 10),
      resourceDominant: relavesResult?.dominantResource,
      descriptors: { "Radio del clúster": formatDistanceKm(relavesResult?.clusterRadiusKm ?? relavesResult?.radiusKm), "Distancia media entre relaves": formatDistanceKm(selectedPairStats.meanKm), "Distancia mínima entre relaves": formatDistanceKm(selectedPairStats.minKm), "Distancia media recurso dominante": formatDistanceKm(dominantPairStats.meanKm), "Distancia mínima recurso dominante": formatDistanceKm(dominantPairStats.minKm) },
      spatialIndicators: { "Tipo de relación": selectedRelaves.length ? "Cercanía al punto consultado" : "Sin relaves seleccionados", "Relaves analizados": selectedRelaves.length, "Distancia media al punto": formatDistanceKm(selectedStats.meanKm), "Distancia mínima al punto": formatDistanceKm(selectedStats.minKm), "Recurso dominante": relavesResult?.dominantResource, "Relaves del recurso dominante": relavesResult?.dominantResourceCount, "Participación recurso dominante": formatPercent(relavesResult?.dominantResourcePercentage), "Distancia media al punto del recurso dominante": formatDistanceKm(dominantPointStats.meanKm) },
      metadata: relaveRows
    },
    zones: {
      nearest: zone,
      spatialIndicators: { "Tipo de relación": zonasResult?.status === "resolved" ? relationLabel(zonasResult) : "Sin zona relacionada", "Distancia": zoneDistance },
      metadata: zone ? { "Nombre": zone.name, "Condición": zone.condition, "Contaminante": zone.pollutant, "Saturado": zone.saturatedValue, "Latente": zone.latentValue, "Decreto": zone.decree, "Región CUT": zone.regionCode, "Superficie oficial": zone.officialArea, "Fuente": zone.sourceFile, "Enlace": zone.link } : {}
    },
    technicalMetadata: { "Fecha de consulta": new Date().toLocaleString("es-CL"), "Coordenadas": `${lat?.toFixed?.(6) || lat}, ${lon?.toFixed?.(6) || lon}`, "CRS": "WGS84 / EPSG:4326", "Regla territorial": "Análisis limitado al viewport original de consulta", "Fuente viewport": viewport?.source || "sin viewport", "Mapa base": currentBasemap, "Versión reporte": "GeoNOXA GeoQuery" },
    sources: [...new Set(sources)],
    disclaimer: "Reporte metodológico generado automáticamente desde los resultados visibles de GeoQuery. La información debe verificarse con las fuentes oficiales antes de decisiones administrativas, ambientales o de inversión.",
    sections: []
  };
  model.sections = [
    { id: "query-summary", type: "kpi-grid", title: "Resumen de consulta", data: { columns: 4, items: [{ label: "Latitud", value: lat?.toFixed?.(6) || lat }, { label: "Longitud", value: lon?.toFixed?.(6) || lon }, { label: "Sitio origen", value: model.query.originSite }, { label: "Estado", value: overallStatus?.label }] } },
    { id: "point-map", type: "point-map", title: "Punto consultado y mapa de ubicación", data: { pointItems: [{ label: "Latitud", value: lat?.toFixed?.(6) || lat }, { label: "Longitud", value: lon?.toFixed?.(6) || lon }, { label: "Región", value: model.query.region || "No informada" }, { label: "Comuna", value: model.query.commune || "No informada" }, { label: "Tipo de relación", value: overallStatus?.label }, { label: "Mapa base", value: currentBasemap }] } },
    { id: "executive-summary", type: "text-panel", title: "Resumen ejecutivo", data: { text: executiveSummary } },
    { id: "relaves-group", type: "notice", title: "Grupo Relaves", data: { text: relavesResult?.status === "resolved" ? `Se exportan ${selectedRelaves.slice(0, 10).length} relaves relacionados usados por GeoQuery.` : "No se identificaron relaves relacionados para esta consulta." } },
    { id: "related-relaves", type: "card-list", title: "Relaves relacionados", data: { columns: 2, items: relaveCards } },
    { id: "relave-descriptors", type: "metadata", title: "Descriptores geométricos de relaves", data: { items: objectToPdfItems(model.relaves.descriptors) } },
    { id: "relave-indicators", type: "metadata", title: "Indicadores de relación espacial de relaves", data: { items: objectToPdfItems(model.relaves.spatialIndicators) } },
    { id: "relave-metadata", type: "table", title: "Metadata de relaves", data: { head: ["#", "Relave", "Recurso", "Estado", "Comuna", "Distancia"], rows: relaveRows } },
    { id: "zones-group", type: "notice", title: "Grupo Zonas Saturadas o Latentes", data: { text: zone ? "Se informa la zona saturada o latente relacionada más cercana según el resultado GeoQuery." : "No se identificó una zona saturada o latente relacionada para esta consulta." } },
    { id: "nearest-zone", type: zone ? "metadata" : "notice", title: "Zona más cercana", data: zone ? { items: objectToPdfItems({ "Tipo de zona": zonasGroup?.cfg?.nombre_largo || zonasGroup?.cfg?.nombre, "Nombre": zone.name, "Contaminante": zone.pollutant, "Estado saturada/latente": zone.condition, "Distancia": zoneDistance, "Región/CUT": zone.regionCode, "Fuente": zone.sourceFile }) } : { text: "No se identificó una zona saturada o latente relacionada para esta consulta." } },
    { id: "zone-indicators", type: "metadata", title: "Indicadores de relación espacial de la zona", data: { items: objectToPdfItems(model.zones.spatialIndicators) } },
    { id: "zone-metadata", type: "metadata", title: "Metadata de la zona", data: { items: objectToPdfItems(model.zones.metadata) } },
    { id: "technical-metadata", type: "metadata", title: "Metadata técnica", data: { items: objectToPdfItems(model.technicalMetadata) } },
    { id: "sources", type: "text-panel", title: "Fuentes", data: { text: model.sources.length ? model.sources.join("\n") : "Fuentes no informadas en el resultado actual." } },
    { id: "disclaimer", type: "text-panel", title: "Descargo metodológico", data: { text: model.disclaimer } }
  ];
  return model;
}

function deriveOverallStatus(relaves, zonas){
  const results=[relaves,zonas];
  const resolvedCount=results.filter(item=>item?.status==="resolved").length;
  const emptyCount=results.filter(item=>item?.status==="empty").length;
  const errorCount=results.filter(item=>item?.status==="error").length;
  if(resolvedCount>0 && errorCount===0) return { code:"resolved", label:"Resuelto" };
  if(resolvedCount>0 && errorCount>0) return { code:"partial", label:"Resuelto parcialmente" };
  if(resolvedCount===0 && emptyCount===2) return { code:"empty", label:"Sin resultados en el viewport" };
  return { code:"error", label:"Error de análisis" };
}


  return Object.freeze({
    buildRelavesSummary,
    buildZonasSummary,
    buildExecutiveSummary,
    buildGeoNoxaReportModel,
    deriveOverallStatus
  });
});
