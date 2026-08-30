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

const sites = [
  {
    name: 'GeoEVA',
    htmlPath: 'geoeva/geoquery/geoquery.html',
    localStyle: 'css/geoeva-theme.css'
  },
  {
    name: 'GeoMA',
    htmlPath: 'geoma/geoquery/geoquery.html',
    localStyle: 'geoquery.css?v=20260814-4'
  },
  {
    name: 'GeoNEMO',
    htmlPath: 'geonemo/geoquery/geoquery.html',
    localStyle: 'geoquery.css'
  },
  {
    name: 'GeoIPT',
    htmlPath: 'geoipt/geoquery/geoquery.html',
    localStyle: 'geoquery.css'
  },
  {
    name: 'GeoNOXA',
    htmlPath: 'geonoxa/geoquery/geoquery.html',
    localStyle: 'geoquery.css'
  }
];

for (const site of sites) {
  const html = fs.readFileSync(site.htmlPath, 'utf8');
  const links = stylesheetOrder(html);

  for (const shared of sharedStyles) {
    assert.ok(links.includes(shared), `${site.name}: falta ${shared}`);
  }

  const sharedEnd = Math.max(...sharedStyles.map((shared) => links.indexOf(shared)));
  assert.ok(
    links.indexOf(site.localStyle) > sharedEnd,
    `${site.name}: el CSS local debe cargar después de la base shared`
  );
}

const geomaCss = fs.readFileSync('geoma/geoquery/geoquery.css', 'utf8');
assert.match(geomaCss, /--site-primary:#102a43/);
assert.match(geomaCss, /--site-background:#f4f6f8/);
assert.match(geomaCss, /--site-border:#d9e2ec/);
assert.match(geomaCss, /--gq-content-max-width:1120px/);
assert.match(geomaCss, /font-family:var\(--gq-font-family\)/);

const geonemoCss = fs.readFileSync('geonemo/geoquery/geoquery.css', 'utf8');
assert.match(geonemoCss, /--site-primary:#075e54/);
assert.match(geonemoCss, /--site-background:#edf3f1/);
assert.match(geonemoCss, /--site-border:#d9e5e2/);
assert.match(geonemoCss, /--gq-content-max-width:1320px/);
assert.match(geonemoCss, /font:14px\/1\.45 var\(--gq-font-family\)/);

const geoiptHtml = fs.readFileSync('geoipt/geoquery/geoquery.html', 'utf8');
const geoiptCss = fs.readFileSync('geoipt/geoquery/geoquery.css', 'utf8');
assert.doesNotMatch(geoiptHtml, /<style\b/i);
assert.match(geoiptCss, /--site-primary:\s*#102a43/);
assert.match(geoiptCss, /--site-background:\s*#f4f6f8/);
assert.match(geoiptCss, /--site-border:\s*#d9e2ec/);
assert.match(geoiptCss, /--gq-content-max-width:\s*1120px/);
assert.match(geoiptCss, /font-family:\s*var\(--gq-font-family\)/);
assert.doesNotMatch(geoiptCss, /--gq-content-max-width:\s*var\(--gq-content-max-width\)/);

const geonoxaHtml = fs.readFileSync('geonoxa/geoquery/geoquery.html', 'utf8');
const geonoxaCss = fs.readFileSync('geonoxa/geoquery/geoquery.css', 'utf8');
assert.doesNotMatch(geonoxaHtml, /<style\b/i);
assert.match(geonoxaCss, /--site-primary:\s*#064e3b/);
assert.match(geonoxaCss, /--site-background:\s*#f4f6f8/);
assert.match(geonoxaCss, /--site-border:\s*#d9e2ec/);
assert.match(geonoxaCss, /--gq-content-max-width:\s*1120px/);
assert.match(geonoxaCss, /font-family:\s*var\(--gq-font-family\)/);
assert.doesNotMatch(geonoxaCss, /--gq-content-max-width:\s*var\(--gq-content-max-width\)/);

console.log('GeoQuery shared style and structural tests passed for all five GeoX sites');
