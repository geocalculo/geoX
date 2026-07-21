const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('shared/geox-viewport-resolver.js', 'utf8');
function createApi({ preview = null, permission = 'prompt' } = {}) {
  const store = preview ? { 'geox:geoipt:viewportPreview': JSON.stringify({ site: 'geoipt', ...preview }) } : {};
  const context = { console, location: { search: '' }, navigator: { permissions: { query: async () => ({ state: permission }) } }, sessionStorage: { getItem: k => store[k] || null, setItem: (k,v) => { store[k]=v; }, removeItem: k => { delete store[k]; } }, addEventListener() {} };
  context.window = context;
  vm.runInNewContext(code, context);
  return context.GeoXViewport;
}
const cfg = { site: 'geoipt', defaultViewport: { center: { lat: -33.4489, lon: -70.6693 }, scaleDenominator: 20000, fallbackZoom: 14.5, basemap: 'osm' }, locationViewport: { scaleDenominator: 20000, fallbackZoom: 14.5, basemap: 'osm' }, zoomLimits: { min: 3, max: 19, snap: 0.25 } };
const preview = { center: { lat: -10, lon: -20 }, zoom: 8, basemap: 'osm', consultedCoordinate: { lat: -11, lon: -21 }, timestamp: Date.now() };
async function resolve(api, query, opts={}) { return api.resolveInitialViewport({ siteId: 'geoipt', siteConfig: cfg, urlSearchParams: new URLSearchParams(query), ...opts }); }
(async () => {
  let api = createApi({ preview, permission: 'granted' });
  let v = await resolve(api, 'from=crossaccess&mapCenterLat=-1&mapCenterLon=-2&mapZoom=9&basemap=sat&lat=-3&lon=-4&originSite=geoeva');
  assert.equal(v.source, 'cross-access'); assert.equal(v.zoom, 9);
  api = createApi({ preview, permission: 'granted' });
  v = await resolve(api, 'from=crossaccess&mapCenterLat=999&mapCenterLon=-2&mapZoom=9');
  assert.equal(v.source, 'memory');
  api = createApi({ permission: 'granted' });
  v = await resolve(api, '', { getGps: async () => ({ lat: -33, lon: -70 }) });
  assert.equal(v.source, 'gps'); assert.ok(v.zoom > 14 && v.zoom < 15);
  api = createApi({ permission: 'granted' });
  v = await resolve(api, '', { getGps: async () => null, getIp: async () => ({ lat: -34, lon: -71 }) });
  assert.equal(v.source, 'ip');
  api = createApi({ permission: 'granted' });
  v = await resolve(api, '', { getGps: async () => null, getIp: async () => null });
  assert.equal(v.source, 'site-default'); assert.equal(v.scaleDenominator, 20000);
  api = createApi({ permission: 'denied' });
  v = await resolve(api, '', { getGps: async () => { throw new Error('popup'); } });
  assert.equal(v.source, 'site-default'); assert.equal(v.scaleDenominator, 20000);
  api = createApi({ permission: 'prompt' });
  v = await resolve(api, '', { getGps: async () => { throw new Error('popup'); } });
  assert.equal(v.source, 'site-default'); assert.equal(v.scaleDenominator, 20000);
  api = createApi({ preview: { center: { lat: 999, lon: 0 }, zoom: 1, basemap: 'osm' }, permission: 'granted' });
  v = await resolve(api, '', { getGps: async () => ({ lat: -35, lon: -72 }) });
  assert.equal(v.source, 'gps');
  api = createApi();
  v = await resolve(api, 'from=crossaccess&mapCenterLat=-1&mapCenterLon=-2&mapZoom=9&basemap=SAT&lat=-3&lon=-4');
  assert.equal(v.basemap, 'sat');
  assert.notDeepEqual(v.center, v.consultedCoordinate);
  console.log('viewport resolver tests passed');
})().catch((e) => { console.error(e); process.exit(1); });
