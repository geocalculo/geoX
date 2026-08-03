const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'geoquery.js'), 'utf8');
const popupBuilder = source.slice(
  source.indexOf('function buildCompactTailingsPopup'),
  source.indexOf('function clearTailingsSelection')
);

test('tailings popup contains only useful card concepts', () => {
  for (const label of ['Recurso', 'Estado', 'Superficie', 'Distancia al POI', 'Empresa', 'Comuna', 'Rol']) {
    assert.match(popupBuilder, new RegExp(`['"]${label}['"]`));
  }

  for (const redundant of ['Orden', 'Identificador', 'Región', 'metadata.id']) {
    assert.doesNotMatch(popupBuilder, new RegExp(redundant));
  }
});

test('tailings role comes from the shared production-compatible metadata', () => {
  assert.match(popupBuilder, /\['Rol', metadata\.role\]/);
});
