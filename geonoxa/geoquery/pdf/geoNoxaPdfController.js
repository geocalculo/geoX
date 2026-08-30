(function () {
  "use strict";

const PDF_DEBUG = false;
const GEO_NOXA_PDF_ENGINE = "geolib-with-legacy-fallback";
const PDF_OVERFLOW_TOLERANCE_PX = 6;
const MAX_PDF_PAGES = 100;
const MAX_PAGINATION_ITERATIONS = 5000;
const MAX_PAGE_REFLOW_ATTEMPTS = 100;

function pdfLog(...args) { if (PDF_DEBUG) console.debug("[GeoNOXA PDF]", ...args); }
function pdfInfo(...args) { if (PDF_DEBUG) console.info("[GeoNOXA PDF]", ...args); }
let currentPDFStep = "";

async function runPDFStep(name, operation) {
  currentPDFStep = name;
  pdfInfo(`Iniciando: ${name}`);
  try {
    const result = await operation();
    pdfInfo(`Completado: ${name}`);
    return result;
  } catch (error) {
    console.error(`[GeoNOXA PDF] Falló: ${name}`, error);
    throw new Error(`${name}: ${error?.message || String(error)}`, { cause: error });
  }
}

function assertPDFDependencies() {
  if (typeof window.html2canvas !== "function") throw new Error("html2canvas no está disponible");
  if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") throw new Error("jsPDF no está disponible");
}

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
    button.addEventListener("click", handleGeoNoxaPDFClick);
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
  const lat = Number(state.lat ?? new URLSearchParams(window.location.search).get("lat"));
  const lon = Number(state.lon ?? new URLSearchParams(window.location.search).get("lon"));
  const parts = ["GeoNOXA", "Reporte"];
  if (Number.isFinite(lat) && Number.isFinite(lon)) parts.push(lat.toFixed(6), lon.toFixed(6));
  parts.push(date);
  return `${sanitizePDFFileName(parts.join("_"))}.pdf`;
}

const PDF_DESKTOP_WIDTH_PX = 1024;
const LETTER_WIDTH_MM = 215.9;
const LETTER_HEIGHT_MM = 279.4;
const PDF_MARGIN_LEFT_MM = 10;
const PDF_MARGIN_RIGHT_MM = 10;
const PDF_MARGIN_TOP_MM = 8;
const PDF_MARGIN_BOTTOM_MM = 8;
const PDF_HEADER_HEIGHT_MM = 9;
const PDF_FOOTER_HEIGHT_MM = 8;
const PDF_CONTENT_TOP_MM = PDF_MARGIN_TOP_MM + PDF_HEADER_HEIGHT_MM;
const PDF_CONTENT_WIDTH_MM = LETTER_WIDTH_MM - PDF_MARGIN_LEFT_MM - PDF_MARGIN_RIGHT_MM;
const PDF_CONTENT_HEIGHT_MM = LETTER_HEIGHT_MM - PDF_MARGIN_TOP_MM - PDF_MARGIN_BOTTOM_MM - PDF_HEADER_HEIGHT_MM - PDF_FOOTER_HEIGHT_MM;
const SOURCE_PX_TO_MM = PDF_CONTENT_WIDTH_MM / PDF_DESKTOP_WIDTH_PX;
const SOURCE_PAGE_HEIGHT_PX = PDF_CONTENT_HEIGHT_MM / SOURCE_PX_TO_MM;
const PDF_EXPORT_WIDTH = PDF_DESKTOP_WIDTH_PX;
const PDF_CONTENT_HEIGHT = SOURCE_PAGE_HEIGHT_PX;

function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function nextAnimationFrames(count = 2) {
  return new Promise(resolve => {
    const step = remaining => {
      if (remaining <= 0) resolve();
      else requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function getGeoQueryReportElement() {
  const reportSource = document.querySelector("#geoquery-report");
  if (!reportSource) throw new Error("No se encontró el contenedor principal #geoquery-report");
  const rect = reportSource.getBoundingClientRect();
  pdfLog("Reporte localizado", { width: rect.width, height: rect.height, children: reportSource.children.length, connected: reportSource.isConnected });
  if (!reportSource.isConnected || rect.width <= 0 || rect.height <= 0 || !reportSource.children.length) {
    throw new Error(`El contenedor #geoquery-report no tiene dimensiones o contenido válido: ${rect.width}x${rect.height}`);
  }
  return reportSource;
}

function createPDFExportStage() {
  const stage = document.createElement("div");
  stage.id = "pdf-export-stage";
  stage.className = "pdf-export-stage";
  stage.style.setProperty("--pdf-desktop-width", `${PDF_DESKTOP_WIDTH_PX}px`);
  stage.style.setProperty("--pdf-source-page-height", `${SOURCE_PAGE_HEIGHT_PX}px`);
  document.documentElement.classList.add("pdf-export-active");
  document.body.classList.add("pdf-export-active");
  pdfLog("Scroll width antes del stage:", { documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth });
  document.body.appendChild(stage);
  return stage;
}

function expandPDFSections(container) {
  container.querySelectorAll('[data-pdf-expand="true"], details').forEach(element => {
    if (element.tagName === "DETAILS") element.open = true;
    element.removeAttribute("hidden");
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
  container.style.width = `${PDF_DESKTOP_WIDTH_PX}px`;
  container.style.minWidth = `${PDF_DESKTOP_WIDTH_PX}px`;
  container.style.maxWidth = `${PDF_DESKTOP_WIDTH_PX}px`;
  container.querySelectorAll("*").forEach(element => {
    element.style.transform = "none";
    element.style.transition = "none";
    element.style.animation = "none";
    if (["fixed", "sticky"].includes(getComputedStyle(element).position)) element.style.position = "relative";
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
  const sourceCanvas = [...sourceContainer.querySelectorAll("canvas")].filter(canvas => !canvas.closest("#geoquery-map"));
  const clonedCanvas = [...clonedContainer.querySelectorAll("canvas")].filter(canvas => !canvas.closest("#geoquery-map"));
  for (let index = 0; index < sourceCanvas.length; index += 1) {
    const canvas = sourceCanvas[index];
    const target = clonedCanvas[index];
    if (!canvas || !target) {
      console.warn("[GeoNOXA PDF] Elemento canvas equivalente no encontrado", { index });
      continue;
    }
    try {
      const image = document.createElement("img");
      image.src = canvas.toDataURL("image/png");
      image.className = target.className;
      image.alt = target.getAttribute("aria-label") || "Gráfico del reporte";
      const rect = canvas.getBoundingClientRect();
      image.style.width = `${rect.width || canvas.width}px`;
      image.style.height = `${rect.height || canvas.height}px`;
      image.style.maxWidth = "100%";
      image.style.objectFit = "contain";
      await waitForImageElement(image);
      target.replaceWith(image);
    } catch (error) {
      console.warn("[GeoNOXA PDF] No fue posible convertir un canvas:", error);
      target.remove();
    }
  }
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
    Promise.allSettled(images.map(img => waitForImageElement(img, timeout))),
    new Promise(resolve => setTimeout(resolve, timeout))
  ]);
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch (error) {
    console.warn("[GeoNOXA PDF] No fue posible esperar las fuentes:", error);
  }
}

async function waitForLeafletTiles(mapInstance, timeout = 8000) {
  const mapElement = mapInstance?.getContainer?.();
  if (!mapElement) return;
  const images = [...mapElement.querySelectorAll(".leaflet-tile")];
  const pending = images.filter(img => !img.complete);
  if (!pending.length) return;
  await Promise.race([
    Promise.allSettled(pending.map(img => waitForImageElement(img, timeout))),
    new Promise(resolve => setTimeout(() => { console.warn("[GeoNOXA PDF] Timeout esperando teselas Leaflet."); resolve(); }, timeout))
  ]);
}

async function createLeafletMapSnapshot(mapInstance, mapElement) {
  if (!mapInstance) throw new Error("No existe la instancia Leaflet");
  if (!mapElement) throw new Error("No existe el contenedor del mapa");
  const hidden = [];
  try {
    mapInstance.invalidateSize({ pan: false, animate: false });
    await nextAnimationFrames(2);
    await waitForLeafletTiles(mapInstance, 8000);
    await nextAnimationFrames(2);
    mapElement.querySelectorAll(".leaflet-control-container, .map-toggle, .map-touch-hint").forEach(element => {
      hidden.push([element, element.style.visibility]);
      element.style.visibility = "hidden";
    });
    const canvas = await window.html2canvas(mapElement, {
      scale: Math.min(2, window.devicePixelRatio || 1.5),
      useCORS: true,
      allowTaint: false,
      backgroundColor: "#ffffff",
      logging: PDF_DEBUG,
      scrollX: 0,
      scrollY: 0,
      windowWidth: PDF_DESKTOP_WIDTH_PX
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
    console.error("[GeoNOXA PDF] Error capturando mapa:", error);
    const fallback = document.createElement("div");
    fallback.className = "pdf-map-fallback";
    const params = new URLSearchParams(window.location.search);
    const lat = Number(window.geoQueryState?.lat ?? params.get("lat") ?? params.get("queryLat"));
    const lon = Number(window.geoQueryState?.lon ?? params.get("lon") ?? params.get("queryLon"));
    fallback.innerHTML = `<strong>Mapa de ubicación</strong><br>Coordenadas: ${Number.isFinite(lat) ? lat.toFixed(6) : "N/D"}, ${Number.isFinite(lon) ? lon.toFixed(6) : "N/D"}<br>El mapa base no pudo incorporarse durante la exportación.`;
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
  const direct = [...container.children].filter(isVisiblePDFElement);
  const blocks = [];
  direct.forEach(child => {
    if (child.id === "geoquery-groups" && child.children.length) blocks.push(...[...child.children].filter(isVisiblePDFElement));
    else blocks.push(child);
  });
  pdfLog("Bloques fuente:", blocks.length);
  return blocks;
}

function createPDFPage() {
  const page = document.createElement("div");
  page.className = "pdf-page";
  page.style.width = `${PDF_DESKTOP_WIDTH_PX}px`;
  page.style.minWidth = `${PDF_DESKTOP_WIDTH_PX}px`;
  page.style.maxWidth = `${PDF_DESKTOP_WIDTH_PX}px`;
  const content = document.createElement("div");
  content.className = "pdf-page-content";
  content.style.width = `${PDF_DESKTOP_WIDTH_PX}px`;
  content.style.minWidth = `${PDF_DESKTOP_WIDTH_PX}px`;
  content.style.maxWidth = `${PDF_DESKTOP_WIDTH_PX}px`;
  content.style.height = `${SOURCE_PAGE_HEIGHT_PX}px`;
  content.style.maxHeight = `${SOURCE_PAGE_HEIGHT_PX}px`;
  page.appendChild(content);
  return { page, content };
}

function appendPage(stage, pages) {
  const page = createPDFPage();
  stage.appendChild(page.page);
  pages.push(page.page);
  return page;
}

function isVisiblePDFElement(element) {
  if (!element || element.classList?.contains("pdf-measure-probe") || element.classList?.contains("pdf-no-export")) return false;
  if (element.matches?.('[data-pdf-export="false"]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().height > 0;
}

function isPDFPageEmpty(pageElement) {
  const content = pageElement.querySelector(".pdf-page-content");
  if (!content) return true;
  return [...content.children].filter(isVisiblePDFElement).length === 0;
}

function removeEmptyPDFPages(pages) {
  const filtered = pages.filter(page => !isPDFPageEmpty(page));
  pages.filter(page => isPDFPageEmpty(page)).forEach(page => page.remove());
  return filtered;
}

function getRemainingPageHeight(page) {
  return SOURCE_PAGE_HEIGHT_PX - page.content.scrollHeight;
}

async function measurePDFBlock(block, page) {
  const probe = block.cloneNode(true);
  probe.classList.add("pdf-measure-probe");
  page.content.appendChild(probe);
  await nextAnimationFrames(1);
  const height = Math.max(probe.getBoundingClientRect().height, probe.scrollHeight);
  probe.remove();
  return height;
}

function isKeepTogetherBlock(block) {
  return block.matches?.('[data-pdf-keep-together], .card, .metadata-project-item, .result-card, .indicator-card, .report-map, .pdf-map-snapshot');
}

function isSplittableBlock(block) {
  return block.matches?.('[data-pdf-splittable], .relaves-report-grid, .zonas-report-grid, .group-grid, .geoquery-secondary-grid') ||
    block.querySelector?.('.metadata-project-list, .analysis-category, .details, table, .metadata-project-item');
}

function getBlockHeader(block) {
  const first = block.firstElementChild;
  if (!first) return null;
  if (first.matches('h1,h2,h3,h4,.group-header')) return first;
  if (first.querySelector?.('h1,h2,h3,h4')) return first;
  return null;
}

function getSplittableChildren(block) {
  const list = block.querySelector(':scope > .metadata-project-list, :scope > .metadata-relave-list');
  if (list) return [...list.children].filter(isVisiblePDFElement);
  const direct = [...block.children].filter(child => child !== getBlockHeader(block) && isVisiblePDFElement(child));
  return direct.length ? direct : [...block.querySelectorAll(':scope > .analysis-category, :scope > .details, :scope > table, :scope > .metadata-project-item')].filter(isVisiblePDFElement);
}

function removePDFIdentityAttributes(element) {
  element.querySelectorAll?.("[id], [data-pdf-node-id], [data-pdf-unit-id]").forEach(node => {
    node.removeAttribute("id");
    node.removeAttribute("data-pdf-node-id");
    node.removeAttribute("data-pdf-unit-id");
  });
  element.removeAttribute("id");
  element.removeAttribute("data-pdf-node-id");
  element.removeAttribute("data-pdf-unit-id");
}

function createContinuationHeader(originalHeader) {
  const clone = originalHeader.cloneNode(true);
  removePDFIdentityAttributes(clone);
  clone.dataset.pdfContinuationHeader = "true";
  clone.dataset.pdfSynthetic = "true";
  const title = clone.querySelector?.('h1,h2,h3,h4') || (clone.matches?.('h1,h2,h3,h4') ? clone : null);
  if (title && !/continuación/i.test(title.textContent)) title.textContent = `${title.textContent.trim()} — continuación`;
  clone.querySelectorAll?.('.placeholder-text, .status-pill').forEach(node => node.remove());
  return clone;
}

async function fitsInPage(node, page) {
  page.content.appendChild(node);
  await nextAnimationFrames(1);
  const fits = page.content.scrollHeight <= SOURCE_PAGE_HEIGHT_PX + 1;
  page.content.removeChild(node);
  return fits;
}

async function ensurePageForNode(node, pages, currentPage, stage) {
  if (await fitsInPage(node, currentPage)) return currentPage;
  if (!isPDFPageEmpty(currentPage.page)) currentPage = appendPage(stage, pages);
  return currentPage;
}

async function splitBlockByChildren(block, pages, currentPage, stage) {
  const header = getBlockHeader(block);
  const sourceList = block.querySelector(':scope > .metadata-project-list, :scope > .metadata-relave-list');
  const items = getSplittableChildren(block);
  if (!items.length) return addBlockToPages(block, pages, currentPage, stage, true);
  const buildShell = (continuation = false) => {
    const shell = block.cloneNode(false);
    if (header) shell.appendChild(continuation ? createContinuationHeader(header) : header.cloneNode(true));
    const target = sourceList ? sourceList.cloneNode(false) : shell;
    if (sourceList) shell.appendChild(target);
    return { shell, target };
  };
  let { shell, target } = buildShell(false);
  currentPage = await ensurePageForNode(shell, pages, currentPage, stage);
  currentPage.content.appendChild(shell);
  for (let index = 0; index < items.length; index += 1) {
    const itemClone = items[index].cloneNode(true);
    target.appendChild(itemClone);
    await nextAnimationFrames(1);
    if (currentPage.content.scrollHeight <= SOURCE_PAGE_HEIGHT_PX + 1) continue;
    target.removeChild(itemClone);
    if (!target.children.length && shell.isConnected) shell.remove();
    currentPage = appendPage(stage, pages);
    ({ shell, target } = buildShell(Boolean(header)));
    currentPage.content.appendChild(shell);
    target.appendChild(itemClone);
    await nextAnimationFrames(1);
    if (currentPage.content.scrollHeight > SOURCE_PAGE_HEIGHT_PX + 1 && itemClone.children.length) {
      target.removeChild(itemClone);
      currentPage = await splitBlockByChildren(itemClone, pages, currentPage, stage);
      ({ shell, target } = buildShell(Boolean(header)));
      if (index < items.length - 1) currentPage.content.appendChild(shell);
    }
  }
  return currentPage;
}

async function splitOversizedBlock(block, pages, currentPage, stage) {
  return splitBlockByChildren(block, pages, currentPage, stage);
}

async function addBlockToPages(block, pages, currentPage, stage, forceWhole = false) {
  const blockHeight = await measurePDFBlock(block, currentPage);
  if (!forceWhole && blockHeight > SOURCE_PAGE_HEIGHT_PX && isSplittableBlock(block)) return splitOversizedBlock(block, pages, currentPage, stage);
  currentPage.content.appendChild(block);
  await nextAnimationFrames(1);
  if (currentPage.content.scrollHeight <= SOURCE_PAGE_HEIGHT_PX + 1) return currentPage;
  currentPage.content.removeChild(block);
  if (!forceWhole && isSplittableBlock(block) && !isKeepTogetherBlock(block)) return splitOversizedBlock(block, pages, currentPage, stage);
  if (!isPDFPageEmpty(currentPage.page)) currentPage = appendPage(stage, pages);
  currentPage.content.appendChild(block);
  await nextAnimationFrames(1);
  if (currentPage.content.scrollHeight > SOURCE_PAGE_HEIGHT_PX + 1 && !forceWhole && isSplittableBlock(block)) {
    currentPage.content.removeChild(block);
    return splitOversizedBlock(block, pages, currentPage, stage);
  }
  return currentPage;
}

function isPDFIntegrityUnit(element) {
  return Boolean(element?.hasAttribute("data-pdf-unit-id") && element.dataset.pdfSynthetic !== "true" && element.dataset.pdfMeasureProbe !== "true" && !element.classList.contains("pdf-measure-probe"));
}

function collectIntegrityUnits(container) {
  return [...container.querySelectorAll("[data-pdf-unit-id]")].filter(isPDFIntegrityUnit);
}

function assignPDFNodeIds(container) {
  let index = 0;
  container.querySelectorAll(".metadata-relave-item, .metadata-project-item, .detail-row, .indicator-card, .result-card, [data-pdf-block]").forEach(element => {
    if (element.closest("[data-pdf-synthetic=\"true\"], .pdf-measure-probe")) return;
    if (element.querySelector(".metadata-relave-item, .metadata-project-item, .detail-row, .indicator-card, .result-card, [data-pdf-block]")) return;
    element.dataset.pdfUnitId = `pdf-unit-${index++}`;
  });
  return collectIntegrityUnits(container).map(element => element.dataset.pdfUnitId);
}

function assertSameItemCount(sourceCount, pages, selector, label) {
  const outputCount = pages.reduce((sum, page) => sum + [...page.querySelectorAll(selector)].filter(el => el.dataset.pdfSynthetic !== "true" && !el.closest("[data-pdf-synthetic=\"true\"]")).length, 0);
  if (sourceCount !== outputCount) console.warn(`[GeoNOXA PDF] ${label}: diferencia no crítica`, { sourceCount, outputCount });
  return { sourceCount, outputCount };
}

function assertPDFContentIntegrity(sourceSnapshot, pages) {
  const original = sourceSnapshot.unitIds || [];
  const output = pages.flatMap(page => collectIntegrityUnits(page).map(el => el.dataset.pdfUnitId));
  const outputSet = new Set(output);
  const missing = original.filter(id => !outputSet.has(id));
  const seen = new Set();
  const duplicated = output.filter(id => id && (seen.has(id) || !seen.add(id)));
  pdfLog("Elementos omitidos:", missing);
  pdfLog("Elementos duplicados:", duplicated);
  if (duplicated.length) console.warn("[GeoNOXA PDF] IDs duplicados no críticos en contenido paginado", { duplicated });
  if (missing.length) {
    console.error("[GeoNOXA PDF] Integridad inválida", { missing, duplicated });
    throw new Error("La paginación PDF omitió contenido informativo real");
  }
  const relaves = assertSameItemCount(sourceSnapshot.relaveCount, pages, ".metadata-relave-item", "Tarjetas de relaves");
  const details = assertSameItemCount(sourceSnapshot.detailCount, pages, ".detail-row", "Filas de indicadores/detalles");
  return { original: original.length, output: output.length, duplicated: duplicated.length, relaves, details };
}

function assertNoPageOverflow(pages) {
  pages.forEach((page, index) => {
    const content = page.querySelector(".pdf-page-content");
    if (!content || isPDFPageEmpty(page)) throw new Error(`La página ${index + 1} está vacía`);
    const overflowAmount = content.scrollHeight - content.clientHeight;
    if (overflowAmount > 0) pdfLog("Overflow detectado:", { pageIndex: index, scrollHeight: content.scrollHeight, clientHeight: content.clientHeight, overflow: overflowAmount });
    if (overflowAmount > PDF_OVERFLOW_TOLERANCE_PX) {
      console.warn("[GeoNOXA PDF] Página con overflow superior a tolerancia; se continúa con overflow visible para no abortar una exportación válida", { pageIndex: index + 1, overflow: overflowAmount });
    }
  });
}

async function paginatePDFBlocks(blocks, stage, source = null) {
  if (!blocks.length) throw new Error("No existen bloques para paginar");
  const sourceSnapshot = source ? {
    unitIds: assignPDFNodeIds(source),
    relaveCount: source.querySelectorAll(".metadata-relave-item").length,
    detailCount: source.querySelectorAll(".detail-row").length
  } : null;
  const pages = [];
  let current = appendPage(stage, pages);
  let reflowAttempts = 0;
  for (const block of blocks) {
    reflowAttempts += 1;
    if (reflowAttempts > MAX_PAGINATION_ITERATIONS || pages.length > MAX_PDF_PAGES) throw new Error("La paginación excedió el límite de seguridad");
    current = await addBlockToPages(block, pages, current, stage);
  }
  pdfLog("Páginas antes de filtrar:", pages.length);
  const filtered = removeEmptyPDFPages(pages);
  pdfLog("Páginas después de filtrar:", filtered.length);
  pdfLog("Altura útil:", SOURCE_PAGE_HEIGHT_PX);
  if (!filtered.length) throw new Error("La paginación no generó páginas");
  assertNoPageOverflow(filtered);
  const integrity = sourceSnapshot ? assertPDFContentIntegrity(sourceSnapshot, filtered) : null;
  pdfInfo("Paginación", { blocks: blocks.length, pages: filtered.length, integrity });
  return filtered;
}

function addPDFHeaderAndFooter(pdf, pageIndex, totalPages) {
  const date = new Date().toLocaleDateString("es-CL");
  pdf.setFontSize(8);
  pdf.setTextColor(75, 85, 99);
  pdf.text("GeoNOXA | Reporte del punto consultado", PDF_MARGIN_LEFT_MM, PDF_MARGIN_TOP_MM);
  pdf.text(`Fecha de generación: ${date}`, PDF_MARGIN_LEFT_MM, LETTER_HEIGHT_MM - PDF_MARGIN_BOTTOM_MM + 1);
  pdf.text(`Página ${pageIndex} de ${totalPages}`, LETTER_WIDTH_MM - PDF_MARGIN_RIGHT_MM - 30, LETTER_HEIGHT_MM - PDF_MARGIN_BOTTOM_MM + 1);
}

async function renderPDFPages(pageElements) {
  assertPDFDependencies();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter", compress: true });
  const scale = window.innerWidth < 768 ? 1.5 : Math.min(2, window.devicePixelRatio || 1.5);
  for (let index = 0; index < pageElements.length; index += 1) {
    const page = pageElements[index];
    await waitForImages(page);
    const rect = page.getBoundingClientRect();
    if (!page.isConnected || rect.width <= 0 || rect.height <= 0) throw new Error(`Página PDF con dimensiones inválidas: ${rect.width}x${rect.height}`);
    console.debug("[GeoNOXA PDF] Página:", { width: rect.width, height: rect.height });
    const canvas = await window.html2canvas(page, { scale, useCORS: true, allowTaint: false, backgroundColor: "#ffffff", logging: PDF_DEBUG, scrollX: 0, scrollY: 0, windowWidth: PDF_DESKTOP_WIDTH_PX });
    if (!canvas.width || !canvas.height) throw new Error("html2canvas produjo un canvas vacío");
    if (index > 0) pdf.addPage();
    let imageData;
    try { imageData = canvas.toDataURL("image/jpeg", 0.92); }
    catch (error) { throw new Error(`No fue posible convertir la página a imagen: ${error.message}`); }
    const renderedWidthMM = PDF_CONTENT_WIDTH_MM;
    const renderedHeightMM = canvas.height * (renderedWidthMM / canvas.width);
    pdf.addImage(imageData, "JPEG", PDF_MARGIN_LEFT_MM, PDF_CONTENT_TOP_MM, renderedWidthMM, renderedHeightMM, undefined, "FAST");
    addPDFHeaderAndFooter(pdf, index + 1, pageElements.length);
  }
  return pdf;
}

function cleanupPDFExport(stage) {
  try {
    stage?.remove();
    document.querySelectorAll(".pdf-export-stage").forEach(element => element.remove());
  } catch (error) {
    console.warn("[GeoNOXA PDF] Error eliminando stage:", error);
  }
  try {
    document.documentElement.classList.remove("pdf-export-active");
    document.body.classList.remove("pdf-export-active");
    pdfLog("Scroll width después del cleanup:", { documentWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth });
    pdfInfo("16 Cleanup terminado");
  } catch (error) {
    console.warn("[GeoNOXA PDF] Error restaurando overflow:", error);
  }
}

async function exportGeoNoxaPDFLegacy(event) {
  const button = event?.currentTarget || getPDFButtons()[0];
  const originalText = button?.textContent || "Exportar PDF";
  let stage = null;
  isGeneratingPDF = true;
  try {
    pdfInfo("01 Inicio");
    getPDFButtons().forEach(pdfButton => { pdfButton.disabled = true; pdfButton.textContent = "Generando PDF…"; });
    await runPDFStep("Verificación de dependencias", async () => assertPDFDependencies());
    const reportElement = await runPDFStep("Localización del reporte", async () => getGeoQueryReportElement());
    if (!window.geoQueryState?.exportState?.pdfEnabled && !reportElement.querySelector("#geoquery-groups")?.children.length) {
      throw new Error("El reporte GeoQuery aún no está listo para exportar");
    }
    stage = await runPDFStep("Creación del stage", async () => createPDFExportStage());
    await nextAnimationFrames(2);
    const stageRect = stage.getBoundingClientRect();
    if (stageRect.width <= 0 || stage.scrollHeight <= 0) throw new Error(`Stage PDF inválido: ${stageRect.width} × ${stage.scrollHeight}`);
    const clone = await runPDFStep("Clonación del reporte", async () => createNormalizedReportClone(reportElement));
    stage.appendChild(clone);
    await runPDFStep("Conversión de canvas", async () => replaceCanvasWithImages(reportElement, clone));
    await runPDFStep("Captura del mapa", async () => replaceMapWithSnapshot(reportElement, clone));
    await runPDFStep("Espera de imágenes", async () => waitForImages(clone));
    const blocks = await runPDFStep("Recolección de bloques", async () => collectPDFBlocks(clone));
    const pages = await runPDFStep("Paginación", async () => paginatePDFBlocks(blocks, stage, clone));
    clone.remove();
    await nextAnimationFrames(2);
    const pdf = await runPDFStep("Renderizado de páginas", async () => renderPDFPages(pages));
    const fileName = buildPDFFileName();
    if (!fileName) throw new Error("No se pudo construir el nombre del PDF");
    await runPDFStep("Guardado del PDF", async () => { pdf.save(fileName); console.info("[GeoNOXA PDF] Descarga solicitada:", fileName); });
  } catch (error) {
    console.error("[GeoNOXA PDF] Error completo:", error);
    console.error("[GeoNOXA PDF] Mensaje:", error?.message);
    console.error("[GeoNOXA PDF] Stack:", error?.stack);
    console.error("[GeoNOXA PDF] Causa:", error?.cause);
    console.error("[GeoNOXA PDF] Etapa:", currentPDFStep);
    alert("No fue posible generar el PDF. Intente nuevamente.");
  } finally {
    cleanupPDFExport(stage);
    isGeneratingPDF = false;
    getPDFButtons().forEach(pdfButton => restorePDFButton(pdfButton, originalText));
    setPDFButtonsReady(geoQueryReady);
  }
}

async function exportGeoNoxaPDF(event) {
  if (GEO_NOXA_PDF_ENGINE === "legacy") return exportGeoNoxaPDFLegacy(event);
  try {
    return await window.GeoNoxaPdfExport.exportGeoNoxaPDFDirect({
      reportModel: window.__geonoxaReportModel,
      map: window.geoQueryLeafletMap,
      mapElement: document.getElementById("geoquery-map"),
      filename: buildPDFFileName()
    });
  } catch (error) {
    console.error("[GeoNOXA PDF] Falló motor directo", error);
    if (GEO_NOXA_PDF_ENGINE === "geolib-with-legacy-fallback") return exportGeoNoxaPDFLegacy(event);
    throw error;
  }
}

async function handleGeoNoxaPDFClick(event) {
  if (isGeneratingPDF) return;
  const button = event?.currentTarget || getPDFButtons()[0];
  const originalText = button?.textContent || "Exportar PDF";
  isGeneratingPDF = true;
  try {
    getPDFButtons().forEach(pdfButton => { pdfButton.disabled = true; pdfButton.textContent = "Generando PDF…"; });
    if (!window.geoQueryState?.exportState?.pdfEnabled) throw new Error("El reporte GeoQuery aún no está listo para exportar");
    await exportGeoNoxaPDF(event);
  } catch (error) {
    console.error("[GeoNOXA PDF] Error completo:", error);
    alert("No fue posible generar el PDF. Intente nuevamente.");
  } finally {
    isGeneratingPDF = false;
    getPDFButtons().forEach(pdfButton => restorePDFButton(pdfButton, originalText));
    setPDFButtonsReady(geoQueryReady);
  }
}


function setReady(ready) {
  geoQueryReady = Boolean(ready);
  setPDFButtonsReady(geoQueryReady);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installGeoQueryPDFButtons);
} else {
  installGeoQueryPDFButtons();
}

window.GeoNoxaPdfController = Object.freeze({
  setReady,
  install: installGeoQueryPDFButtons,
  export: exportGeoNoxaPDF
});


})();
