const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('shared/geoquery-context.js', 'utf8');

let stored = null;
let replaced = null;
const listeners = {};
const context = {
  console,
  URL,
  URLSearchParams,
  Date,
  setTimeout,
  location: {
    href: 'https://geocalculo.cl/geoeva/index.html',
    search: ''
  },
  history: {
    state: null,
    replaceState(state, _title, url) {
      this.state = state;
      replaced = String(url);
    }
  },
  sessionStorage: {
    getItem() { return stored; },
    setItem(_key, value) { stored = value; }
  },
  addEventListener(type, handler) { listeners[type] = handler; }
};
context.window = context;

vm.runInNewContext(code, context);
assert.ok(context.GeoXGeoQueryContext);

const api = context.GeoXGeoQueryContext.create({
  site: 'geoeva',
  normalizeBasemap: (value) => String(value || '').toLowerCase() === 'sat' ? 'sat' : 'osm'
});

const map = {
  getCenter: () => ({ lat: -23.65, lng: -70.4 }),
  getZoom: () => 10,
  getBounds: () => ({
    getWest: () => -71,
    getSouth: () => -24,
    getEast: () => -70,
    getNorth: () => -23
  }),
  setView(latlon, zoom) {
    this.lastView = { latlon, zoom };
  },
  invalidateSize() {}
};

const captured = api.capture({
  map,
  queryLat: -23.6,
  queryLon: -70.35,
  basemap: 'sat',
  from: 'index'
});

assert.equal(captured.site, 'geoeva');
assert.equal(captured.map.basemap, 'sat');
assert.deepEqual(
  { lat: captured.queryPoint.lat, lon: captured.queryPoint.lon },
  { lat: -23.6, lon: -70.35 }
);

api.persist(captured);
assert.ok(stored);
assert.ok(context.history.state.geoQueryOrigin);
assert.match(replaced, /restoreViewport=1/);
assert.match(replaced, /mapCenterLat=-23.65/);

const target = api.appendToGeoQueryUrl('./geoquery/geoquery.html?site=geoeva', captured);
assert.match(target, /^\.\/geoquery\/geoquery\.html\?/);
assert.match(target, /queryLat=-23.6/);
assert.match(target, /viewWest=-71/);

context.location.search = '';
context.history.state = null;
const restoredFromStorage = api.resolve();
assert.equal(restoredFromStorage.site, 'geoeva');

let basemapApplied = null;
let pointApplied = null;
let restoredState = null;
assert.equal(api.restore(map, captured, {
  applyBasemap: (value) => { basemapApplied = value; },
  applyQueryPoint: (lat, lon) => { pointApplied = { lat, lon }; },
  onRestore: (state) => { restoredState = state; }
}), true);
assert.equal(basemapApplied, 'sat');
assert.deepEqual(pointApplied, { lat: -23.6, lon: -70.35 });
assert.equal(restoredState.site, 'geoeva');

const sites = ['geoipt', 'geoeva', 'geonemo', 'geonoxa'];
for (const site of sites) {
  const html = fs.readFileSync(`${site}/index.html`, 'utf8');
  const indexJs = fs.readFileSync(`${site}/js/index.js`, 'utf8');

  assert.match(html, /\.\.\/shared\/geoquery-context\.js/);
  assert.ok(
    html.indexOf('../shared/geoquery-context.js') < html.indexOf('./js/index.js'),
    `${site}: geoquery-context debe cargar antes de index.js`
  );
  assert.match(indexJs, /GeoXGeoQueryContext\.create/);
  assert.doesNotMatch(indexJs, /function\s+getGeoQueryOriginStorageKey\b/);
  assert.doesNotMatch(indexJs, /function\s+readOriginStateFromUrl\b/);
  assert.doesNotMatch(indexJs, /function\s+readOriginStateFromHistory\b/);
  assert.doesNotMatch(indexJs, /function\s+readOriginStateFromSessionStorage\b/);
}

console.log('GeoX GeoQuery context shared tests passed');


const geomaHtml = fs.readFileSync('geoma/index.html', 'utf8');
const geomaMap = fs.readFileSync('geoma/js/geoma-map.js', 'utf8');
const geomaGeoQuery = fs.readFileSync('geoma/geoquery/geoquery.js', 'utf8');
assert.match(geomaHtml, /\.\.\/shared\/geoquery-context\.js/);
assert.ok(
  geomaHtml.indexOf('../shared/geoquery-context.js') < geomaHtml.indexOf('js/geoma-map.js'),
  'GeoMA: geoquery-context debe cargar antes de geoma-map.js'
);
assert.match(geomaMap, /GeoXGeoQueryContext\.create/);
assert.match(geomaMap, /geoQueryContext\.capture/);
assert.match(geomaMap, /geoQueryContext\.persist/);
assert.match(geomaMap, /geoQueryContext\.appendToGeoQueryUrl/);
assert.match(geomaMap, /geoQueryContext\.restore/);
assert.match(geomaMap, /geoQueryContext\.installRestoreHandlers/);
assert.match(geomaGeoQuery, /function buildReturnUrl\(\)/);
assert.match(geomaGeoQuery, /restoreViewport/);
console.log('GeoMA GeoQuery context integration tests passed');
