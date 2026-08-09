(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../../geoquery-pdf/geoquery-pdf'), require('./report-kml'), require('./report-components'));
  } else {
    root.ReportEngine = factory(root.GeoQueryPDF, root.ReportKML, root.ReportComponents);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (PDF, KML, Components) {
  'use strict';
  async function exportPDF(data, options = {}) {
    if (!data?.element) throw new TypeError('exportPDF requiere reportData.element');
    return PDF.exportPDF({
      ...options,
      filename: data.filename,
      beforeCapture: () => data.beforeExport?.('pdf'),
      furniture: { generatedAt: data.generatedAt, locale: data.locale, title: data.title, header: data.header }
    });
  }
  const exporters = new Map([['pdf', exportPDF], ['kml', KML.exportKML]]);
  function registerExporter(format, exporter) {
    if (!format || typeof exporter !== 'function') throw new TypeError('El exportador debe tener formato y función');
    exporters.set(String(format).toLowerCase(), exporter);
  }
  function exportReport(format, reportData, options) {
    const exporter = exporters.get(String(format).toLowerCase());
    if (!exporter) throw new Error(`Formato de reporte no registrado: ${format}`);
    return exporter(reportData, options);
  }
  return { exportPDF: (data, options) => exportReport('pdf', data, options), exportKML: (data, options) => exportReport('kml', data, options), exportReport, registerExporter, components: Components };
});
