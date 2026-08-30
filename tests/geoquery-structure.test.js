const assert = require('node:assert/strict');
const fs = require('node:fs');

function inlineScripts(html) {
  return [...html.matchAll(new RegExp('<script\\b([^>]*)>([\\s\\S]*?)<\\/script>', 'gi'))]
    .filter((match) => !new RegExp('\\bsrc\\s*=', 'i').test(match[1]));
}

function scriptSources(html) {
  return [...html.matchAll(new RegExp('<script\\b[^>]*src=[\"\\\']([^\"\\\']+)[\"\\\'][^>]*><\\/script>', 'gi'))]
    .map((match) => match[1]);
}

const siteScripts = {
  GeoIPT: { html: 'geoipt/geoquery/geoquery.html', expected: 'geoquery.js' },
  GeoEVA: { html: 'geoeva/geoquery/geoquery.html', expected: 'js/geoquery2.js' },
  GeoNEMO: { html: 'geonemo/geoquery/geoquery.html', expected: 'geoquery.js' },
  GeoNOXA: { html: 'geonoxa/geoquery/geoquery.html', expected: 'geoquery.js' },
  GeoMA: { html: 'geoma/geoquery/geoquery.html', expected: 'geoquery.js?v=20260814-2' }
};

for (const [site, config] of Object.entries(siteScripts)) {
  const html = fs.readFileSync(config.html, 'utf8');
  const sources = scriptSources(html);
  assert.ok(sources.includes(config.expected), site + ': falta el JavaScript GeoQuery externo ' + config.expected);
}

const geoiptHtml = fs.readFileSync('geoipt/geoquery/geoquery.html', 'utf8');
const geoiptJs = fs.readFileSync('geoipt/geoquery/geoquery.js', 'utf8');
assert.equal(inlineScripts(geoiptHtml).length, 0, 'GeoIPT no debe volver a incorporar JavaScript inline');
assert.ok(geoiptJs.length > 50000, 'GeoIPT: la lógica extraída debe conservar el bloque funcional completo');
assert.doesNotThrow(() => new Function(geoiptJs), 'GeoIPT geoquery.js debe conservar sintaxis JavaScript válida');

const sources = scriptSources(geoiptHtml);
assert.ok(sources.indexOf('pdf/geoIptPdfExport.js') < sources.indexOf('geoquery.js'), 'GeoIPT: geoquery.js debe cargar después del módulo PDF');
assert.ok(sources.indexOf('geoquery.js') < sources.indexOf('../../shared/geocalculo-telemetry.js'), 'GeoIPT: se conserva el orden previo respecto de telemetría');

console.log('GeoQuery structural test passed: all five sites expose external JS and GeoIPT has no inline JavaScript');
