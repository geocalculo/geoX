const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const main = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const render = fs.readFileSync('geonoxa/geoquery/screen-render.js', 'utf8');

assert.doesNotThrow(() => new Function(main), 'GeoNOXA geoquery.js debe conservar sintaxis válida');
assert.doesNotThrow(() => new Function(render), 'GeoNOXA screen-render.js debe conservar sintaxis válida');

for (const symbol of [
  'function renderRelaveMetadataItem',
  'function renderAnalysisCategory',
  'function renderRelatedRelaves',
  'function renderGeometryDescriptors',
  'function renderSpatialIndicators',
  'function renderRelaveMetadata',
  'function renderRelaves',
  'function renderZonas',
  'function renderMetaPanel'
]) {
  assert.ok(!main.includes(symbol), 'geoquery.js no debe redefinir ' + symbol);
  assert.ok(render.includes(symbol), 'screen-render.js debe contener ' + symbol);
}

assert.match(main, /window\.GeoNoxaScreenRender/);
assert.match(render, /root\.GeoNoxaScreenRender\s*=\s*api/);
assert.match(render, /GeoNoxaSpatialEngine/);
assert.match(render, /return Object\.freeze\(/);

const engineIndex = html.indexOf('spatial-engine.js');
const reportIndex = html.indexOf('report-model.js');
const renderIndex = html.indexOf('screen-render.js');
const mainIndex = html.indexOf('src="geoquery.js"');

assert.ok(engineIndex >= 0, 'GeoNOXA conserva spatial-engine.js');
assert.ok(reportIndex > engineIndex, 'report-model.js carga después del motor espacial');
assert.ok(renderIndex > reportIndex, 'screen-render.js carga después del modelo de reporte');
assert.ok(mainIndex > renderIndex, 'geoquery.js carga después del renderer de pantalla');

console.log('GeoNOXA screen render separation test passed');
