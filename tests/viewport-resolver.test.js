const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('shared/geox-viewport-resolver.js', 'utf8');

function createApi() {
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
  vm.runInNewContext(code, context);
  return context;
}

const cfg = {
  site: 'geoipt',
  initialRegion: 'Región Metropolitana de Santiago',
  defaultViewport: { center: { lat: -33.4489, lon: -70.6693 }, scaleDenominator: 20000, fallbackZoom: 14.5, basemap: 'osm' },
  zoomLimits: { min: 3, max: 19, snap: 0.25 }
};

(async () => {
  const context = createApi();
  const api = context.GeoXViewport;

  let cross = api.readCrossAccessViewport(new URLSearchParams('from=crossaccess&mapCenterLat=-1&mapCenterLon=-2&mapZoom=9&basemap=sat&lat=-3&lon=-4'));
  assert.equal(cross.isValid, true);
  assert.equal(cross.centerLat, -1);
  assert.equal(cross.centerLon, -2);
  assert.equal(cross.zoom, 9);
  assert.equal(cross.basemap, 'sat');

  cross = api.readCrossAccessViewport(new URLSearchParams('crossAccess=1&lat=-3&lon=-4&zoom=10&basemap=invalid'));
  assert.equal(cross.isValid, true);
  assert.equal(cross.centerLat, -3);
  assert.equal(cross.centerLon, -4);
  assert.equal(cross.zoom, 10);
  assert.equal(cross.basemap, 'osm');

  cross = api.readCrossAccessViewport(new URLSearchParams('from=crossaccess&mapCenterLat=999&mapCenterLon=-2&mapZoom=9'));
  assert.equal(cross.isValid, false);

  let appliedBasemap = null;
  const calls = [];
  const map = { setView: (...args) => calls.push(args) };
  context.location.search = '?from=crossaccess&mapCenterLat=-1&mapCenterLon=-2&mapZoom=9&basemap=SAT';
  await api.initializeInitialViewport({
    map,
    siteId: 'geoipt',
    siteConfig: cfg,
    regionSelector: null,
    executeExistingRegionSearch: () => { throw new Error('No debe ejecutar región en Cross Access válido'); },
    applyBasemap: (basemap) => { appliedBasemap = basemap; }
  });
  assert.equal(appliedBasemap, 'sat');
  assert.equal(calls[0][0][0], -1);
  assert.equal(calls[0][0][1], -2);
  assert.equal(calls[0][1], 9);

  const selector = { value: '', options: [{ value: '13', textContent: 'Metropolitana' }] };
  let searched = null;
  context.location.search = '?from=crossaccess&mapCenterLat=999&mapCenterLon=-2&mapZoom=9';
  await api.initializeInitialViewport({
    map: { setView: () => {} },
    siteId: 'geoipt',
    siteConfig: cfg,
    regionSelector: selector,
    executeExistingRegionSearch: async (regionCode) => { searched = regionCode; },
    applyBasemap: (basemap) => { appliedBasemap = basemap; }
  });
  assert.equal(appliedBasemap, 'osm');
  assert.equal(selector.value, '13');
  assert.equal(searched, '13');

  assert.equal(api.normalizeRegionName('Región de Antofagasta'), 'antofagasta');
  assert.equal(api.normalizeRegionName('Región Metropolitana de Santiago'), 'metropolitana');
  console.log('viewport resolver tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
