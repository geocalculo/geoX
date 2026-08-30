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

for (const [site, html, localStylesheet] of [
  ['GeoEVA', geoevaHtml, 'css/geoeva-theme.css'],
  ['GeoMA', geomaHtml, 'geoquery.css?v=20260814-4']
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

console.log('GeoQuery shared style tests passed for GeoEVA and GeoMA');
