const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const main = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const adapter = fs.readFileSync('geonoxa/geoquery/map-adapter.js', 'utf8');

assert.doesNotThrow(() => new Function(main), 'GeoNOXA geoquery.js debe conservar sintaxis válida');
assert.doesNotThrow(() => new Function(adapter), 'GeoNOXA map-adapter.js debe conservar sintaxis válida');

for (const symbol of [
  'function setupMobileMapGesture',
  'function drawResult',
  'L.map("geoquery-map"',
  'L.tileLayer("https://{s}.tile.openstreetmap.org'
]) {
  assert.ok(!main.includes(symbol), 'geoquery.js no debe contener responsabilidad cartográfica: ' + symbol);
}

assert.match(main, /window\.GeoNoxaMapAdapter/);
assert.match(main, /mapAdapter\.drawGroup/);
assert.match(main, /mapAdapter\.fitResults/);
assert.match(main, /mapAdapter\.invalidateSoon/);

assert.match(adapter, /root\.GeoNoxaMapAdapter\s*=\s*api/);
assert.match(adapter, /factory\(root, root\.L\)/);
assert.match(adapter, /function \(root, L\)/);
assert.match(adapter, /function create\(/);
assert.match(adapter, /function drawGroup\(/);
assert.match(adapter, /function fitResults\(/);
assert.match(adapter, /function setupMobileMapGesture\(/);
assert.match(adapter, /return Object\.freeze\(/);

const renderIndex = html.indexOf('screen-render.js');
const adapterIndex = html.indexOf('map-adapter.js');
const mainIndex = html.indexOf('src="geoquery.js"');

assert.ok(renderIndex >= 0, 'GeoNOXA conserva screen-render.js');
assert.ok(adapterIndex > renderIndex, 'map-adapter.js carga después del renderer');
assert.ok(mainIndex > adapterIndex, 'geoquery.js carga después del adaptador cartográfico');

console.log('GeoNOXA map adapter separation test passed');
