const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const main = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const report = fs.readFileSync('geonoxa/geoquery/report-model.js', 'utf8');

assert.doesNotThrow(() => new Function(main), 'GeoNOXA geoquery.js debe conservar sintaxis válida');
assert.doesNotThrow(() => new Function(report), 'GeoNOXA report-model.js debe conservar sintaxis válida');

for (const symbol of [
  'function buildRelavesSummary',
  'function buildZonasSummary',
  'function buildExecutiveSummary',
  'function buildGeoNoxaReportModel',
  'function deriveOverallStatus'
]) {
  assert.ok(!main.includes(symbol), 'geoquery.js no debe redefinir ' + symbol);
  assert.ok(report.includes(symbol), 'report-model.js debe contener ' + symbol);
}

assert.match(main, /window\.GeoNoxaReportModel/);
assert.match(report, /root\.GeoNoxaReportModel\s*=\s*api/);
assert.match(report, /GeoNoxaSpatialEngine/);
assert.match(report, /return Object\.freeze\(/);

const engineIndex = html.indexOf('spatial-engine.js');
const reportIndex = html.indexOf('report-model.js');
const mainIndex = html.indexOf('src="geoquery.js"');

assert.ok(engineIndex >= 0, 'GeoNOXA conserva spatial-engine.js');
assert.ok(reportIndex > engineIndex, 'report-model.js carga después del motor espacial');
assert.ok(mainIndex > reportIndex, 'geoquery.js carga después del modelo de reporte');

console.log('GeoNOXA report model separation test passed');
