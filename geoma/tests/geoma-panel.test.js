const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/geoma-panel.js', 'utf8');
const context = {console, window: null, Map, Number, String};
context.window = context;
vm.runInNewContext(code, context);
const {GeoMAPanel} = context;

assert.equal(GeoMAPanel.intersects({west: -71, south: -22, east: -68, north: -18}, [-70, -21, -69, -19]), true);
assert.equal(GeoMAPanel.intersects({west: -71, south: -22, east: -68, north: -18}, [-75, -50, -72, -44]), false);
assert.equal(GeoMAPanel.validName('  Lago Azul '), 'Lago Azul');
for (const empty of [null, undefined, '', '  ', 'NULL', 'undefined']) assert.equal(GeoMAPanel.validName(empty), null);

const catalog = JSON.parse(fs.readFileSync('capas_panel/catalogo_geoma.json', 'utf8'));
let viewport = {west: -70.4, south: -21.7, east: -68.3, north: -18.7};
let zoom = 7;
const listeners = {};
const map = {
  getZoom: () => zoom,
  getBounds: () => ({
    pad: () => ({getWest: () => viewport.west, getSouth: () => viewport.south, getEast: () => viewport.east, getNorth: () => viewport.north})
  }),
  on: (event, callback) => { listeners[event] = callback; }
};
const requests = [];
const featureLayers = [];
const geoJsonSettings = [];
const loader = GeoMAPanel.createLoader(map, {
  fetchJson: async (path) => {
    requests.push(path);
    if (path.endsWith('catalogo_geoma.json')) return catalog;
    return JSON.parse(fs.readFileSync(decodeURIComponent(path), 'utf8'));
  },
  createGeoJson(data, options) {
    geoJsonSettings.push(options);
    const child = {
      feature: data.features.find((feature) => GeoMAPanel.validName(feature.properties?.Nombre)) || data.features[0], bound: false,
      bindTooltip() { this.bound = true; },
      unbindTooltip() { this.bound = false; }
    };
    options.onEachFeature(child.feature, child);
    featureLayers.push(child);
    return {addTo() { return this; }, eachLayer(callback) { callback(child); }};
  }
});

(async () => {
  await loader.init();
  await Promise.all(loader.loading.values());
  const initialFiles = requests.filter((path) => path.endsWith('.geojson'));
  assert(initialFiles.some((path) => decodeURIComponent(path).includes('Tarapacá')));
  assert(!initialFiles.some((path) => decodeURIComponent(path).includes('Aysén')));
  assert(!initialFiles.some((path) => decodeURIComponent(path).includes('Magallanes')));
  assert(!initialFiles.some((path) => decodeURIComponent(path).includes('Los Lagos')));

  const tarapacaRequests = initialFiles.length;
  viewport = {west: -71.7, south: -30, east: -68.3, north: -28.8};
  loader.evaluate();
  await Promise.all(loader.loading.values());
  assert.equal(loader.loaded.has('atacama'), true);
  assert.equal(loader.loaded.has('coquimbo'), true, 'el límite regional debe requerir ambas capas');
  assert(geoJsonSettings.every((settings) => typeof settings.coordsToLatLng === 'function'), 'las capas EPSG:3857 deben reproyectarse');
  assert(geoJsonSettings.every((settings) => settings.pane === 'overlayPane'), 'las capas deben dibujarse sobre el mapa base');
  const afterBoundary = requests.length;
  viewport = {west: -75.7, south: -49.4, east: -71.2, north: -43.7};
  loader.evaluate();
  await Promise.all(loader.loading.values());
  assert(requests.slice(afterBoundary).some((path) => decodeURIComponent(path).includes('Aysén')));

  viewport = {west: -71.3, south: -29.2, east: -68.3, north: -25.3};
  loader.evaluate();
  await Promise.all(loader.loading.values());
  assert.equal(requests.filter((path) => decodeURIComponent(path).includes('Atacama.geojson')).length, 1, 'Atacama no debe descargarse otra vez');
  assert.equal(initialFiles.length >= tarapacaRequests, true);

  loader.setLabels(true);
  assert(featureLayers.every((layer) => layer.bound));
  loader.setLabels(false);
  assert(featureLayers.every((layer) => !layer.bound));
  assert.equal(loader.loaded.size > 0, true, 'ocultar etiquetas no elimina polígonos');

  zoom = 4;
  assert.equal(loader.requiredForViewport().length, 0, 'la vista nacional no debe descargar las 16 capas');
  assert.deepEqual(Object.keys(listeners), ['moveend']);
  console.log('GeoMA panel tests passed: viewport, límite, Aysén, caché y etiquetas');
})().catch((error) => { console.error(error); process.exitCode = 1; });
