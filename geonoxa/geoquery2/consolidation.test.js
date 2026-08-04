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
});
