const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const script = fs.readFileSync(`${__dirname}/geoquery.js`, 'utf8');
const template = fs.readFileSync(`${__dirname}/geoquery.html`, 'utf8');
const styles = fs.readFileSync(`${__dirname}/geoquery.css`, 'utf8');

test('the final narrative places the analysis conclusion before technical details', () => {
  const conclusion = template.indexOf('CONCLUSIÓN DEL ANÁLISIS');
  const details = template.indexOf('INFORMACIÓN COMPLEMENTARIA');
  assert.ok(conclusion > -1 && conclusion < details);
});

test('an empty environmental-zones result leaves no report panel', () => {
  assert.match(script, /if \(!isTailings\) \{\s*target\.replaceChildren\(\);\s*return null;/);
});

test('the technical table keeps print-safe zebra rows and compact detail text', () => {
  assert.match(styles, /tbody tr:nth-child\(even\)\{background:#f8fafc/);
  assert.match(styles, /tbody td:nth-child\(6\)\{font-size:\.9em/);
  assert.match(styles, /print-color-adjust:exact/);
  assert.match(styles, /\.pdf-export-root \.geoquery-table\{break-inside:auto;page-break-inside:auto\}/);
  assert.match(styles, /\.pdf-export-root \.geoquery-table th,[^}]*padding:1\.44mm/);
});

test('the release-candidate charts expose dynamic context with consistent geometry', () => {
  assert.match(script, /stroke-width="41"/);
  assert.match(script, /resourceCount === 1 \? 'recurso' : 'recursos'/);
  assert.match(script, /magnitude\.totalAreaM2 \/ areaRecordCount/);
  assert.match(script, /Superficie media por relave/);
  assert.match(styles, /\.resource-surface-bars li>div\{height:14px/);
});

test('tailings use normal-weight names and legible resource subtitles', () => {
  assert.match(script, /geoquery-list__name/);
  assert.match(styles, /\.geoquery-list__name\{[^}]*font-weight:400/);
  assert.match(styles, /\.geoquery-list__meta\{[^}]*color:#475569;font-size:10px;font-weight:500/);
  assert.doesNotMatch(script, /<small class="tailings-list__resource"/);
  assert.doesNotMatch(template, /Preparando conclusión/);
});
