(function () {
  "use strict";

  const PDF_LAYOUT = { marginLeft: 10, marginRight: 10, marginTop: 13, marginBottom: 14, headerHeight: 8, footerHeight: 8, sectionGap: 4, panelGap: 3 };
  const COLORS = { ink: [31,41,55], muted: [107,114,128], line: [220,226,235], soft: [248,250,252], accent: [14,116,144], accentSoft: [236,253,245], warning: [146,64,14] };
  const LINE = 4.2;

  function assertGeoNoxaPDFDependencies() {
    if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") throw new Error("jsPDF no disponible");
    if (typeof window.domtoimage?.toPng !== "function") throw new Error("dom-to-image no disponible");
  }

  function createGeoNoxaPdfDocument() {
    const { jsPDF } = window.jspdf;
    return new jsPDF({ orientation: "portrait", unit: "mm", format: "letter", compress: true });
  }

  function fmtDate(date = new Date()) { return new Date(date).toISOString().slice(0, 10); }
  function fmtDateCL(date = new Date()) { const d = new Date(date); return `${String(d.getDate()).padStart(2,"0")}-${String(d.getMonth()+1).padStart(2,"0")}-${d.getFullYear()}`; }
  function present(value) { const text = String(value ?? "").replace(/\s+/g, " ").trim(); return text && !["undefined","null","nan","n/d","—"].includes(text.toLowerCase()) ? text : ""; }
  function fmtNumber(value, digits = 6) { const n = Number(value); return Number.isFinite(n) ? n.toFixed(digits) : ""; }
  function fmtKm(value) { const n = Number(value); return Number.isFinite(n) ? `${n.toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km` : "N/D"; }
  function relaveTitle(r) { return present(r?.siteName) || present(r?.company) || present(r?.idRelave) || "Relave relacionado"; }
  function cleanItems(items) { return (items || []).filter(item => present(item?.label) || present(item?.value)); }
  function splitPdfText(doc, text, maxWidth) { return doc.splitTextToSize(String(text ?? ""), maxWidth); }
  function sanitizePdfFilenamePart(value) { return String(value ?? "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80); }
  function normalizePdfUrl(value) { const raw = String(value ?? "").trim(); return /^https?:\/\//i.test(raw) ? raw : ""; }
  function buildFilename(model, filename) {
    if (filename) return sanitizePdfFilenamePart(filename).replace(/\.pdf$/i, "") + ".pdf";
    const date = fmtDate(model?.identity?.generatedAt || new Date());
    const lat = fmtNumber(model?.query?.lat, 6);
    const lon = fmtNumber(model?.query?.lon, 6);
    return lat && lon ? `GeoNOXA_Reporte_${sanitizePdfFilenamePart(lat)}_${sanitizePdfFilenamePart(lon)}_${date}.pdf` : `GeoNOXA_Reporte_${date}.pdf`;
  }

  function createContext(doc, model, map, mapElement) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentLeft = PDF_LAYOUT.marginLeft;
    const contentRight = pageWidth - PDF_LAYOUT.marginRight;
    const contentWidth = contentRight - contentLeft;
    const contentTop = PDF_LAYOUT.marginTop + PDF_LAYOUT.headerHeight;
    const pageBottom = pageHeight - PDF_LAYOUT.marginBottom - PDF_LAYOUT.footerHeight;
    return { model, map, mapElement, pageWidth, pageHeight, contentLeft, contentRight, contentWidth, contentTop, pageBottom, y: contentTop, sectionGap: PDF_LAYOUT.sectionGap, panelGap: PDF_LAYOUT.panelGap, capturedCharts: [] };
  }

  function setColor(doc, key) { doc.setTextColor(...COLORS[key]); }
  function drawRoundedPanel(doc, x, y, w, h, fill = COLORS.soft) { doc.setFillColor(...fill); doc.setDrawColor(...COLORS.line); doc.roundedRect(x, y, w, h, 2.2, 2.2, "FD"); }
  function addPdfPage(doc, context) { doc.addPage(); context.y = context.contentTop; }
  function ensurePdfSpace(doc, context, requiredHeight) {
    const availableHeight = context.pageBottom - context.contentTop;
    const safeHeight = Math.min(requiredHeight, availableHeight);
    if (context.y + safeHeight > context.pageBottom) addPdfPage(doc, context);
  }
  function drawSectionTitle(doc, title, context) {
    if (!title) return;
    ensurePdfSpace(doc, context, 8);
    doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(...COLORS.accent);
    doc.text(String(title), context.contentLeft, context.y + 4);
    doc.setDrawColor(...COLORS.line); doc.line(context.contentLeft, context.y + 6, context.contentRight, context.y + 6);
    context.y += 9;
  }

  function drawDocumentIntro(doc, context) {
    const q = context.model.query || {};
    const lines = [`Generado: ${fmtDateCL(context.model.identity?.generatedAt || new Date())}`];
    if (Number.isFinite(Number(q.lat)) && Number.isFinite(Number(q.lon))) lines.push(`Coordenadas: ${fmtNumber(q.lat)} / ${fmtNumber(q.lon)}`);
    if (present(q.region) || present(q.commune)) lines.push(`Ubicación administrativa: ${present(q.region) || "N/D"}${present(q.commune) ? ` · ${present(q.commune)}` : ""}`);
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...COLORS.ink);
    doc.text("GeoNOXA | Reporte del punto consultado", context.contentLeft, context.y + 2);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); setColor(doc, "muted");
    lines.forEach((line, i) => doc.text(line, context.contentLeft, context.y + 8 + i * 4));
    context.y += 10 + lines.length * 4;
  }

  function drawKpiGrid(doc, section, context) {
    const items = cleanItems(section.data?.items || section.data || []);
    const columns = section.data?.columns || 4;
    drawSectionTitle(doc, section.title, context);
    const gap = 2.2, cellW = (context.contentWidth - gap * (columns - 1)) / columns;
    doc.setFontSize(7.2); doc.setFont("helvetica", "bold");
    let rowH = 16;
    items.slice(0, columns).forEach(item => { rowH = Math.max(rowH, 8 + splitPdfText(doc, present(item.value) || "N/D", cellW - 6).length * 3.4); });
    ensurePdfSpace(doc, context, rowH);
    items.slice(0, columns).forEach((item, i) => {
      const x = context.contentLeft + i * (cellW + gap);
      drawRoundedPanel(doc, x, context.y, cellW, rowH, COLORS.accentSoft);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); setColor(doc, "muted"); doc.text(String(item.label || ""), x + 3, context.y + 5);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); setColor(doc, "ink"); doc.text(splitPdfText(doc, present(item.value) || "N/D", cellW - 6), x + 3, context.y + 10);
    });
    context.y += rowH + context.sectionGap;
  }

  function drawLabelValueGrid(doc, section, context) {
    const data = cleanItems(section.data?.items || section.data || []);
    drawSectionTitle(doc, section.title, context);
    if (!data.length) return drawNoticePanel(doc, { data: { text: "Sin información disponible para esta sección." } }, context);
    const cols = section.data?.columns || 2, gap = 3, cellW = (context.contentWidth - gap * (cols - 1)) / cols;
    for (let i = 0; i < data.length; i += cols) {
      const row = data.slice(i, i + cols);
      let h = 12;
      row.forEach(item => { doc.setFontSize(8); h = Math.max(h, 8 + splitPdfText(doc, present(item.value) || "N/D", cellW - 7).length * 3.8); });
      ensurePdfSpace(doc, context, h);
      row.forEach((item, idx) => { const x = context.contentLeft + idx * (cellW + gap); drawRoundedPanel(doc, x, context.y, cellW, h, [255,255,255]); doc.setFont("helvetica", "bold"); doc.setFontSize(7); setColor(doc, "muted"); doc.text(String(item.label || ""), x + 3, context.y + 5); doc.setFont("helvetica", "normal"); doc.setFontSize(8); setColor(doc, "ink"); doc.text(splitPdfText(doc, present(item.value) || "N/D", cellW - 7), x + 3, context.y + 9); });
      context.y += h + context.panelGap;
    }
    context.y += context.sectionGap - context.panelGap;
  }

  function drawTextPanel(doc, section, context) {
    drawSectionTitle(doc, section.title, context);
    const text = section.data?.text ?? section.data ?? "";
    const lines = splitPdfText(doc, text, context.contentWidth - 8);
    const h = Math.max(14, lines.length * LINE + 8);
    ensurePdfSpace(doc, context, h);
    drawRoundedPanel(doc, context.contentLeft, context.y, context.contentWidth, h, [255,255,255]);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.6); setColor(doc, "ink"); doc.text(lines, context.contentLeft + 4, context.y + 6);
    context.y += h + context.sectionGap;
  }
  function drawNoticePanel(doc, section, context) { drawTextPanel(doc, { title: section.title, data: { text: section.data?.text || section.data || "Sin información disponible." } }, context); }
  function drawMetricGrid(doc, section, context) { drawLabelValueGrid(doc, { title: section.title, data: { items: (section.data?.groups || []).flatMap(g => [{ label: g.title, value: "" }, ...(g.items || [])]).filter(i => i.value !== "") } }, context); }

  function drawCardGrid(doc, section, context) {
    const cards = section.data?.items || section.data || [];
    drawSectionTitle(doc, section.title, context);
    const cols = section.data?.columns || 2, gap = 3, w = (context.contentWidth - gap) / cols;
    for (let i = 0; i < cards.length; i += cols) {
      const row = cards.slice(i, i + cols);
      let h = 24;
      row.forEach(card => { const lineCount = (card.fields || []).reduce((sum, f) => sum + splitPdfText(doc, `${f.label}: ${present(f.value) || "N/D"}`, w - 8).length, 0); h = Math.max(h, 12 + lineCount * 3.4); });
      ensurePdfSpace(doc, context, h);
      row.forEach((card, idx) => { const x = context.contentLeft + idx * (w + gap); drawRoundedPanel(doc, x, context.y, w, h, [255,255,255]); doc.setFont("helvetica", "bold"); doc.setFontSize(8.2); setColor(doc, "accent"); doc.text(splitPdfText(doc, card.title || "Registro", w - 8), x + 4, context.y + 5); doc.setFont("helvetica", "normal"); doc.setFontSize(7.2); setColor(doc, "ink"); let yy = context.y + 10; (card.fields || []).forEach(f => { const lines = splitPdfText(doc, `${f.label}: ${present(f.value) || "N/D"}`, w - 8); doc.text(lines, x + 4, yy); yy += lines.length * 3.4; }); });
      context.y += h + context.panelGap;
    }
    context.y += context.sectionGap - context.panelGap;
  }

  async function drawPointAndMapBlock(doc, section, context) {
    drawSectionTitle(doc, section.title || "Punto consultado y mapa de ubicación", context);
    const gap = 5, pointWidth = (context.contentWidth - gap) * (1.1 / 2.1), mapWidth = context.contentWidth - gap - pointWidth, h = 58;
    ensurePdfSpace(doc, context, h);
    const y = context.y;
    drawRoundedPanel(doc, context.contentLeft, y, pointWidth, h, [255,255,255]);
    drawRoundedPanel(doc, context.contentLeft + pointWidth + gap, y, mapWidth, h, [255,255,255]);
    const items = cleanItems(section.data?.pointItems || []);
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setColor(doc, "accent"); doc.text("Punto consultado", context.contentLeft + 4, y + 6);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7.4); setColor(doc, "ink"); let yy = y + 12;
    items.forEach(item => { const lines = splitPdfText(doc, `${item.label}: ${present(item.value) || "N/D"}`, pointWidth - 8); doc.text(lines, context.contentLeft + 4, yy); yy += lines.length * 3.8; });
    let mapPng = section.data?.mapPng;
    if (!mapPng && context.mapElement) { try { mapPng = await captureGeoNoxaMapPng({ map: context.map, mapElement: context.mapElement }); } catch (error) { console.warn("[GeoNOXA PDF] No fue posible capturar el mapa", error); } }
    const mx = context.contentLeft + pointWidth + gap + 3, my = y + 8, mw = mapWidth - 6, mh = h - 12;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); setColor(doc, "accent"); doc.text("Mapa de ubicación", context.contentLeft + pointWidth + gap + 4, y + 6);
    if (mapPng) {
      const props = doc.getImageProperties(mapPng);
      const ratio = props.width && props.height ? props.width / props.height : mw / mh;
      let drawW = mw;
      let drawH = drawW / ratio;
      if (drawH > mh) { drawH = mh; drawW = drawH * ratio; }
      const drawX = mx + (mw - drawW) / 2;
      const drawY = my + (mh - drawH) / 2;
      doc.addImage(mapPng, "PNG", drawX, drawY, drawW, drawH, undefined, "FAST");
    }
    else { doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); setColor(doc, "warning"); doc.text(splitPdfText(doc, `No fue posible incorporar la imagen del mapa durante esta exportación. Coordenadas: ${fmtNumber(context.model.query?.lat)} / ${fmtNumber(context.model.query?.lon)}. Mapa base: ${present(context.model.query?.basemap) || "N/D"}.`, mw - 4), mx + 2, my + 7); }
    context.y += h + context.sectionGap;
  }

  function drawMetadataTable(doc, section, context) {
    drawSectionTitle(doc, section.title, context);
    if (typeof doc.autoTable !== "function") { console.warn("[GeoNOXA PDF] AutoTable no disponible"); return drawLabelValueGrid(doc, { data: { items: (section.data?.rows || []).flatMap(row => row.map((v, i) => ({ label: section.data?.head?.[i] || `Campo ${i+1}`, value: v }))) } }, context); }
    ensurePdfSpace(doc, context, 18);
    doc.autoTable({ head: [section.data?.head || []], body: section.data?.rows || [], startY: context.y, margin: { left: context.contentLeft, right: context.pageWidth - context.contentRight }, styles: { fontSize: 7.3, cellPadding: 1.6, overflow: "linebreak" }, headStyles: { fillColor: COLORS.accent, textColor: [255,255,255], fontStyle: "bold" }, showHead: "everyPage" });
    context.y = (doc.lastAutoTable?.finalY || context.y) + context.sectionGap;
  }

  async function captureGeoNoxaMapPng({ map, mapElement }) {
    if (typeof window.domtoimage?.toPng !== "function") throw new Error("dom-to-image no disponible");
    if (!map || !mapElement) throw new Error("Mapa Leaflet no disponible");
    const center = typeof map.getCenter === "function" ? map.getCenter() : null;
    const zoom = typeof map.getZoom === "function" ? map.getZoom() : null;
    const hidden = [...mapElement.querySelectorAll(".leaflet-control-container, .leaflet-control, .map-toggle, .map-touch-hint, [role='tooltip'], .leaflet-tooltip")].map(el => [el, el.style.visibility]);
    try {
      hidden.forEach(([el]) => { el.style.visibility = "hidden"; });
      map.invalidateSize({ pan: false, animate: false });
      await nextFrames(2); await waitForGeoNoxaMapTiles(mapElement); await new Promise(r => setTimeout(r, 220));
      const rect = mapElement.getBoundingClientRect(); const width = Math.round(rect.width); const height = Math.round(rect.height);
      if (width <= 0 || height <= 0) throw new Error("Contenedor de mapa sin dimensiones");
      return await window.domtoimage.toPng(mapElement, { width, height, style: { transform: "scale(1)", transformOrigin: "top left" } });
    } finally {
      hidden.forEach(([el, visibility]) => { el.style.visibility = visibility; });
      if (center && Number.isFinite(zoom) && typeof map.setView === "function") map.setView(center, zoom, { animate: false });
      map.invalidateSize({ pan: false, animate: false });
    }
  }
  function nextFrames(count) { return new Promise(resolve => { const step = n => n <= 0 ? resolve() : requestAnimationFrame(() => step(n - 1)); step(count); }); }
  async function waitForGeoNoxaMapTiles(mapElement, timeout = 6000) {
    const pending = [...mapElement.querySelectorAll(".leaflet-tile")].filter(image => !image.complete);
    if (!pending.length) return;
    await Promise.race([Promise.allSettled(pending.map(image => new Promise(resolve => { image.addEventListener("load", resolve, { once: true }); image.addEventListener("error", resolve, { once: true }); }))), new Promise(resolve => setTimeout(resolve, timeout))]);
  }

  async function captureGeoNoxaCharts() {
    const charts = [];
    const nodes = [...document.querySelectorAll('[data-pdf-chart="true"]')];
    for (const node of nodes) {
      try {
        let dataUrl = "";
        if (window.Plotly?.toImage && node.classList.contains("js-plotly-plot")) dataUrl = await window.Plotly.toImage(node, { format: "png", width: node.clientWidth || 800, height: node.clientHeight || 420 });
        else if (node.__chartjs?.toBase64Image) dataUrl = node.__chartjs.toBase64Image();
        else if (node instanceof HTMLCanvasElement) dataUrl = node.toDataURL("image/png");
        if (dataUrl) charts.push({ title: node.dataset.pdfTitle || node.getAttribute("aria-label") || "Gráfico", dataUrl });
      } catch (error) { console.warn("[GeoNOXA PDF] No fue posible exportar un gráfico", error); }
    }
    return charts;
  }
  function drawImageGrid(doc, section, context) {
    const images = section.data?.images || [];
    if (!images.length) return;
    drawSectionTitle(doc, section.title, context);
    images.forEach(image => { const h = Math.min(70, context.contentWidth * 0.52); ensurePdfSpace(doc, context, h + 8); doc.setFont("helvetica", "bold"); doc.setFontSize(8.4); setColor(doc, "ink"); doc.text(image.title || "Gráfico", context.contentLeft, context.y + 4); doc.addImage(image.dataUrl, "PNG", context.contentLeft, context.y + 7, context.contentWidth, h, undefined, "FAST"); context.y += h + 10; });
  }

  function addGeoNoxaPdfHeader(doc, context, pageNumber, totalPages) { doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...COLORS.accent); doc.text("GeoNOXA | Reporte del punto consultado", PDF_LAYOUT.marginLeft, PDF_LAYOUT.marginTop); doc.setDrawColor(...COLORS.line); doc.line(PDF_LAYOUT.marginLeft, PDF_LAYOUT.marginTop + 3, context.pageWidth - PDF_LAYOUT.marginRight, PDF_LAYOUT.marginTop + 3); }
  function addGeoNoxaPdfFooter(doc, context, pageNumber, totalPages) { doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); setColor(doc, "muted"); doc.text(`Fecha de generación: ${fmtDateCL(context.model.identity?.generatedAt || new Date())}`, PDF_LAYOUT.marginLeft, context.pageHeight - PDF_LAYOUT.marginBottom + 2); doc.text(`Página ${pageNumber} de ${totalPages}`, context.pageWidth - PDF_LAYOUT.marginRight - 25, context.pageHeight - PDF_LAYOUT.marginBottom + 2); }
  function addPdfHeaderFooterToAllPages(doc, context) { const total = doc.getNumberOfPages(); for (let p = 1; p <= total; p += 1) { doc.setPage(p); addGeoNoxaPdfHeader(doc, context, p, total); addGeoNoxaPdfFooter(doc, context, p, total); } }

  const PDF_SECTION_RENDERERS = { "kpi-grid": drawKpiGrid, "point-map": drawPointAndMapBlock, "text-panel": drawTextPanel, "metric-grid": drawMetricGrid, "card-list": drawCardGrid, "table": drawMetadataTable, "metadata": drawLabelValueGrid, "notice": drawNoticePanel, "image-grid": drawImageGrid };
  async function renderGeoNoxaPdfSection(doc, section, context) { const renderer = PDF_SECTION_RENDERERS[section.type]; if (!renderer) return console.warn("[GeoNOXA PDF] Renderizador no disponible", section.type); await renderer(doc, section, context); }
  async function exportGeoNoxaPDFDirect({ reportModel, map, mapElement, filename } = {}) {
    let currentPdfStep = "initialization";
    try {
      currentPdfStep = "dependencies"; assertGeoNoxaPDFDependencies();
      currentPdfStep = "building_model"; const model = reportModel || window.__geonoxaReportModel; if (!model) throw new Error("Modelo GeoNOXA no disponible");
      currentPdfStep = "document"; const doc = createGeoNoxaPdfDocument(); const context = createContext(doc, model, map || window.geoQueryLeafletMap, mapElement || document.getElementById("geoquery-map"));
      currentPdfStep = "capturing_charts"; context.capturedCharts = await captureGeoNoxaCharts();
      currentPdfStep = "drawing_sections"; drawDocumentIntro(doc, context); const sections = collectGeoNoxaPdfSections(model, context); for (const section of sections) await renderGeoNoxaPdfSection(doc, section, context);
      currentPdfStep = "adding_footer"; addPdfHeaderFooterToAllPages(doc, context);
      currentPdfStep = "saving"; const safeFilename = buildFilename(model, filename); doc.save(safeFilename); console.info("[GeoNOXA PDF] Descarga solicitada:", safeFilename, { pages: doc.getNumberOfPages() }); return { filename: safeFilename, pages: doc.getNumberOfPages() };
    } catch (error) { console.error("[GeoNOXA PDF]", { step: currentPdfStep, message: error?.message, stack: error?.stack, error }); throw error; }
  }

  function collectGeoNoxaPdfSections(model, context) {
    const base = Array.isArray(model.sections) ? [...model.sections] : [];
    const modelIds = new Set(base.map(section => section?.id).filter(Boolean));
    const domSections = collectGeoNoxaDomPdfSections(modelIds);
    base.push(...domSections);
    base.sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    if (context.capturedCharts.length) base.splice(Math.min(8, base.length), 0, { id: "charts", type: "image-grid", title: "Gráficos", data: { images: context.capturedCharts }, order: 850 });
    return base;
  }

  function collectGeoNoxaDomPdfSections(excludedIds = new Set()) {
    return [...document.querySelectorAll("[data-pdf-section]")]
      .map((node, index) => {
        const id = present(node.dataset.pdfSection) || `dom-section-${index + 1}`;
        if (excludedIds.has(id) || node.matches('[data-pdf-export="false"], .pdf-no-export')) return null;
        const type = present(node.dataset.pdfType) || "text-panel";
        const order = Number(node.dataset.pdfOrder || 9000 + index);
        const title = present(node.dataset.pdfTitle) || present(node.querySelector("h1,h2,h3,h4")?.textContent) || null;
        const text = present(node.dataset.pdfText) || present(node.textContent);
        return text ? { id, type, title, order, data: { text } } : null;
      })
      .filter(Boolean);
  }

  window.GeoNoxaPdfExport = { exportGeoNoxaPDFDirect, assertGeoNoxaPDFDependencies, createGeoNoxaPdfDocument, collectGeoNoxaPdfSections, captureGeoNoxaMapPng, captureGeoNoxaCharts, waitForGeoNoxaMapTiles, collectGeoNoxaDomPdfSections, sanitizePdfFilenamePart, normalizePdfUrl, PDF_LAYOUT };
})();
