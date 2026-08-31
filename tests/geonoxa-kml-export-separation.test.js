const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const main = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const adapter = fs.readFileSync('geonoxa/geoquery/kml-export-adapter.js', 'utf8');

assert.doesNotThrow(() => new Function(main), 'GeoNOXA geoquery.js debe conservar sintaxis válida');
assert.doesNotThrow(() => new Function(adapter), 'GeoNOXA kml-export-adapter.js debe conservar sintaxis válida');

for (const symbol of [
  'function buildGeoNoxaRelaveKmlDescription',
  'function buildGeoNoxaRelaveExtendedData',
  'function buildGeoNoxaZoneKmlDescription',
  'function buildGeoNoxaZoneExtendedData',
  'function registrarKmlDescargado',
  'function buildGeoNoxaMapExport'
]) {
  assert.ok(!main.includes(symbol), 'geoquery.js no debe contener implementación KML: ' + symbol);
}

assert.ok(!main.includes('GeoQueryKmlExporter.'), 'geoquery.js no debe usar directamente el exporter KML shared');
assert.match(main, /window\.GeoNoxaKmlExport/);
assert.match(main, /installGeoNoxaKmlButton/);
assert.match(main, /buildGeoNoxaMapExport/);

assert.match(adapter, /root\.GeoNoxaKmlExport\s*=\s*api/);
assert.match(adapter, /function buildMapExport\(/);
assert.match(adapter, /function installButton\(/);
assert.match(adapter, /installGeoQueryKmlButton/);
assert.match(adapter, /registrarKmlDescargado/);
assert.match(adapter, /return Object\.freeze\(/);

const sharedIndex = html.indexOf('../../shared/geoquery-kml-exporter.js');
const adapterIndex = html.indexOf('kml-export-adapter.js');
const mainIndex = html.indexOf('src="geoquery.js"');

assert.ok(sharedIndex >= 0, 'GeoNOXA conserva exporter KML shared');
assert.ok(adapterIndex > sharedIndex, 'kml-export-adapter.js carga después del exporter shared');
assert.ok(mainIndex > adapterIndex, 'geoquery.js carga después del adaptador KML');

console.log('GeoNOXA KML export separation test passed');
