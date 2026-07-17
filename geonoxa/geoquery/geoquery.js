const GEOQUERY_BASE_URL = new URL("../capas_geoquery/", window.location.href);
const caches = { json: new Map() };
const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GEOQUERY_DEBUG = false;

function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c])); }
function escapeXml(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&apos;",'"':"&quot;"}[c])); }
function safeCdata(v) { return String(v ?? "").replace(/]]>/g, "]]]]><![CDATA[>"); }
function num(params, key) { const v = Number(params.get(key)); return Number.isFinite(v) ? v : null; }
function validLatLon(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
function dms(value, type) { const a=Math.abs(value); let d=Math.floor(a), mf=(a-d)*60, m=Math.floor(mf), s=Number(((mf-m)*60).toFixed(2)); if(s>=60){s=0;m++} if(m>=60){m=0;d++} return `${d}° ${m}' ${s.toFixed(2)}" ${type==="lat"?(value>=0?"N":"S"):(value>=0?"E":"W")}`; }
function field(props, names) { for (const n of names || []) { const v = props?.[n]; if (v !== null && v !== undefined && String(v).trim() !== "") return v; } return null; }
function normText(v) { return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatDistance(km) { return !Number.isFinite(km) ? "—" : km < 1 ? `${fmt.format(km * 1000)} m` : `${fmt.format(km)} km`; }
function formatDistanceKm(km) { return Number.isFinite(km) ? `${fmtKm.format(km)} km` : "N/D"; }
function formatAreaM2(value) { const n = Number(value); return Number.isFinite(n) ? `${fmt.format(n)} m²` : null; }
function cleanText(v) { const text = String(v ?? "").replace(/\s+/g, " ").trim(); return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null; }
function displayRelaveTitle(r) { return cleanText(r.siteName) || cleanText(r.company) || cleanText(r.idRelave) || "Relave sin nombre informado"; }
function rows(items) { return `<dl class="details">${items.filter(([,v])=>cleanText(v)).map(([k,v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`; }
async function fetchJson(url) { const href = url.toString(); if (!caches.json.has(href)) caches.json.set(href, fetch(href, {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(`${r.status} ${r.url}`); return r.json(); })); return caches.json.get(href); }
function safeLayerFile(file) { return typeof file === "string" && file.trim() && !file.startsWith("/") && !/^[a-z][\w+.-]*:/i.test(file) && !file.split(/[\\/]+/).includes(".."); }
function getGroupBase(entry) { return new URL(`${entry.carpeta}/`, GEOQUERY_BASE_URL); }

let isGeneratingPDF = false;
let geoQueryReady = false;

function getPDFButtons() {
  return [...document.querySelectorAll('[data-pdf-button="true"], .download-button')].filter(button => button.dataset.pdfButton === "true" || /PDF/i.test(button.textContent));
}

function setPDFButtonsReady(ready) {
  getPDFButtons().forEach(button => {
    button.disabled = !ready;
    button.title = ready ? "Exportar PDF GeoQuery" : "Disponible cuando exista análisis territorial.";
  });
}

function installGeoQueryPDFButtons() {
  getPDFButtons().forEach(button => {
    if (button.dataset.pdfBound === "1") return;
    button.addEventListener("click", exportGeoQueryToPDF);
    button.dataset.pdfBound = "1";
  });
  setPDFButtonsReady(Boolean(window.geoQueryState?.exportState?.pdfEnabled));
}

function restorePDFButton(button, originalText) {
  if (!button) return;
  button.textContent = originalText || "Exportar PDF";
  button.disabled = !geoQueryReady;
}

function sanitizePDFFileName(value) {
  return String(value ?? "").replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
}

function buildPDFFileName() {
  const state = window.geoQueryState || {};
  const date = new Date().toISOString().slice(0, 10);
  const lat = Number(state.lat ?? queryLat);
  const lon = Number(state.lon ?? queryLon);
  const parts = ["GeoNOXA", "Reporte"];
  if (Number.isFinite(lat) && Number.isFinite(lon)) parts.push(lat.toFixed(6), lon.toFixed(6));
  parts.push(date);
  return `${sanitizePDFFileName(parts.join("_"))}.pdf`;
}

const PDF_EXPORT_WIDTH = 794;
const PDF_EXPORT_HEIGHT = 1123;
const PDF_PAGE_MARGIN = 45;
const PDF_HEADER_HEIGHT = 42;
const PDF_FOOTER_HEIGHT = 38;
const PDF_CONTENT_WIDTH = PDF_EXPORT_WIDTH - PDF_PAGE_MARGIN * 2;
const PDF_CONTENT_HEIGHT = PDF_EXPORT_HEIGHT - PDF_HEADER_HEIGHT - PDF_FOOTER_HEIGHT;

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function getGeoQueryReportElement() {
  return document.querySelector("#geoquery-report");
}

function createPDFExportStage() {
  const stage = document.createElement("div");
  stage.id = "pdf-export-stage";
  stage.className = "pdf-export-stage";
  document.body.appendChild(stage);
  return stage;
}

function expandPDFSections(container) {
  container.querySelectorAll("[hidden]").forEach(element => element.removeAttribute("hidden"));
  container.querySelectorAll(".collapsed, .collapse, .hidden, [aria-expanded]").forEach(element => {
    element.classList.remove("collapsed", "collapse", "hidden");
    if (element.hasAttribute("aria-expanded")) element.setAttribute("aria-expanded", "true");
    element.style.display = "";
    element.style.visibility = "visible";
    element.style.maxHeight = "none";
    element.style.height = "auto";
    element.style.overflow = "visible";
    element.style.opacity = "1";
  });
}

function removePDFExcludedElements(container) {
  container.querySelectorAll('.pdf-no-export, [data-pdf-export="false"], [role="tooltip"], .leaflet-control-container, .map-toggle, .map-touch-hint').forEach(element => element.remove());
  container.querySelectorAll("button").forEach(button => {
    if (!button.closest("table, .details")) button.remove();
  });
  container.querySelectorAll("a").forEach(anchor => {
    if (/volver|descargar|exportar/i.test(anchor.textContent || "")) anchor.remove();
  });
}

function normalizePDFLayout(container) {
  container.querySelectorAll("*").forEach(element => {
    element.style.transform = "none";
    element.style.transition = "none";
    element.style.animation = "none";
    if (["fixed", "sticky"].includes(getComputedStyle(element).position)) element.style.position = "relative";
    element.style.maxWidth = "100%";
    element.style.minWidth = "0";
  });
}

function createNormalizedReportClone(sourceElement) {
  const clone = sourceElement.cloneNode(true);
  clone.id = "geoquery-report-pdf-clone";
  clone.classList.add("pdf-export-mode");
  expandPDFSections(clone);
  removePDFExcludedElements(clone);
  normalizePDFLayout(clone);
  return clone;
}

async function replaceCanvasWithImages(sourceContainer, clonedContainer) {
  const sourceCanvas = [...sourceContainer.querySelectorAll("canvas")];
  const clonedCanvas = [...clonedContainer.querySelectorAll("canvas")];
  await Promise.all(sourceCanvas.map(async (canvas, index) => {
    const target = clonedCanvas[index];
    if (!target) return;
    try {
      const image = document.createElement("img");
      image.src = canvas.toDataURL("image/png");
      image.className = target.className;
      image.alt = target.getAttribute("aria-label") || "Gráfico del reporte";
      image.style.width = `${canvas.getBoundingClientRect().width || canvas.width}px`;
      image.style.height = "auto";
      await waitForImageElement(image);
      target.replaceWith(image);
    } catch (error) {
      console.warn("[GeoQuery PDF] No fue posible convertir un canvas a imagen.", error);
    }
  }));
}

function waitForImageElement(img, timeout = 8000) {
  if (img.complete && img.naturalWidth !== 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, timeout);
    const done = () => { clearTimeout(timer); resolve(); };
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  });
}

async function waitForImages(container, timeout = 8000) {
  const images = [...container.querySelectorAll("img")];
  await Promise.race([
    Promise.all(images.map(img => waitForImageElement(img, timeout))),
    new Promise(resolve => setTimeout(resolve, timeout))
  ]);
  if (document.fonts?.ready) await document.fonts.ready;
}

async function waitForLeafletTiles(mapInstance, timeout = 8000) {
  const mapElement = mapInstance?.getContainer?.();
  if (!mapElement) return;
  const images = [...mapElement.querySelectorAll(".leaflet-tile")];
  const pending = images.filter(img => !img.complete || img.naturalWidth === 0);
  if (!pending.length) return;
  await Promise.race([
    Promise.all(pending.map(img => waitForImageElement(img, timeout))),
    new Promise(resolve => setTimeout(() => { console.warn("[GeoQuery PDF] Timeout esperando teselas Leaflet."); resolve(); }, timeout))
  ]);
}

async function createLeafletMapSnapshot(mapInstance, mapElement) {
  if (!mapInstance || !mapElement) return null;
  const hidden = [];
  try {
    mapInstance.invalidateSize({ pan: false, animate: false });
    await nextFrame();
    await waitForLeafletTiles(mapInstance);
    mapElement.querySelectorAll(".leaflet-control-container, .map-toggle, .map-touch-hint").forEach(element => {
      hidden.push([element, element.style.visibility]);
      element.style.visibility = "hidden";
    });
    const canvas = await window.html2canvas(mapElement, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: PDF_EXPORT_WIDTH
    });
    const image = document.createElement("img");
    image.className = "pdf-map-snapshot";
    image.alt = "Mapa de ubicación del punto consultado";
    image.src = canvas.toDataURL("image/png");
    image.style.width = "100%";
    image.style.height = "auto";
    await waitForImageElement(image);
    return image;
  } catch (error) {
    console.warn("[GeoQuery PDF] Falló la captura del mapa Leaflet.", error);
    const fallback = document.createElement("div");
    fallback.className = "pdf-map-fallback";
    fallback.textContent = "Mapa no disponible en la exportación PDF por restricciones de carga o CORS de teselas.";
    return fallback;
  } finally {
    hidden.forEach(([element, visibility]) => { element.style.visibility = visibility; });
  }
}

async function replaceMapWithSnapshot(source, clone) {
  const sourceMap = source.querySelector("#geoquery-map");
  const clonedMap = clone.querySelector("#geoquery-map");
  if (!sourceMap || !clonedMap) return;
  const snapshot = await createLeafletMapSnapshot(window.geoQueryLeafletMap, sourceMap);
  if (snapshot) clonedMap.replaceWith(snapshot);
}

function collectPDFBlocks(container) {
  const direct = [...container.children];
  const blocks = [];
  direct.forEach(child => {
    if (child.id === "geoquery-groups" && child.children.length) blocks.push(...child.children);
    else blocks.push(child);
  });
  return blocks;
}

function createPDFPage() {
  const page = document.createElement("div");
  page.className = "pdf-page";
  const content = document.createElement("div");
  content.className = "pdf-page-content";
  page.appendChild(content);
  return { page, content };
}

function appendPage(stage, pages) {
  const page = createPDFPage();
  stage.appendChild(page.page);
  pages.push(page.page);
  return page;
}

function splitOversizedBlock(block, page, stage, pages) {
  const shell = block.cloneNode(false);
  const children = [...block.children];
  if (!children.length) {
    page.content.appendChild(block);
    return page;
  }
  page.content.appendChild(shell);
  children.forEach(child => {
    shell.appendChild(child);
    if (page.content.scrollHeight > PDF_CONTENT_HEIGHT && shell.children.length > 1) {
      shell.removeChild(child);
      page = appendPage(stage, pages);
      const nextShell = block.cloneNode(false);
      nextShell.appendChild(child);
      page.content.appendChild(nextShell);
    } else if (page.content.scrollHeight > PDF_CONTENT_HEIGHT && shell.children.length === 1) {
      shell.removeChild(child);
      if (!shell.children.length) shell.remove();
      page = appendPage(stage, pages);
      page.content.appendChild(child);
      if (page.content.scrollHeight > PDF_CONTENT_HEIGHT && child.children.length) {
        page.content.removeChild(child);
        page = splitOversizedBlock(child, page, stage, pages);
      }
    }
  });
  return page;
}

function paginatePDFBlocks(blocks, stage) {
  const pages = [];
  let current = appendPage(stage, pages);
  blocks.forEach(block => {
    current.content.appendChild(block);
    if (current.content.scrollHeight <= PDF_CONTENT_HEIGHT) return;
    current.content.removeChild(block);
    if (block.scrollHeight > PDF_CONTENT_HEIGHT || block.dataset.pdfSplittable === "true") {
      current = splitOversizedBlock(block, current, stage, pages);
      return;
    }
    current = appendPage(stage, pages);
    current.content.appendChild(block);
  });
  return pages.filter(page => page.querySelector(".pdf-page-content")?.children.length);
}

function addPDFHeaderAndFooter(pdf, pageIndex, totalPages) {
  const date = new Date().toLocaleDateString("es-CL");
  pdf.setFontSize(8);
  pdf.setTextColor(75, 85, 99);
  pdf.text("GeoNOXA | Reporte del punto consultado", 12, 8);
  pdf.text(`Fecha de generación: ${date}`, 12, 292);
  pdf.text(`Página ${pageIndex} de ${totalPages}`, 182, 292);
}

async function renderPDFPages(pageElements) {
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDF || typeof window.html2canvas !== "function") throw new Error("jsPDF/html2canvas no están disponibles.");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const scale = window.innerWidth < 768 ? 1.5 : Math.min(2, window.devicePixelRatio || 1.5);
  for (let index = 0; index < pageElements.length; index += 1) {
    const page = pageElements[index];
    await waitForImages(page);
    const canvas = await window.html2canvas(page, { scale, useCORS: true, allowTaint: false, backgroundColor: "#ffffff", logging: false, scrollX: 0, scrollY: 0, windowWidth: PDF_EXPORT_WIDTH });
    if (index > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 210, 297, undefined, "FAST");
    addPDFHeaderAndFooter(pdf, index + 1, pageElements.length);
  }
  return pdf;
}

function cleanupPDFExport(stage) {
  stage?.remove();
}

async function exportGeoQueryToPDF(event) {
  if (isGeneratingPDF) return;
  const button = event?.currentTarget || getPDFButtons()[0];
  const originalText = button?.textContent || "Exportar PDF";
  let stage = null;
  try {
    if (!geoQueryReady || !window.geoQueryState?.exportState?.pdfEnabled) {
      alert("El reporte GeoQuery aún no está listo para exportar.");
      return;
    }
    if (typeof window.html2canvas !== "function" || !(window.jspdf?.jsPDF || window.jsPDF)) throw new Error("Las bibliotecas PDF no están disponibles.");
    isGeneratingPDF = true;
    getPDFButtons().forEach(pdfButton => { pdfButton.disabled = true; pdfButton.textContent = "Generando PDF…"; });
    const reportElement = getGeoQueryReportElement();
    if (!reportElement) throw new Error("No se encontró el contenedor principal #geoquery-report.");
    stage = createPDFExportStage();
    const clone = createNormalizedReportClone(reportElement);
    stage.appendChild(clone);
    await replaceCanvasWithImages(reportElement, clone);
    await replaceMapWithSnapshot(reportElement, clone);
    await waitForImages(clone);
    const blocks = collectPDFBlocks(clone);
    const pages = paginatePDFBlocks(blocks, stage);
    clone.remove();
    await nextFrame();
    const pdf = await renderPDFPages(pages);
    pdf.save(buildPDFFileName());
  } catch (error) {
    console.error("[GeoQuery PDF]", error);
    alert("No fue posible generar el PDF. Intente nuevamente.");
  } finally {
    cleanupPDFExport(stage);
    isGeneratingPDF = false;
    getPDFButtons().forEach(pdfButton => restorePDFButton(pdfButton, originalText));
    setPDFButtonsReady(geoQueryReady);
  }
}

document.addEventListener("DOMContentLoaded", installGeoQueryPDFButtons);

function parseViewport(params) { const west=num(params,"viewWest"), south=num(params,"viewSouth"), east=num(params,"viewEast"), north=num(params,"viewNorth"); if ([west,south,east,north].every(Number.isFinite) && west < east && south < north) return { west,south,east,north,bbox:[west,south,east,north], polygon:turf.bboxPolygon([west,south,east,north]), source:"url_bbox"}; const lat=num(params,"viewLat")??num(params,"mapCenterLat")??num(params,"lat"), lon=num(params,"viewLon")??num(params,"mapCenterLon")??num(params,"lon"), z=num(params,"zoom")??num(params,"mapZoom")??14; if(!validLatLon(lat,lon)) return null; const scale=256*2**Math.max(0,Math.min(20,z)), lonPx=360/scale, latPx=lonPx/Math.max(.15,Math.cos(lat*Math.PI/180)); return {west:lon-640*lonPx,east:lon+640*lonPx,south:lat-360*latPx,north:lat+360*latPx,source:"fallback_center_zoom"}; }
function featureIntersectsViewport(feature, viewport) { if (!viewport || !feature?.geometry) return false; try { return turf.booleanIntersects(feature, viewport.polygon || turf.bboxPolygon([viewport.west,viewport.south,viewport.east,viewport.north])); } catch { try { const b=turf.bbox(feature); return !(b[2] < viewport.west || b[0] > viewport.east || b[3] < viewport.south || b[1] > viewport.north); } catch { return false; } } }
function pointCoords(feature, props, cfg) { const c = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null; if (Array.isArray(c) && validLatLon(Number(c[1]), Number(c[0]))) return [Number(c[0]), Number(c[1])]; const lon = Number(field(props, cfg.campos?.longitud)); const lat = Number(field(props, cfg.campos?.latitud)); return validLatLon(lat, lon) ? [lon, lat] : null; }
function normalizeRelave(feature, layer, cfg, i) { const p=feature.properties||{}, c=pointCoords(feature,p,cfg); const res=field(p,cfg.campos.recurso); return {groupId:"relaves",sourceFile:layer.archivo,layerId:layer.id,featureId:field(p,cfg.campos.id)??`${layer.id}-${i}`,idRelave:field(p,cfg.campos.id),company:field(p,cfg.campos.empresa),siteName:field(p,cfg.campos.faena),depositType:field(p,cfg.campos.tipo_deposito),resourceOriginal:res,resourceNormalized:normText(res),commune:field(p,cfg.campos.comuna),areaM2:field(p,cfg.campos.area_m2),constructionMethod:field(p,cfg.campos.metodo_constructivo),coordinates:c,originalProperties:p,feature:{type:"Feature",properties:p,geometry:feature.geometry}}; }
function pollutant(p,cfg){ const rule=cfg.regla_contaminante||{}, ignore=(rule.ignorar||[]).map(v=>v===null?null:normText(v)); for(const key of [rule.principal,rule.fallback]) { const v=p?.[key]; if(v!==null&&v!==undefined&&!ignore.includes(normText(v))) return v; } return "Sin contaminante informado"; }
function normalizeZona(feature, layer, cfg, i) { const p=feature.properties||{}; return {groupId:"zonas",sourceFile:layer.archivo,layerId:layer.id,featureId:field(p,cfg.campos.id)??`${layer.id}-${i}`,name:field(p,cfg.campos.nombre),condition:field(p,cfg.campos.condicion),pollutant:pollutant(p,cfg),saturatedValue:field(p,cfg.campos.saturado),latentValue:field(p,cfg.campos.latente),decree:field(p,cfg.campos.decreto),link:field(p,cfg.campos.link),regionCode:field(p,cfg.campos.region),officialArea:field(p,cfg.campos.superficie),originalProperties:p,feature:{type:"Feature",properties:p,geometry:feature.geometry}}; }
function nearestOnBoundary(feature, queryPoint) { const line = turf.polygonToLine(feature); const snap = turf.nearestPointOnLine(line, queryPoint, {units:"kilometers"}); return { snap, distanceKm: snap.properties.dist }; }
function buildRelavesResult(selectedRelaves, rules) {
  const clusterRadiusKm = selectedRelaves.at(-1)?.distanceKm ?? null;
  const dominant = dominantResource(selectedRelaves);
  selectedRelaves.forEach((relave, index) => { relave.rank = relave.rank || index + 1; relave.isDominantResource = Boolean(dominant && normText(cleanText(relave.resourceOriginal)) === normText(dominant.resource)); });
  const dominantResourceRelavesList = dominantResourceRelaves(selectedRelaves, dominant);
  const pointRelationStats = pointDistanceStats(selectedRelaves);
  const pairwiseStats = pairDistanceStats(selectedRelaves);
  const dominantPointRelationStats = pointDistanceStats(dominantResourceRelavesList);
  const dominantPairwiseStats = pairDistanceStats(dominantResourceRelavesList);
  return {
    groupId: "relaves",
    status: selectedRelaves.length > 0 ? "resolved" : "empty",
    relation: selectedRelaves.length > 0 ? "nearest_n" : "none",
    selectedRelaves,
    selectedCount: selectedRelaves.length,
    clusterRadiusKm,
    dominantResource: dominant?.resource || null,
    dominantResourceCount: dominant?.count || 0,
    dominantResourcePercentage: dominant && selectedRelaves.length ? (dominant.count / selectedRelaves.length) * 100 : null,
    dominantResourceRelaves: dominantResourceRelavesList,
    pointRelationStats,
    pairwiseStats,
    dominantPointRelationStats,
    dominantPairwiseStats,
    sourceFile: selectedRelaves[0]?.sourceFile || rules?.capas?.find(layer => layer?.activo)?.archivo || null,
    items: selectedRelaves,
    distanceKm: pointRelationStats.minKm,
    radiusKm: clusterRadiusKm,
    error: null
  };
}
function analyzeRelaves(items, queryPoint, rules) { const max=rules.regla_busqueda?.cantidad_maxima || 10; const ranked=items.filter(x=>x.coordinates).map(x=>({...x,distanceKm:turf.distance(queryPoint,turf.point(x.coordinates),{units:"kilometers"})})).sort((a,b)=>a.distanceKm-b.distanceKm).slice(0,max); return buildRelavesResult(ranked, rules); }
function analyzeZonas(items, queryPoint) { const containing=[]; for(const item of items){ try{ if(turf.booleanPointInPolygon(queryPoint,item.feature)) containing.push(item); }catch{} } if(containing.length) return {groupId:"zonas",status:"resolved",relation:"intersects",relationType:"intersects",items:containing,relatedFeature:containing[0]?.feature,distanceKm:0,minimumDistanceKm:null}; let nearest=null; for(const item of items){ try{ const n=nearestOnBoundary(item.feature,queryPoint); if(!nearest||n.distanceKm<nearest.distanceKm) nearest={...item,...n}; }catch{} } return nearest ? {groupId:"zonas",status:"resolved",relation:"nearest",relationType:"nearest",items:[nearest],relatedFeature:nearest.feature,distanceKm:nearest.distanceKm,minimumDistanceKm:nearest.distanceKm,nearestPoint:nearest.snap} : {groupId:"zonas",status:"empty",relation:"none",relationType:"none",items:[]}; }
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
function dominantResource(items) {
  const counts = new Map();
  for (const item of items) {
    const resource = cleanText(item.resourceOriginal);
    if (!resource) continue;
    const key = normText(resource);
    const current = counts.get(key) || { resource, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  let best = null;
  for (const value of counts.values()) if (!best || value.count > best.count) best = value;
  return best;
}
function dominantResourceRelaves(items, dominant) {
  if (!dominant) return [];
  const key = normText(dominant.resource);
  return items.filter(item => normText(cleanText(item.resourceOriginal)) === key);
}
function mean(values) { return values.length ? values.reduce((a,b)=>a+b,0) / values.length : null; }
function pairDistanceStats(items) {
  const distances = [];
  for (let i = 0; i < items.length - 1; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (items[i].coordinates && items[j].coordinates) distances.push(turf.distance(turf.point(items[i].coordinates), turf.point(items[j].coordinates), {units:"kilometers"}));
    }
  }
  return { meanKm: mean(distances), minKm: distances.length ? Math.min(...distances) : null };
}
function pointDistanceStats(items) {
  const distances = items.map(item => item.distanceKm).filter(Number.isFinite);
  return { meanKm: mean(distances), minKm: distances.length ? Math.min(...distances) : null };
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

function setupMobileMapGesture(map, mapEl) {
  if (!mapEl) return;
  const isTouchDevice = window.matchMedia?.("(pointer: coarse)")?.matches || navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;
  map.dragging.disable();
  const hint = document.createElement("div");
  hint.className = "map-touch-hint";
  hint.textContent = "Usa dos dedos para mover el mapa";
  mapEl.appendChild(hint);
  let hintTimer = null;
  function showHint() { clearTimeout(hintTimer); hint.classList.add("visible"); hintTimer = setTimeout(() => hint.classList.remove("visible"), 1400); }
  mapEl.addEventListener("touchstart", (event) => { if (event.touches.length >= 2) { map.dragging.enable(); hint.classList.remove("visible"); } else { map.dragging.disable(); showHint(); } }, { passive: true });
  mapEl.addEventListener("touchmove", (event) => { if (event.touches.length >= 2) map.dragging.enable(); else map.dragging.disable(); }, { passive: true });
  mapEl.addEventListener("touchend", (event) => { if (event.touches.length < 2) map.dragging.disable(); }, { passive: true });
  mapEl.addEventListener("touchcancel", () => map.dragging.disable(), { passive: true });
}


function isPresentValue(value) { if (value === null || value === undefined) return false; if (typeof value === "number") return Number.isFinite(value); if (typeof value === "object") return false; const text = String(value).trim(); return text !== "" && !["undefined", "null", "nan", "N/D", "—"].includes(text.toLowerCase()); }
function htmlTable(rows) { return rows.length ? `<table>${rows.join("")}</table>` : ""; }
function appendHtmlRow(target, label, value, options = {}) { if (!isPresentValue(value)) return; const htmlValue = options.html ? String(value) : escapeHtml(value); target.push(`<tr><th>${escapeHtml(label)}</th><td>${htmlValue}</td></tr>`); }
function kmlData(entries) { const out = {}; entries.forEach(([name, displayName, value]) => { if (isPresentValue(value)) out[displayName || name] = value; }); return out; }
function validHttpUrl(value) { const text = cleanText(value); return text && /^https?:\/\//i.test(text) ? text : null; }
function formatPercent(value) { return Number.isFinite(value) ? `${fmt.format(value)}%` : null; }
function formatOfficialArea(value) { return cleanText(value); }
function relationLabel(result) { return (result?.relationType || result?.relation) === "intersects" ? "Punto dentro de la zona relacionada" : "Zona más cercana al punto consultado"; }
function relaveTitle(relave) { return cleanText(relave?.siteName) || cleanText(relave?.company) || cleanText(relave?.idRelave) || "Relave relacionado"; }
function buildGeoNoxaRelaveKmlDescription(relave, relavesResult) {
  const total = relavesResult?.selectedRelaves?.length || relavesResult?.items?.length || null;
  const rowsId = [];
  appendHtmlRow(rowsId, "Empresa", relave.company || relave.originalProperties?.empresa);
  appendHtmlRow(rowsId, "Faena", relave.siteName || relave.originalProperties?.faena);
  appendHtmlRow(rowsId, "Recurso", relave.resourceOriginal || relave.originalProperties?.recurso);
  appendHtmlRow(rowsId, "Tipo de depósito", relave.depositType || relave.originalProperties?.tipo_deposito);
  appendHtmlRow(rowsId, "Comuna", relave.commune || relave.originalProperties?.comuna);
  appendHtmlRow(rowsId, "Método constructivo", relave.constructionMethod || relave.originalProperties?.metodo_constructivo);
  appendHtmlRow(rowsId, "Área", formatAreaM2(relave.areaM2 || relave.originalProperties?.shape_area_m2));
  appendHtmlRow(rowsId, "ID relave", relave.idRelave || relave.originalProperties?.id_relave);
  const rowsSpatial = [];
  appendHtmlRow(rowsSpatial, "Ranking", `${relave.rank || ""}${total ? ` de ${total}` : ""}`);
  appendHtmlRow(rowsSpatial, "Distancia al punto consultado", formatDistanceKm(relave.distanceKm));
  appendHtmlRow(rowsSpatial, "Recurso dominante", relavesResult?.dominantResource);
  appendHtmlRow(rowsSpatial, "Pertenece al recurso dominante", relave.isDominantResource ? "Sí" : "No");
  appendHtmlRow(rowsSpatial, "Participación del recurso dominante", formatPercent(relavesResult?.dominantResourcePercentage));
  appendHtmlRow(rowsSpatial, "Radio del clúster", formatDistanceKm(relavesResult?.clusterRadiusKm ?? relavesResult?.radiusKm));
  appendHtmlRow(rowsSpatial, "Archivo de origen", relave.sourceFile || relavesResult?.sourceFile);
  return `<h2>${escapeHtml(`${relave.rank || ""}. ${relaveTitle(relave)}`.trim())}</h2>${rowsId.length ? `<h3>Identificación del relave</h3>${htmlTable(rowsId)}` : ""}${rowsSpatial.length ? `<h3>Relación espacial</h3>${htmlTable(rowsSpatial)}` : ""}`;
}
function buildGeoNoxaRelaveExtendedData(relave, relavesResult) {
  return kmlData([["ranking","Ranking",relave.rank],["id_relave","ID relave",relave.idRelave || relave.originalProperties?.id_relave],["faena","Faena",relave.siteName || relave.originalProperties?.faena],["empresa","Empresa",relave.company || relave.originalProperties?.empresa],["recurso","Recurso",relave.resourceOriginal || relave.originalProperties?.recurso],["tipo_deposito","Tipo de depósito",relave.depositType || relave.originalProperties?.tipo_deposito],["comuna","Comuna",relave.commune || relave.originalProperties?.comuna],["metodo_constructivo","Método constructivo",relave.constructionMethod || relave.originalProperties?.metodo_constructivo],["area","Área",formatAreaM2(relave.areaM2 || relave.originalProperties?.shape_area_m2)],["distancia","Distancia al punto consultado",formatDistanceKm(relave.distanceKm)],["recurso_dominante","Recurso dominante",relavesResult?.dominantResource],["pertenece_recurso_dominante","Pertenece al recurso dominante",relave.isDominantResource ? "Sí" : "No"],["archivo_origen","Archivo de origen",relave.sourceFile || relavesResult?.sourceFile]]);
}
function buildGeoNoxaZoneKmlDescription(metadata, result) {
  const env = [];
  appendHtmlRow(env, "Condición", metadata.condition);
  appendHtmlRow(env, "Contaminante", metadata.pollutant);
  appendHtmlRow(env, "Contaminante saturado", metadata.saturatedValue);
  appendHtmlRow(env, "Contaminante latente", metadata.latentValue);
  appendHtmlRow(env, "Código de región", metadata.regionCode);
  appendHtmlRow(env, "Superficie oficial", formatOfficialArea(metadata.officialArea));
  const norm = [];
  appendHtmlRow(norm, "Decreto", metadata.decree);
  const url = validHttpUrl(metadata.link);
  appendHtmlRow(norm, "Enlace", url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir documento normativo</a>` : metadata.link, {html:Boolean(url)});
  const spatial = [];
  appendHtmlRow(spatial, "Tipo de relación", relationLabel(result));
  if ((result?.relationType || result?.relation) === "nearest") appendHtmlRow(spatial, "Distancia mínima al perímetro", formatDistanceKm(result.minimumDistanceKm ?? result.distanceKm));
  appendHtmlRow(spatial, "Archivo de origen", metadata.sourceFile);
  return `<h2>${escapeHtml(metadata.name || "Zona saturada o latente relacionada")}</h2>${env.length ? `<h3>Identificación ambiental</h3>${htmlTable(env)}` : ""}${norm.length ? `<h3>Documento normativo</h3>${htmlTable(norm)}` : ""}<h3>Relación espacial</h3>${htmlTable(spatial)}`;
}
function buildGeoNoxaZoneExtendedData(metadata, result) {
  return kmlData([["identificador","Identificador",metadata.featureId],["nombre_zona","Nombre de zona",metadata.name],["condicion","Condición",metadata.condition],["contaminante","Contaminante utilizado",metadata.pollutant],["contaminante_saturado","Contaminante saturado",metadata.saturatedValue],["contaminante_latente","Contaminante latente",metadata.latentValue],["decreto","Decreto",metadata.decree],["enlace","Enlace",metadata.link],["codigo_regional","Código regional",metadata.regionCode],["superficie_oficial","Superficie oficial",formatOfficialArea(metadata.officialArea)],["tipo_relacion","Tipo de relación",relationLabel(result)],["distancia_minima","Distancia mínima",(result?.relationType || result?.relation) === "nearest" ? formatDistanceKm(result.minimumDistanceKm ?? result.distanceKm) : null],["archivo_origen","Archivo de origen",metadata.sourceFile]]);
}

function buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon){ const sourceParams=new URLSearchParams(window.location.search); const p=new URLSearchParams({from:sourceParams.get("from")==="crossaccess"?"crossaccess":"geoquery",lat:String(lat),lon:String(lon),queryLat:sourceParams.get("queryLat")||String(lat),queryLon:sourceParams.get("queryLon")||String(lon),zoom:String(zoom||sourceParams.get("mapZoom")||14),mapZoom:String(sourceParams.get("mapZoom")||zoom||14),basemap:basemap||"osm"}); const centerLat=sourceParams.get("mapCenterLat")||viewLat, centerLon=sourceParams.get("mapCenterLon")||viewLon; if(Number.isFinite(Number(centerLat))&&Number.isFinite(Number(centerLon))){p.set("viewLat",centerLat);p.set("viewLon",centerLon);p.set("mapCenterLat",centerLat);p.set("mapCenterLon",centerLon)} ["viewWest","viewSouth","viewEast","viewNorth","restoreViewport"].forEach(k=>{const v=sourceParams.get(k); if(v!==null)p.set(k,v)}); return `../index.html?${p}`; }
async function analyzeGroup(entry, queryPoint, viewport){ const base=getGroupBase(entry); const cfg=await fetchJson(new URL(entry.config,GEOQUERY_BASE_URL)); const rules=await fetchJson(new URL(entry.listado_query || `${entry.carpeta}/listado_query.json`, GEOQUERY_BASE_URL)); let loaded=0, normalized=[]; for(const layer of (rules.capas||[]).filter(l=>l.activo && safeLayerFile(l.archivo))){ const gj=await fetchJson(new URL(layer.archivo,base)); const feats=Array.isArray(gj.features)?gj.features:[]; loaded += feats.length; const visible=feats.filter(f=>featureIntersectsViewport(f,viewport)); normalized.push(...visible.map((f,i)=> cfg.id==="relaves"?normalizeRelave(f,layer,cfg,i):normalizeZona(f,layer,cfg,i))); }
 const meta={loaded,inViewport:normalized.length,universe:rules.regla_busqueda?.universo,viewportSource:viewport?.source||"no_disponible"}; const result=cfg.id==="relaves"?analyzeRelaves(normalized,queryPoint,rules):analyzeZonas(normalized,queryPoint,rules); return {entry,cfg,rules,result,meta}; }
async function analyzeGroupSafe(entry, queryPoint, viewport){ try { return await analyzeGroup(entry, queryPoint, viewport); } catch(error) { const id = String(entry.id || entry.carpeta || "grupo").includes("zona") ? "zonas" : "relaves"; console.error(`[GeoNOXA][${id}] No fue posible resolver el grupo`, error); return {entry,cfg:{id,nombre:entry.nombre || id},rules:null,result:{groupId:id,status:"error",relation:"error",items:[],error},meta:{loaded:0,inViewport:0,universe:null,viewportSource:viewport?.source||"no_disponible"}}; } }
function drawResult(map,layers,group){ const cfg=group.cfg, res=group.result; if(res.status!=="resolved") return; const style=cfg.estilo||{}; if(cfg.id==="relaves"){ (res.selectedRelaves || res.items || []).forEach(r=>{ L.circleMarker([r.coordinates[1],r.coordinates[0]],{radius:6,color:style.color||"#ea580c",fillColor:style.fillColor||"#f97316",fillOpacity:.85,weight:2}).bindPopup(`${r.siteName||"Relave"}<br>${formatDistance(r.distanceKm)}`).addTo(layers.results); }); if(Number.isFinite(res.clusterRadiusKm ?? res.radiusKm)&&(res.selectedRelaves || res.items || [])[0]) L.circle([queryLat,queryLon],{radius:(res.clusterRadiusKm ?? res.radiusKm)*1000,color:style.color||"#ea580c",dashArray:"4 8",fill:false,weight:2}).addTo(layers.results); } else if(res.items[0]) { L.geoJSON(res.items[0].feature,{style:{color:style.color||"#7c2d12",fillColor:style.fillColor||"#fb923c",fillOpacity:style.fillOpacity??.25,weight:style.weight||2}}).addTo(layers.results); if(res.nearestPoint){ const c=res.nearestPoint.geometry.coordinates; L.polyline([[queryLat,queryLon],[c[1],c[0]]],{color:"#7c2d12",dashArray:"4 6"}).addTo(layers.results); } } }
let queryLat, queryLon;

function buildGeoNoxaMapExport(relavesResult, zonasResult) {
 const state=window.geoQueryState||{};
 const theme=GeoQueryKmlExporter.themeFor("geonoxa");
 const st=GeoQueryKmlExporter.themedStyle("geonoxa","line",{weight:3,fill:true});
 const labelStyle={...st,kmlTextColor:theme.textColor,kmlHaloColor:null,labelScale:.9,iconScale:0};
 const folders=[{id:"query",name:"Punto consultado"},{id:"cluster",name:"Clúster de relaves"},{id:"relaves",name:"Relaves seleccionados"},{id:"zonas",name:"Zona saturada o latente"},{id:"relations",name:"Relación espacial"},{id:"labels",name:"Etiquetas"}];
 const registry=GeoQueryKmlExporter.createKmlExportRegistry();
 GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-query-point",site:"geonoxa",groupId:"general",folderId:"query",role:"query-point",type:"point",name:"Punto consultado",geometry:{type:"Point",coordinates:[state.lon,state.lat]},style:{...st,fillOpacity:.95,weight:3,labelScale:1},description:`<h2>Punto consultado</h2>${htmlTable([`<tr><th>Latitud</th><td>${escapeHtml(state.lat)}</td></tr>`,`<tr><th>Longitud</th><td>${escapeHtml(state.lon)}</td></tr>`])}`,extendedData:{Latitud:state.lat,Longitud:state.lon,CRS:"WGS84 / EPSG:4326"},visible:true});
 const rels=Array.isArray(relavesResult?.selectedRelaves)?relavesResult.selectedRelaves:(relavesResult?.items||[]);
 if(relavesResult?.status==="resolved"&&rels.length){
  const radius=relavesResult.clusterRadiusKm??relavesResult.radiusKm;
  const selectedStats=pointDistanceStats(rels);
  const resourceCount=new Set(rels.map(r=>cleanText(r.resourceOriginal)).filter(Boolean).map(normText)).size;
  if(Number.isFinite(radius)){
   const circle=turf.circle([state.lon,state.lat],radius,{steps:128,units:"kilometers"});
   const clusterData=kmlData([["tipo","Tipo","Clúster de relaves"],["relaves_seleccionados","Relaves seleccionados",rels.length],["radio_cluster","Radio del clúster",formatDistanceKm(radius)],["recurso_dominante","Recurso dominante",relavesResult.dominantResource],["cantidad_recurso_dominante","Cantidad del recurso dominante",relavesResult.dominantResourceCount],["participacion_recurso_dominante","Participación del recurso dominante",formatPercent(relavesResult.dominantResourcePercentage)],["recursos_diferentes","Recursos diferentes",resourceCount],["distancia_minima","Distancia mínima al punto",formatDistanceKm(selectedStats.minKm)],["distancia_media","Distancia media desde el punto",formatDistanceKm(selectedStats.meanKm)],["distancia_maxima","Distancia máxima al punto",formatDistanceKm(radius)]]);
   GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-cluster-circle",site:"geonoxa",groupId:"cluster",folderId:"cluster",role:"cluster-circle",type:"polygon",name:`Clúster de ${rels.length} relaves`,geometry:circle.geometry,style:st,description:`<h2>Clúster de ${escapeHtml(rels.length)} relaves</h2>${htmlTable(Object.entries(clusterData).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`))}`,extendedData:clusterData,visible:true});
  }
  rels.slice(0,10).forEach((r,i)=>{
   const rank=r.rank || i+1;
   const name=`${rank}. ${relaveTitle(r)}`;
   const description=buildGeoNoxaRelaveKmlDescription({...r,rank},relavesResult);
   const extendedData=buildGeoNoxaRelaveExtendedData({...r,rank},relavesResult);
   const geometry=r.feature?.geometry || {type:"Point",coordinates:r.coordinates};
   GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:`geonoxa-relave-${rank}`,site:"geonoxa",folderId:"relaves",groupId:"relaves",role:"related-point",type:"point",name,geometry,style:{...st,fillOpacity:.85,weight:2},description,extendedData,properties:{...(r.originalProperties||{})},visible:true});
  });
 }
 const z=(zonasResult?.items||[])[0];
 if(zonasResult?.status==="resolved"&&z){
  const zoneNameParts=[cleanText(z.name) || cleanText(z.condition) || "Zona saturada o latente relacionada", cleanText(z.pollutant)].filter(Boolean);
  const zoneName=[...new Set(zoneNameParts)].join(" · ");
  const description=buildGeoNoxaZoneKmlDescription(z,zonasResult);
  const extendedData=buildGeoNoxaZoneExtendedData(z,zonasResult);
  GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-related-zone",site:"geonoxa",folderId:"zonas",groupId:"zonas",role:"related-feature",type:z.feature?.geometry?.type?.toLowerCase(),name:zoneName,geometry:z.feature?.geometry,style:{...st,labelScale:0},description,extendedData,properties:{...(z.originalProperties||z.feature?.properties||{})},visible:true});
  const label=turf.pointOnFeature(z.feature)?.geometry?.coordinates;
  if(label) GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-related-zone-label",site:"geonoxa",folderId:"labels",groupId:"zonas",role:"feature-label",type:"label",name:zoneName,geometry:{type:"Point",coordinates:label},style:labelStyle,description,extendedData,visible:true});
  if((zonasResult.relationType||zonasResult.relation)!=="intersects"&&zonasResult.nearestPoint?.geometry?.coordinates){
   const p=zonasResult.nearestPoint.geometry.coordinates;
   const line=[[state.lon,state.lat],p];
   const mid=turf.midpoint(turf.point(line[0]),turf.point(line[1])).geometry.coordinates;
   const relationData=kmlData([["nombre_zona","Nombre de zona",z.name],["tipo_relacion","Tipo de relación",relationLabel(zonasResult)],["distancia_minima","Distancia mínima",formatDistanceKm(zonasResult.minimumDistanceKm ?? zonasResult.distanceKm)]]);
   GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-zone-nearest-line",site:"geonoxa",groupId:"zonas",folderId:"relations",role:"nearest-line",type:"line",name:"Relación espacial",geometry:{type:"LineString",coordinates:line},style:{...st,weight:3,opacity:1,dashArray:"4 6",labelScale:0},description:`<h2>Distancia mínima al perímetro</h2>${htmlTable(Object.entries(relationData).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`))}`,extendedData:relationData,visible:true});
   const contactData={...relationData,"Coordenadas del punto de contacto":`${fmt.format(p[1])}, ${fmt.format(p[0])}`};
   GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-zone-contact-point",site:"geonoxa",groupId:"zonas",folderId:"relations",role:"contact-point",type:"point",name:"Punto de contacto con perímetro",geometry:{type:"Point",coordinates:p},style:{...st,fillOpacity:1,weight:2,iconType:"contact"},description:`<h2>Punto de contacto con perímetro</h2>${htmlTable(Object.entries(contactData).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`))}`,extendedData:contactData,visible:true});
   GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-zone-distance-label",site:"geonoxa",groupId:"zonas",folderId:"labels",role:"distance-label",type:"label",name:`Distancia mínima: ${formatDistanceKm(zonasResult.minimumDistanceKm ?? zonasResult.distanceKm)}`,geometry:{type:"Point",coordinates:mid},style:labelStyle,description:`<h2>Distancia mínima</h2>${htmlTable(Object.entries(relationData).map(([k,v])=>`<tr><th>${escapeHtml(k)}</th><td>${escapeHtml(v)}</td></tr>`))}`,extendedData:relationData,visible:true});
  }
 }
 const features=Array.from(registry.values()); GeoQueryKmlExporter.validateKmlExportItems(features); return {site:"geonoxa",documentName:"GeoQuery | GeoNOXA",documentDescription:state.executiveSummary,queryPoint:{lat:state.lat,lon:state.lon},folders,features,debugTheme:false};
}
window.geoQueryKmlRefresh = GeoQueryKmlExporter.installGeoQueryKmlButton(() => window.geoQueryState.mapExport);

(async function init(){ const params=new URLSearchParams(location.search); const lat=num(params,"lat"), lon=num(params,"lon"); queryLat=lat; queryLon=lon; const viewLat=num(params,"viewLat")??num(params,"mapCenterLat"), viewLon=num(params,"viewLon")??num(params,"mapCenterLon"), zoom=num(params,"zoom")??num(params,"mapZoom")??14, from=params.get("from"), basemap=(params.get("basemap")||"osm").toLowerCase()==="sat"?"sat":"osm"; const els={back:$("back-link"),status:$("card-status"),groups:$("geoquery-groups"),summary:$("executive-summary"),load:$("groups-load-status")}; if(els.back){ els.back.href=validLatLon(lat,lon)?buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon):"../index.html"; els.back.addEventListener("click",event=>{ if(history.length>1){ event.preventDefault(); history.back(); } }); } [[$("card-lat"),lat?.toFixed(6)],[$("card-lon"),lon?.toFixed(6)],[$("card-site"),(params.get("site")||"geonoxa").toUpperCase()],[$("lat-decimal"),lat?.toFixed(6)],[$("lon-decimal"),lon?.toFixed(6)],[$("lat-dms"),Number.isFinite(lat)?dms(lat,"lat"):"—"],[$("lon-dms"),Number.isFinite(lon)?dms(lon,"lon"):"—"]].forEach(([e,v])=>{if(e)e.textContent=v||"—"}); if(!validLatLon(lat,lon)){ if(els.status) els.status.textContent="Coordenada inválida"; return; }
 const map=L.map("geoquery-map",{tap:true,scrollWheelZoom:true}); window.geoQueryLeafletMap = map; const mapEl=$("geoquery-map"); const osm=L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap",crossOrigin:true}); const sat=L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",{maxZoom:20,attribution:"Tiles &copy; Esri",crossOrigin:true}); let currentBasemap=basemap; function setBasemapButtonActive(type){$("geoquery-osm-btn")?.classList.toggle("active",type==="osm");$("geoquery-sat-btn")?.classList.toggle("active",type==="sat");} function setBasemap(type){if(map.hasLayer(osm))map.removeLayer(osm);if(map.hasLayer(sat))map.removeLayer(sat);currentBasemap=type==="sat"?"sat":"osm";(currentBasemap==="sat"?sat:osm).addTo(map);setBasemapButtonActive(currentBasemap);if(window.geoQueryState){window.geoQueryState.basemap=currentBasemap;window.geoQueryState.mapState.basemap=currentBasemap;window.geoQueryState.queryContext.originalViewport.basemap=currentBasemap;if(els.back)els.back.href=buildReturnUrl(lat,lon,zoom,currentBasemap,viewLat,viewLon);}} const toggle=L.DomUtil.create("div","map-toggle"); toggle.innerHTML=`<button id="geoquery-osm-btn" class="map-toggle-btn" type="button" data-map="osm">OSM</button><button id="geoquery-sat-btn" class="map-toggle-btn" type="button" data-map="sat">SAT</button>`; mapEl?.appendChild(toggle); L.DomEvent.disableClickPropagation(toggle); L.DomEvent.disableScrollPropagation(toggle); toggle.querySelector('[data-map="osm"]')?.addEventListener("click",()=>setBasemap("osm")); toggle.querySelector('[data-map="sat"]')?.addEventListener("click",()=>setBasemap("sat")); setBasemap(currentBasemap); map.setView([lat,lon],zoom); const layers={results:L.featureGroup().addTo(map)}; L.circleMarker([lat,lon],{radius:7,weight:3,color:"#111827",fillColor:"#facc15",fillOpacity:.95}).bindPopup("Punto consultado").addTo(map); L.control.scale({metric:true,imperial:false}).addTo(map); setupMobileMapGesture(map, mapEl);
 const viewport=parseViewport(params); const registry=await fetchJson(new URL("listado.json",GEOQUERY_BASE_URL)); const entries=(registry.grupos||[]).filter(g=>g.activo).sort((a,b)=>(a.orden||0)-(b.orden||0)); const queryPoint=turf.point([lon,lat]); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Inicio análisis"); const groups=await Promise.all(entries.map(e=>analyzeGroupSafe(e,queryPoint,viewport))); const relavesGroup=groups.find(g=>g.cfg.id==="relaves"); const zonasGroup=groups.find(g=>g.cfg.id==="zonas"); const relavesResult=relavesGroup?.result; const zonasResult=zonasGroup?.result; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado relaves calculado", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado zonas calculado", zonasResult); window.geoQueryState={site:"geonoxa",queryContext:{site:"geonoxa",queryPoint:{lat,lon},originalViewport:{centerLat:viewLat,centerLon:viewLon,zoom,west:viewport?.west,south:viewport?.south,east:viewport?.east,north:viewport?.north,basemap:currentBasemap},from},status:"loading",executiveSummary:"",groupResults:{relaves:relavesResult,zonas:zonasResult},mapState:{basemap:currentBasemap,viewportSource:viewport?.source||"sin viewport"},exportState:{pdfEnabled:false,kmlEnabled:false},lat,lon,basemap:currentBasemap,originalViewport:viewport,groups}; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] relavesResult:", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] zonasResult:", zonasResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] groupResults:", window.geoQueryState?.groupResults); groups.forEach(g=>drawResult(map,layers,g)); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderAnalysisResults"); if(els.groups) { els.groups.replaceChildren(); const html=[]; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderRelavesPanels"); if(relavesGroup) { try { html.push(renderRelaves(relavesResult,relavesGroup.cfg,relavesGroup.meta)); } catch(error) { console.error("[GeoNOXA][relaves][render]", error); if(relavesResult) relavesResult.renderError = error; } } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderZonasPanels"); if(zonasGroup) { try { html.push(renderZonas(zonasResult,zonasGroup.cfg,zonasGroup.meta)); } catch(error) { console.error("[GeoNOXA][zonas][render]", error); if(zonasResult) zonasResult.renderError = error; } } els.groups.innerHTML=html.filter(Boolean).join(""); } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Antes de resumen ejecutivo"); const executiveSummary=buildExecutiveSummary({relavesResult,zonasResult}); if(els.summary) els.summary.textContent=executiveSummary; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de deriveOverallStatus"); const overallStatus=deriveOverallStatus(relavesResult,zonasResult); if(GEOQUERY_DEBUG) console.table({relavesStatus:relavesResult?.status,selectedCount:relavesResult?.selectedRelaves?.length,clusterRadiusKm:relavesResult?.clusterRadiusKm,dominantResource:relavesResult?.dominantResource,zonasStatus:zonasResult?.status,overallStatus:overallStatus?.label}); window.geoQueryState.status=overallStatus.code; window.geoQueryState.executiveSummary=executiveSummary; window.geoQueryState.exportState={pdfEnabled:groups.some(g=>g.result.status==="resolved"),kmlEnabled:groups.some(g=>g.result.status==="resolved")}; geoQueryReady=window.geoQueryState.exportState.pdfEnabled; setPDFButtonsReady(geoQueryReady); window.geoQueryState.mapExport=buildGeoNoxaMapExport(relavesResult,zonasResult); window.geoQueryKmlRefresh?.(); if(els.status){ els.status.textContent=overallStatus.label; els.status.classList.toggle("status-ok", overallStatus.code==="resolved"); els.status.classList.toggle("status-warning", overallStatus.code==="partial" || overallStatus.code==="empty"); els.status.classList.toggle("status-error", overallStatus.code==="error"); } if($("detail-status")) $("detail-status").textContent=overallStatus.label; if(layers.results.getLayers().length){ const b=layers.results.getBounds(); if(b.isValid()) map.fitBounds(b.pad(0.2),{maxZoom:14}); } if(els.load) els.load.textContent=GEOQUERY_DEBUG?`${groups.length} grupos cargados desde listado.json; análisis limitado al viewport original (${viewport?.source || "sin viewport"}).`:""; const tech=$("geoquery-technical-metadata"); if(tech) tech.hidden=!GEOQUERY_DEBUG; const downloads=$("geoquery-downloads-panel"); if(downloads) downloads.hidden=!groups.some(g=>g.result.status==="resolved"); setTimeout(()=>map.invalidateSize(),150); })().catch(err=>{ console.error("[GeoNOXA][init]", err); const s=$("card-status"); if(s){s.textContent="Error de análisis";s.classList.add("status-error");} const g=$("geoquery-groups"); if(g) g.innerHTML=`<section class="panel"><p class="placeholder-text">${escapeHtml(err.message)}</p></section>`; });
