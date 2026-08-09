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

test('the reusable executive template places the IER hero before the query summary', () => {
  const identity = template.indexOf('data-template-block="header"');
  const hero = template.indexOf('data-template-block="hero"');
  const summary = template.indexOf('data-template-block="query-summary"');
  assert.ok(identity > -1 && identity < hero && hero < summary);
  assert.match(template, /id="hero-ier"/);
  assert.match(template, /id="hero-classification"/);
  assert.match(template, /id="hero-verdict"/);
  assert.match(template, /Powered by GeoQuery 2\.0/);
});

test('the executive narrative keeps one synthesis and one conclusion without the former repeated cluster paragraph', () => {
  assert.equal((template.match(/data-template-block="synthesis"/g) || []).length, 1);
  assert.equal((template.match(/data-template-block="conclusion"/g) || []).length, 1);
  assert.doesNotMatch(script, /Síntesis automática del clúster/);
  assert.doesNotMatch(script, /Dictamen: \$\{indicator\} ante/);
});

test('an empty environmental-zones result leaves no report panel', () => {
  assert.match(script, /if \(!isTailings\) \{\s*target\.replaceChildren\(\);\s*return null;/);
});

test('the technical table keeps print-safe zebra rows and compact detail text', () => {
  assert.match(styles, /tbody tr:nth-child\(even\)\{background:#f8fafc/);
  assert.match(styles, /tbody td:nth-child\(6\)\{font-size:\.9em/);
  assert.match(styles, /print-color-adjust:exact/);
  assert.match(styles, /\.geoquery-pdf-export \.geoquery-table\{break-inside:auto;page-break-inside:auto\}/);
  assert.match(styles, /\.geoquery-pdf-export \.geoquery-table th,[^}]*padding:1\.44mm/);
});

test('the release-candidate charts expose dynamic context with consistent geometry', () => {
  assert.match(script, /stroke-width="41"/);
  assert.match(script, /resourceCount === 1 \? 'recurso' : 'recursos'/);
  assert.match(script, /magnitude\.totalAreaM2 \/ areaRecordCount/);
  assert.match(script, /Superficie media por relave/);
  assert.match(styles, /\.resource-surface-bars li>div\{height:14px/);
});

test('PDF CSS has one A4 authority and the KPI grid matches its single metrics child', () => {
  const shared = fs.readFileSync(`${__dirname}/../../geoquery-pdf/geoquery-print.css`, 'utf8');
  assert.doesNotMatch(styles, /@page|size\s*:\s*letter|\.is-pdf-export/iu);
  assert.match(shared, /@page\{size:A4 portrait/);
  assert.match(styles, /\.geoquery-pdf-export \.tailings-cluster-kpis\{grid-template-columns:minmax\(0,1fr\)/);
});

test('indicator values use literal less-than text and escape it at HTML sinks', () => {
  assert.match(script, /if \(score > 0 && score < 1\) return '< 1';/);
  assert.match(script, /<strong>\$\{esc\(indicatorValue\(row\.score\)\)\}<\/strong>/);
  assert.match(script, /ier\.textContent = tailings\.score === null \? 'N\/C' : indicatorValue\(tailings\.score\)/);
});

test('tailings use normal-weight names and legible resource subtitles', () => {
  assert.match(script, /geoquery-list__name/);
  assert.match(styles, /\.geoquery-list__name\{[^}]*font-weight:400/);
  assert.match(styles, /\.geoquery-list__meta\{[^}]*color:#475569;font-size:10px;font-weight:500/);
  assert.doesNotMatch(script, /<small class="tailings-list__resource"/);
  assert.doesNotMatch(template, /Preparando conclusión/);
});
