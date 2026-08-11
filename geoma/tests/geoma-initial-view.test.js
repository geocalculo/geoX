const assert = require('node:assert/strict');
const fs = require('node:fs');

const code = fs.readFileSync('js/geoma-map.js', 'utf8');

assert.match(code, /const DEFAULT_REGION_ID = "LA"/);
assert.match(code, /const DEFAULT_REGION_ZOOM = 7/);
assert.match(code, /const hasCrossAccessViewport = applyCrossAccess\(\)/);
assert.match(code, /if \(!hasCrossAccessViewport\)[\s\S]*selector\.value = String\(defaultRegionIndex\)[\s\S]*map\.setView\(regions\[defaultRegionIndex\]\.centro, DEFAULT_REGION_ZOOM/);

const regions = JSON.parse(fs.readFileSync('capas_selector/regiones.json', 'utf8'));
const losLagos = regions.find((region) => region.id === 'LA');
assert.equal(losLagos.nombre, 'Región de Los Lagos');
assert.deepEqual(losLagos.centro, [-41.5, -73]);

console.log('GeoMA initial view tests passed: Los Lagos default and Cross Access priority');
