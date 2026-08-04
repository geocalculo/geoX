const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, 'report-engine', 'report-theme.css'), 'utf8');

test('PDF tailings typography stays legible and centrally configured', () => {
  assert.match(css, /--report-font-list-body:9px/);
  assert.match(css, /--report-font-list-small:8px/);
  assert.match(css, /--report-font-compact:8\.5px/);
  assert.match(css, /--report-line-compact:1\.1/);
  assert.doesNotMatch(css, /\.pdf-export-root[^{}]*tailings-list[^{}]*font-size:\s*[67](?:\.\d+)?px/);
});

test('PDF list gains space through geometry and keeps names on one line', () => {
  assert.match(css, /\.pdf-export-root \.tailings-list\{gap:2px\}/);
  assert.match(css, /\.pdf-export-root \.tailings-list__item\{[^}]*min-height:31px;[^}]*padding:3px 6px;[^}]*column-gap:6px/);
  assert.match(css, /\.pdf-export-root \.tailings-list__main strong\{white-space:nowrap;overflow:hidden;text-overflow:ellipsis\}/);
});
