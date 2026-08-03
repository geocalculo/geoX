(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./report-print'), require('./report-kml'), require('./report-components'));
  } else {
    root.ReportEngine = factory(root.ReportPrint, root.ReportKML, root.ReportComponents);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Print, KML, Components) {
  'use strict';
  const exporters = new Map([['pdf', Print.exportPDF], ['kml', KML.exportKML]]);
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
