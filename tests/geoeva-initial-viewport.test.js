const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const viewportConfig = JSON.parse(fs.readFileSync('geoeva/parametros/viewport.json', 'utf8'));
const resolverCode = fs.readFileSync('shared/geox-viewport-resolver.js', 'utf8');
const indexCode = fs.readFileSync('geoeva/js/index.js', 'utf8');

const context = {
  console,
  location: { search: '' },
  navigator: {},
  sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  addEventListener() {},
  setTimeout,
  URLSearchParams
};
context.window = context;
vm.runInNewContext(resolverCode, context);

assert.equal(viewportConfig.defaultLocationLabel, 'Antofagasta');
assert.equal(viewportConfig.defaultViewport.scaleDenominator, 100000);
assert.equal(viewportConfig.locationViewport.scaleDenominator, 100000);
assert.equal(viewportConfig.initialViewport.referenceScale, '1:100.000');

const resolved = context.GeoXViewport.buildDefaultViewport('geoeva', viewportConfig);
assert.deepEqual(
  { lat: resolved.center.lat, lon: resolved.center.lon },
  viewportConfig.defaultViewport.center
);
assert.equal(resolved.scaleDenominator, 100000);
assert.match(indexCode, /GeoXViewport\.buildDefaultViewport\(SITE_ID, window\.geoxSiteConfig\)/);

console.log('GeoEVA initial viewport tests passed');
