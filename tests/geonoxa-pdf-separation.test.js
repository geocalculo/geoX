const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const main = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const controller = fs.readFileSync('geonoxa/geoquery/pdf/geoNoxaPdfController.js', 'utf8');

assert.doesNotThrow(() => new Function(main), 'GeoNOXA geoquery.js debe conservar sintaxis válida');
assert.doesNotThrow(() => new Function(controller), 'GeoNOXA PDF controller debe conservar sintaxis válida');

for (const legacySymbol of [
  'PDF_DEBUG',
  'GEO_NOXA_PDF_ENGINE',
  'exportGeoNoxaPDFLegacy',
  'paginatePDFBlocks',
  'renderPDFPages',
  'handleGeoNoxaPDFClick'
]) {
  assert.ok(!main.includes(legacySymbol), 'GeoNOXA geoquery.js no debe contener ' + legacySymbol);
  assert.ok(controller.includes(legacySymbol), 'GeoNOXA PDF controller debe contener ' + legacySymbol);
}

assert.match(main, /GeoNoxaPdfController\?\.setReady/);
assert.match(controller, /window\.GeoNoxaPdfController\s*=\s*Object\.freeze/);

const directIndex = html.indexOf('pdf/geoNoxaPdfExport.js');
const controllerIndex = html.indexOf('pdf/geoNoxaPdfController.js');
const mainIndex = html.indexOf('src="geoquery.js"');

assert.ok(directIndex >= 0, 'GeoNOXA conserva el motor PDF directo');
assert.ok(controllerIndex > directIndex, 'El controller PDF carga después del motor directo');
assert.ok(mainIndex > controllerIndex, 'geoquery.js carga después del controller PDF');

console.log('GeoNOXA PDF separation test passed');
