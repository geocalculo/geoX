(function (root, factory) {
  const api = factory(root.GeoQueryRenderStabilizer, root.GeoQueryLeafletAdapter, root.GeoQueryChartAdapter);
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./render-stabilizer'), require('./leaflet-adapter'), require('./chart-adapter'));
  root.GeoQueryPDF = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Stabilizer, Leaflet, Charts) {
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
    await Stabilizer.fonts(root.ownerDocument);
    await Stabilizer.images(root, options.imageTimeout);
    await Stabilizer.layout(root, options.layout);
    const restorers = [];
    for (const map of maps) restorers.push(await Leaflet.prepare(map, options.leaflet));
    for (const chart of charts) restorers.push(await Charts.prepare(chart));
    await Stabilizer.layout(root, options.layout);
    return async () => {
      for (const restore of restorers.reverse()) await restore();
      root.classList.remove('geoquery-pdf-preparing');
    };
  }

  async function exportPDF(options = {}) {
    const pdfFactory = options.html2pdf || globalThis.html2pdf;
    if (typeof pdfFactory !== 'function') throw new Error('html2pdf no está disponible');
    const restore = await prepare(options);
    try {
      await options.beforeCapture?.();
      const worker = pdfFactory().set({ ...options.settings, filename: registration.filename }).from(registration.root).toPdf();
      const pdf = await worker.get('pdf');
      await options.decorate?.(pdf);
      await worker.save();
      return pdf;
    } finally {
      await restore();
      await options.afterRestore?.();
    }
  }

  const api = { register, ready, prepare, exportPDF };
  return api;
});
