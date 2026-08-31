(function (root, factory) {
  const api = factory(root.GeoNoxaSpatialEngine);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GeoNoxaScreenRender = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (spatialEngine) {
  "use strict";

  if (!spatialEngine) throw new Error("GeoNoxaScreenRender requiere GeoNoxaSpatialEngine.");

  const GEOQUERY_DEBUG = false;
  const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
  const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const {
    dominantResource,
    dominantResourceRelaves,
    pairDistanceStats,
    pointDistanceStats
  } = spatialEngine;

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));
  }

  function normText(v) {
    return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function formatDistance(km) {
    return !Number.isFinite(km) ? "—" : km < 1 ? `${fmt.format(km * 1000)} m` : `${fmt.format(km)} km`;
  }

  function formatDistanceKm(km) {
    return Number.isFinite(km) ? `${fmtKm.format(km)} km` : "N/D";
  }

  function formatAreaM2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${fmt.format(n)} m²` : null;
  }

  function cleanText(v) {
    const text = String(v ?? "").replace(/\s+/g, " ").trim();
    return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null;
  }

  function displayRelaveTitle(r) {
    return cleanText(r.siteName) || cleanText(r.company) || cleanText(r.idRelave) || "Relave sin nombre informado";
  }

  function rows(items) {
    return `<dl class="details">${items.filter(([,v])=>cleanText(v)).map(([k,v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`;
  }

function renderRelaveMetadataItem(r, idx) {
  const details = [
    ["Empresa", cleanText(r.company)],
    ["Recurso", cleanText(r.resourceOriginal)],
    ["Tipo depósito", cleanText(r.depositType)],
    ["Comuna", cleanText(r.commune)],
    ["Método", cleanText(r.constructionMethod)],
    ["ID", cleanText(r.idRelave)],
    ["Área", formatAreaM2(r.areaM2)],
    ["Distancia", formatDistanceKm(r.distanceKm)]
  ].filter(([, value]) => value);
  const detailHtml = details.map(([label, value]) => `<span><b>${escapeHtml(label)}:</b> ${escapeHtml(value)}</span>`).join("");
  return `<article class="metadata-project-item metadata-relave-item"><div class="metadata-project-main"><span class="project-expediente-badge" aria-label="Ranking ${idx + 1}">${idx + 1}</span><strong class="metadata-project-title">${escapeHtml(displayRelaveTitle(r))}</strong></div><div class="metadata-project-details">${detailHtml}</div></article>`;
}
function renderAnalysisCategory(title, detailRows) {
  return `<div class="subpanel analysis-category"><h4>${escapeHtml(title)}</h4>${rows(detailRows.filter(([,v])=>v!==null&&v!==undefined&&v!==""))}</div>`;
}
function relaveContext(result) {
  const selectedRelaves = Array.isArray(result?.selectedRelaves) ? result.selectedRelaves : (Array.isArray(result?.items) ? result.items : []);
  const dominant = result?.dominantResource ? { resource: result.dominantResource, count: result.dominantResourceCount || dominantResource(selectedRelaves)?.count || 0 } : dominantResource(selectedRelaves);
  const dominantRelaves = Array.isArray(result?.dominantResourceRelaves) ? result.dominantResourceRelaves : dominantResourceRelaves(selectedRelaves, dominant);
  return { selectedRelaves, dominant, dominantRelaves };
}
function shouldRenderRelaves(result) {
  return Boolean(result && result.status === "resolved" && Array.isArray(result.selectedRelaves) && result.selectedRelaves.length > 0);
}
function safeRenderPanel(factory, label, result) {
  try { return factory(); }
  catch (error) { console.error(`[GeoNOXA][relaves][panel:${label}]`, error); if (result) result.renderError = error; return ""; }
}
function renderRelatedRelaves(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const resourceCount = new Set(selectedRelaves.map(item => cleanText(item.resourceOriginal)).filter(Boolean).map(normText)).size;
  const missingResourceCount = selectedRelaves.filter(item => !cleanText(item.resourceOriginal)).length;
  const share = Number.isFinite(result.dominantResourcePercentage) ? `${fmt.format(result.dominantResourcePercentage)}%` : (dominant && selectedRelaves.length ? `${fmt.format((dominant.count / selectedRelaves.length) * 100)}%` : "N/D");
  const compositionRows = [["Total de relaves seleccionados", selectedRelaves.length], ["Recursos diferentes", resourceCount]];
  if (dominant) compositionRows.push(["Relaves del recurso dominante", dominantRelaves.length]);
  if (missingResourceCount) compositionRows.push(["Relaves sin recurso informado", missingResourceCount]);
  return `<section class="panel group-section"><h2>Relaves relacionados</h2>${renderAnalysisCategory("Clúster base", [["Relaves más cercanos", selectedRelaves.length], ["Radio del clúster", formatDistanceKm(result.radiusKm)], ["Recurso dominante", dominant?.resource], ["Participación del recurso dominante", share]])}${renderAnalysisCategory("Composición del clúster", compositionRows)}</section>`;
}
function renderGeometryDescriptors(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const selectedStats = pairDistanceStats(selectedRelaves);
  const dominantStats = pairDistanceStats(dominantRelaves);
  const dominantPanel = dominant ? renderAnalysisCategory(`Recurso dominante · ${dominant.resource} · ${dominantRelaves.length} relaves`, [["Distancia media entre relaves", formatDistanceKm(dominantStats.meanKm)], ["Distancia mínima entre relaves", formatDistanceKm(dominantStats.minKm)]]) : "";
  return `<section class="panel group-section"><h2>Descriptores geométricos</h2><dl class="details analysis-summary">${rows([["Radio del clúster", formatDistanceKm(result.radiusKm)]]).replace(/^<dl class="details">|<\/dl>$/g, "")}</dl>${renderAnalysisCategory(`Relaves seleccionados · ${selectedRelaves.length}`, [["Distancia media entre relaves", formatDistanceKm(selectedStats.meanKm)], ["Distancia mínima entre relaves", formatDistanceKm(selectedStats.minKm)]])}${dominantPanel}</section>`;
}
function renderSpatialIndicators(result) {
  const { selectedRelaves, dominant, dominantRelaves } = relaveContext(result);
  const selectedStats = pointDistanceStats(selectedRelaves);
  const dominantStats = pointDistanceStats(dominantRelaves);
  const dominantPanel = dominant ? renderAnalysisCategory(`Recurso dominante · ${dominant.resource} · ${dominantRelaves.length} relaves`, [["Distancia media desde el punto consultado", formatDistanceKm(dominantStats.meanKm)]]) : "";
  return `<section class="panel group-section"><h2>Indicadores de relación espacial</h2><dl class="details analysis-summary">${rows([["Tipo de relación","Cercanía al punto consultado"]]).replace(/^<dl class="details">|<\/dl>$/g, "")}</dl>${renderAnalysisCategory(`Relaves seleccionados · ${selectedRelaves.length}`, [["Distancia media desde el punto consultado", formatDistanceKm(selectedStats.meanKm)], ["Distancia mínima al punto consultado", formatDistanceKm(selectedStats.minKm)]])}${dominantPanel}</section>`;
}
function renderRelaveMetadata(result) {
  const selectedRelaves = Array.isArray(result?.selectedRelaves) ? result.selectedRelaves : (result.items || []);
  const intro = "Relaves más cercanos usados para construir el clúster base.";
  const metadataItems = selectedRelaves.map((r,idx)=>renderRelaveMetadataItem(r,idx)).join("");
  return `<section class="panel group-section"><div class="group-header"><div><h2>Metadata de relaves</h2><p class="placeholder-text">${intro}</p></div><span class="status-pill">${selectedRelaves.length} relaves más cercanos</span></div><div class="metadata-project-list metadata-relave-list">${metadataItems || '<p>Sin relaves seleccionados disponibles.</p>'}</div></section>`;
}
function renderRelaves(result,cfg,meta){
  if(!shouldRenderRelaves(result)) return "";
  return `<div class="relaves-report-grid">${safeRenderPanel(()=>renderRelatedRelaves(result), "relacionados", result)}${safeRenderPanel(()=>renderGeometryDescriptors(result), "geometria", result)}${safeRenderPanel(()=>renderSpatialIndicators(result), "indicadores", result)}${safeRenderPanel(()=>renderRelaveMetadata(result), "metadata", result)}${GEOQUERY_DEBUG ? renderMetaPanel(meta) : ""}</div>`;
}
function renderZonas(result,cfg,meta){
  if(result.status!=="resolved") return "";
  const z=result.items[0];
  const label=result.relation==="intersects"?"Dentro de zona":"Zona más cercana";
  const distanceLabel = result.relation==="intersects" ? "Dentro de zona" : formatDistance(result.distanceKm);
  return `<div class="zonas-report-grid"><section class="panel group-section"><div class="group-header"><div><h2>Feature relacionada</h2><p class="placeholder-text">${escapeHtml(cfg.nombre_largo || cfg.nombre || "Zona saturada o latente")}</p></div><span class="status-pill">${label}</span></div>${rows([["Nombre",z.name],["Condición",z.condition],["Contaminante",z.pollutant],["Distancia",distanceLabel]])}</section><section class="panel group-section"><h2>Descriptores geométricos</h2>${rows([["Relación espacial",result.relation==="intersects"?"Intersección con el punto consultado":"Zona más cercana al punto consultado"],["Superficie oficial",z.officialArea],["Región CUT",z.regionCode]])}</section><section class="panel group-section"><h2>Metadata normativa</h2>${rows([["Saturado",z.saturatedValue],["Latente",z.latentValue],["Decreto",z.decree]])}${z.link?`<p><a href="${escapeHtml(z.link)}" target="_blank" rel="noopener">Ver enlace normativo</a></p>`:""}</section><section class="panel group-section"><h2>Indicadores de relación espacial</h2>${rows([["Tipo de relación",label],["Distancia al perímetro",distanceLabel]])}</section>${GEOQUERY_DEBUG ? renderMetaPanel(meta) : ""}</div>`;
}
function renderMetaPanel(meta){ return `<section class="panel group-section"><h2>Metadata técnica</h2>${rows([["Features cargadas",meta.loaded],["Features en viewport original",meta.inViewport],["Universo",meta.universe],["Fuente viewport",meta.viewportSource]])}</section>`; }

  return Object.freeze({
    renderRelaves,
    renderZonas
  });
});
