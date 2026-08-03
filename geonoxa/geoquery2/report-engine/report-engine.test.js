const test = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('./report-engine');
const KML = require('./report-kml');
const Pagination = require('./report-pagination');
const Components = require('./report-components');

test('registers future report formats without changing the engine core', () => {
  Engine.registerExporter('csv', data => `csv:${data.id}`);
  assert.equal(Engine.exportReport('CSV', { id: 7 }), 'csv:7');
});

test('KML validates and serializes generated visible features', () => {
  const calls = [];
  const exporter = {
    validateKmlExportItems(features) { calls.push(['validate', features]); },
    buildGeoQueryKml(config) { calls.push(['build', config]); return '<kml />'; },
    downloadKmlFile() { throw new Error('download should be disabled in this test'); }
  };
  const config = { features: [{ id: 'poi', visible: true }] };
  assert.equal(KML.exportKML({ filename: 'report.kml', buildKML: supplied => (assert.equal(supplied, exporter), config) }, { exporter, download: false }), '<kml />');
  assert.deepEqual(calls.map(call => call[0]), ['validate', 'build']);
});

test('pagination defaults to A4 and centralizes keep-together selectors', () => {
  const options = Pagination.html2pdfOptions();
  assert.equal(options.jsPDF.format, 'a4');
  assert.ok(options.pagebreak.avoid.includes('.report-keep-together'));
  assert.ok(Pagination.DEFAULT_AVOID.includes('.map'));
  assert.ok(Pagination.DEFAULT_AVOID.includes('.chart'));
});

test('definition cards escape popup and panel content from one component', () => {
  const html = Components.renderDefinitionCard({ title: '<Relave>', fields: [['Empresa', 'A & B']] });
  assert.match(html, /&lt;Relave&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /report-definition-card/);
});
