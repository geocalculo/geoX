const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'geoquery.js'), 'utf8');
const popupBuilder = source.slice(
  source.indexOf('function tailingsSummaryModel'),
  source.indexOf('function clearTailingsSelection')
);

test('tailings popup contains only the primary identification concepts', () => {
  for (const label of ['Código', 'Distancia', 'Recurso']) {
    assert.match(popupBuilder, new RegExp(`['"]${label}['"]`));
  }

  for (const redundant of ['Estado', 'Superficie', 'Empresa', 'Comuna', 'Región', 'Rol', '<table']) {
    assert.doesNotMatch(popupBuilder, new RegExp(redundant));
  }
});

test('tailings popup inserts dynamic values safely and omits missing metadata', () => {
  assert.match(popupBuilder, /title\.textContent = metadata\.name/);
  assert.match(popupBuilder, /meta\.textContent = `\$\{label\}: \$\{value\}`/);
  assert.match(popupBuilder, /if \(!present\(value\)/);
  assert.doesNotMatch(popupBuilder, /innerHTML/);
});
