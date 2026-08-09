(function (root, factory) {
  const api = factory(root.GeoQueryRenderStabilizer, root.GeoQueryLeafletAdapter, root.GeoQueryChartAdapter, root.GeoQueryPDFPagination);
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./render-stabilizer'), require('./leaflet-adapter'), require('./chart-adapter'), require('./pagination'));
  root.GeoQueryPDF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Stabilizer, Leaflet, Charts, Pagination) {
  'use strict';
  let registration;
  let readyPromise;
  let signalReady;

  function register(config) {
    const root = typeof config?.root === 'string' ? document.querySelector(config.root) : config?.root;
    if (!root) throw new TypeError('GeoQueryPDF.register requiere un root válido');
    registration = { maps: [], charts: [], filename: 'GeoQuery.pdf', ...config, root };
    readyPromise = new Promise(resolve => { signalReady = resolve; });
    return api;
  }

  function ready() {
    if (!registration) throw new Error('GeoQueryPDF.ready requiere register primero');
    signalReady();
    return api;
  }

  async function prepare(options = {}) {
    if (!registration) throw new Error('GeoQueryPDF no está registrado');
    await readyPromise;
    const { root, maps, charts } = registration;
    root.classList.add('geoquery-pdf-preparing');
    const restorePagination = Pagination.prepare(root, options.pagination);
    await Stabilizer.fonts(root.ownerDocument);
    await Stabilizer.images(root, options.imageTimeout);
    await Stabilizer.layout(root, options.layout);
    const restorers = [];
    for (const map of maps) restorers.push(await Leaflet.prepare(map, options.leaflet));
    for (const chart of charts) restorers.push(await Charts.prepare(chart));
    await Stabilizer.layout(root, options.layout);
    return async () => {
      restorePagination();
      await Stabilizer.layout(root, options.layout);
      for (const restore of restorers.reverse()) await restore();
      root.classList.remove('geoquery-pdf-preparing');
    };
  }

  function decoratePages(pdf, furniture) {
    if (!furniture || furniture.enabled === false) return;
    const pages = pdf.getNumberOfPages();
    const width = pdf.internal.pageSize.getWidth();
    const height = pdf.internal.pageSize.getHeight();
    const date = (furniture.generatedAt || new Date()).toLocaleDateString(furniture.locale || 'es-CL');
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(14, 116, 144);
      pdf.text(furniture.header || furniture.title || 'GeoQuery Report', 10, 13);
      pdf.setDrawColor(220, 226, 235); pdf.line(10, 16, width - 10, 16);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(107, 114, 128);
      pdf.text(`${furniture.dateLabel || 'Fecha de generación'}: ${date}`, 10, height - 12);
      pdf.text(`${furniture.pageLabel || 'Página'} ${page} ${furniture.pageSeparator || 'de'} ${pages}`, width - 35, height - 12);
    }
  }

  async function exportPDF(options = {}) {
    const pdfFactory = options.html2pdf || globalThis.html2pdf;
    if (typeof pdfFactory !== 'function') throw new Error('html2pdf no está disponible');
    const restore = await prepare(options);
    try {
      await options.beforeCapture?.();
      const settings = { ...Pagination.html2pdfOptions(options), ...options.settings, filename: options.filename || registration.filename };
      const worker = pdfFactory().set(settings).from(registration.root).toPdf();
      const pdf = await worker.get('pdf');
      decoratePages(pdf, options.furniture);
      await options.decorate?.(pdf);
      await worker.save();
      return pdf;
    } finally {
      await restore();
      await options.afterRestore?.();
    }
  }

  const api = { register, ready, prepare, exportPDF, decoratePages, html2pdfOptions: Pagination?.html2pdfOptions };
  return api;
});
