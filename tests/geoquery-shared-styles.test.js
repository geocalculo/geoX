const assert = require('node:assert/strict');
const fs = require('node:fs');

const sharedStyles = [
  '../../shared/geoquery/geoquery-tokens.css',
  '../../shared/geoquery/geoquery-base.css',
  '../../shared/geoquery/geoquery-components.css',
  '../../shared/geoquery/geoquery-layouts.css',
  '../../shared/geoquery/geoquery-responsive.css'
];

function stylesheetOrder(html) {
  return [...html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)/gi)]
    .map((match) => match[1]);
}

const geoevaHtml = fs.readFileSync('geoeva/geoquery/geoquery.html', 'utf8');
const geomaHtml = fs.readFileSync('geoma/geoquery/geoquery.html', 'utf8');
const geomaCss = fs.readFileSync('geoma/geoquery/geoquery.css', 'utf8');
const geonemoHtml = fs.readFileSync('geonemo/geoquery/geoquery.html', 'utf8');
const geonemoCss = fs.readFileSync('geonemo/geoquery/geoquery.css', 'utf8');
const geoiptHtml = fs.readFileSync('geoipt/geoquery/geoquery.html', 'utf8');

for (const [site, html, localStylesheet] of [
  ['GeoEVA', geoevaHtml, 'css/geoeva-theme.css'],
  ['GeoMA', geomaHtml, 'geoquery.css?v=20260814-4'],
  ['GeoNEMO', geonemoHtml, 'geoquery.css']
]) {
  const links = stylesheetOrder(html);
  for (const shared of sharedStyles) {
    assert.ok(links.includes(shared), `${site}: falta ${shared}`);
  }
  const sharedEnd = Math.max(...sharedStyles.map((shared) => links.indexOf(shared)));
  assert.ok(
    links.indexOf(localStylesheet) > sharedEnd,
    `${site}: el CSS local debe cargar después de la base shared`
  );
}

assert.match(geomaCss, /--site-primary:#102a43/);
assert.match(geomaCss, /--site-background:#f4f6f8/);
assert.match(geomaCss, /--site-border:#d9e2ec/);
assert.match(geomaCss, /--gq-content-max-width:1120px/);
assert.match(geomaCss, /font-family:var\(--gq-font-family\)/);
assert.match(geomaCss, /width:min\(var\(--gq-content-max-width\),calc\(100% - 32px\)\)/);
assert.match(geomaCss, /border:1px solid var\(--site-border\)/);
assert.match(geomaCss, /border-radius:var\(--gq-radius-panel\)/);

assert.match(geonemoCss, /--site-primary:#075e54/);
assert.match(geonemoCss, /--site-background:#edf3f1/);
assert.match(geonemoCss, /--site-border:#d9e5e2/);
assert.match(geonemoCss, /--gq-content-max-width:1320px/);
assert.match(geonemoCss, /font:14px\/1\.45 var\(--gq-font-family\)/);
assert.match(geonemoCss, /max-width:var\(--gq-content-max-width\)/);
assert.match(geonemoCss, /border-radius:var\(--gq-radius-panel\)/);
assert.match(geonemoCss, /\.hero h1\{color:#fff\}/);
assert.match(geonemoCss, /\.synthesis h2\{color:#fff\}/);

const geoiptLinks = stylesheetOrder(geoiptHtml);
for (const shared of sharedStyles) {
  assert.ok(geoiptLinks.includes(shared), `GeoIPT: falta ${shared}`);
}
assert.ok(
  geoiptHtml.indexOf('../../shared/geoquery/geoquery-responsive.css') < geoiptHtml.indexOf('<style>'),
  'GeoIPT: el bloque de tema inline debe cargar después de la base shared'
);
assert.match(geoiptHtml, /--site-primary:\s*#102a43/);
assert.match(geoiptHtml, /--site-background:\s*#f4f6f8/);
assert.match(geoiptHtml, /--site-border:\s*#d9e2ec/);
assert.match(geoiptHtml, /--gq-content-max-width:\s*1120px/);
assert.match(geoiptHtml, /font-family:\s*var\(--gq-font-family\)/);
assert.match(geoiptHtml, /width:\s*min\(var\(--gq-content-max-width\), calc\(100% - 32px\)\)/);
assert.doesNotMatch(geoiptHtml, /--gq-content-max-width:\s*var\(--gq-content-max-width\)/);

console.log('GeoQuery shared style tests passed for GeoEVA, GeoMA, GeoNEMO and GeoIPT');
