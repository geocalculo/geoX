const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'geoquery.css'), 'utf8');

test('PDF tailings typography stays legible and centrally configured', () => {
  assert.match(css, /--pdf-font-list-body:10px/);
  assert.match(css, /--pdf-font-list-small:9px/);
  assert.match(css, /--pdf-font-compact:9\.5px/);
  assert.match(css, /--pdf-line-compact:1\.1/);
  assert.doesNotMatch(css, /\.pdf-export-root[^{}]*tailings-list[^{}]*font-size:\s*[678](?:\.\d+)?px/);
});

test('PDF list gains space through geometry and keeps names on one line', () => {
  assert.match(css, /\.pdf-export-root \.geoquery-list\{gap:2px\}/);
  assert.match(css, /\.pdf-export-root \.geoquery-list__item\{[^}]*min-height:31px;[^}]*padding:3px 6px;[^}]*column-gap:6px/);
  assert.match(css, /\.pdf-export-root \.geoquery-list__name\{font-size:10px;font-weight:400;line-height:11px\}/);
});
