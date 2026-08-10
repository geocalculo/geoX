const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('geoma/js/geoma-summary.js', 'utf8');
const context = {console, window: null};
context.window = context;
vm.runInNewContext(code, context);

const points = context.GeoMASummary.prepareFeatures([
  {geometry: {type: 'Point', coordinates: [-70, -30]}, properties: {Tipo: 'Laguna', st_area_sh: 10000}},
  {geometry: {type: 'Point', coordinates: [-71, -31]}, properties: {Tipo: 'Laguna', st_area_sh: 20000}},
  {geometry: {type: 'Point', coordinates: [-72, -32]}, properties: {Tipo: 'Salar', st_area_sh: 1000000}},
  {geometry: {type: 'Point', coordinates: [-73, -33]}, properties: {Tipo: '  ', st_area_sh: 30000}}
]);
const summary = context.GeoMASummary.summarize(points);

assert.equal(summary.visible, 4);
assert.equal(summary.areaHectares, 106);
assert.equal(summary.dominantCountType, 'Laguna');
assert.equal(summary.dominantCount, 2);
assert.equal(summary.dominantAreaType, 'Salar');
assert.equal(summary.dominantAreaHectares, 100);
console.log('GeoMA summary tests passed: cantidad=Laguna, superficie=Salar');
