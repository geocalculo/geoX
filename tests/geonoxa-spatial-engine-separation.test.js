const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const main = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const engine = fs.readFileSync('geonoxa/geoquery/spatial-engine.js', 'utf8');

assert.doesNotThrow(() => new Function(main), 'GeoNOXA geoquery.js debe conservar sintaxis válida');
assert.doesNotThrow(() => new Function(engine), 'GeoNOXA spatial-engine.js debe conservar sintaxis válida');

for (const symbol of [
  'function parseViewport',
  'function featureIntersectsViewport',
  'function normalizeRelave',
  'function normalizeZona',
  'function analyzeRelaves',
  'function analyzeZonas',
  'function dominantResource',
  'function pairDistanceStats',
  'function pointDistanceStats'
]) {
  assert.ok(!main.includes(symbol), 'geoquery.js no debe redefinir ' + symbol);
  assert.ok(engine.includes(symbol), 'spatial-engine.js debe contener ' + symbol);
}

assert.match(main, /window\.GeoNoxaSpatialEngine/);
assert.match(engine, /root\.GeoNoxaSpatialEngine\s*=\s*api/);
assert.match(engine, /return Object\.freeze\(/);

const turfIndex = html.indexOf('@turf/turf@6/turf.min.js');
const engineIndex = html.indexOf('spatial-engine.js');
const mainIndex = html.indexOf('src="geoquery.js"');

assert.ok(turfIndex >= 0, 'GeoNOXA conserva Turf');
assert.ok(engineIndex > turfIndex, 'spatial-engine.js carga después de Turf');
assert.ok(mainIndex > engineIndex, 'geoquery.js carga después del motor espacial');

console.log('GeoNOXA spatial engine separation test passed');
