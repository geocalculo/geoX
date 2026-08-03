(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ReportKML = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function exportKML(reportData, options = {}) {
    const exporter = options.exporter || globalThis.GeoQueryKmlExporter;
    if (!exporter) throw new Error('No hay un serializador KML disponible');
    const config = typeof reportData.buildKML === 'function' ? reportData.buildKML(exporter) : reportData.kml;
    if (!config) throw new TypeError('exportKML requiere reportData.kml o reportData.buildKML');
    exporter.validateKmlExportItems(config.features);
    const kml = exporter.buildGeoQueryKml(config);
    if (options.download !== false) exporter.downloadKmlFile(kml, reportData.filename);
    return kml;
  }
  return { exportKML };
});
