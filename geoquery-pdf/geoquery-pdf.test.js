const test = require('node:test');
const assert = require('node:assert/strict');

global.requestAnimationFrame = callback => setImmediate(callback);
const GeoQueryPDF = require('./geoquery-pdf');

function element() {
  const classes = new Set();
  return {
    ownerDocument: { fonts: { ready: Promise.resolve() } },
    classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ width: 800, height: 1000 }),
    scrollWidth: 800,
    scrollHeight: 1000,
    classes
  };
}

test('register and ready remain separate lifecycle states', async () => {
  const root = element();
  let factoryCalled = false;
  const html2pdf = () => {
    factoryCalled = true;
    const pdf = {};
    const worker = {
      set: settings => (assert.equal(settings.filename, 'report.pdf'), worker),
      from: source => (assert.equal(source, root), worker),
      toPdf: () => worker,
      get: async () => pdf,
      save: async () => {}
    };
    return worker;
  };

  GeoQueryPDF.register({ root, maps: [], charts: [], filename: 'report.pdf' });
  const exported = GeoQueryPDF.exportPDF({ html2pdf });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(factoryCalled, false, 'register must not mark the report ready');
  GeoQueryPDF.ready();
  assert.equal(await exported, await exported);
  assert.equal(factoryCalled, true);
  assert.equal(root.classes.has('geoquery-pdf-preparing'), false);
});

test('shared core contains no product-specific branch', () => {
  const fs = require('node:fs');
  for (const file of ['geoquery-pdf.js', 'pagination.js', 'leaflet-adapter.js', 'chart-adapter.js', 'render-stabilizer.js']) {
    assert.doesNotMatch(fs.readFileSync(require.resolve(`./${file}`), 'utf8'), /geonoxa|relaves|\bIER\b/i);
  }
});

test('shared pagination owns A4 settings and never fixes map geometry', () => {
  const fs = require('node:fs');
  const css = fs.readFileSync(require.resolve('./geoquery-print.css'), 'utf8');
  assert.match(css, /@page\{size:A4 portrait/);
  assert.doesNotMatch(css, /letter|\.map\s*\{|height:/i);
  assert.equal(GeoQueryPDF.html2pdfOptions().jsPDF.format, 'a4');
});
