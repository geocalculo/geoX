const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'geoquery.js'), 'utf8');
const helperSource = source.slice(
  source.indexOf('function normalizeClassTokens'),
  source.indexOf('\n\n  function renderGeoQueryList')
);
const normalizeClassTokens = Function(`${helperSource}; return normalizeClassTokens;`)();

test('normalizes every class value, including space-separated array entries', () => {
  assert.deepEqual(
    normalizeClassTokens(['geoquery-list__item--nearest geoquery-list__item--active', '', null]),
    ['geoquery-list__item--nearest', 'geoquery-list__item--active']
  );
  assert.deepEqual(normalizeClassTokens(' one\t two  '), ['one', 'two']);
  assert.deepEqual(normalizeClassTokens(undefined), []);
});

test('tailings names are content and never CSS class tokens', () => {
  const renderer = source.slice(
    source.indexOf('function renderGeoQueryList'),
    source.indexOf('\n\n  function renderTailingsList')
  );
  assert.match(renderer, /name\.textContent = present\(itemName\)/);
  assert.doesNotMatch(renderer, /classList\.add\([^)]*(?:getName|itemName|\.nombre|metadata\.name)/);
  assert.match(source, /safeRender\('lista de relaves'/);
});
