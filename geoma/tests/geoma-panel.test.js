const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/geoma-panel.js', 'utf8');
const context = {
  console,
  window: null,
  Map,
  Number,
  String,
  GeoXLabelFormatter: {formatLabelText: (_siteId, _layerId, text) => text == null ? '' : String(text).trim().replace(/\s+/g, ' ')}
};
context.window = context;
vm.runInNewContext(code, context);
const {GeoMAPanel} = context;

assert.equal(GeoMAPanel.intersects({west: -71, south: -22, east: -68, north: -18}, [-70, -21, -69, -19]), true);
assert.equal(GeoMAPanel.intersects({west: -71, south: -22, east: -68, north: -18}, [-75, -50, -72, -44]), false);
assert.equal(GeoMAPanel.validName('  Lago Azul '), 'Lago Azul');
for (const empty of [null, undefined, '', '  ', 'NULL', 'undefined']) assert.equal(GeoMAPanel.validName(empty), null);
assert.equal(GeoMAPanel.featureLabel({properties: {Nombre: ' Lago Llanquihue ', Tipo: 'Lago', Comuna: 'Puerto Varas'}}), 'Lago Llanquihue');
assert.equal(GeoMAPanel.featureLabel({properties: {Nombre: 'NULL', Tipo: ' Laguna ', Comuna: ' Osorno '}}), 'Laguna - Osorno');
assert.equal(GeoMAPanel.featureLabel({properties: {Nombre: '', Tipo: 'Embalse', Comuna: '  '}}), 'Embalse');
assert.equal(GeoMAPanel.featureLabel({properties: {Nombre: undefined, Tipo: 'NULL', Comuna: 'Castro'}}), null);
assert.match(GeoMAPanel.getMobileLabelEyeIcon(true), /<circle cx="12" cy="12" r="3"/);
assert.match(GeoMAPanel.getMobileLabelEyeIcon(false), /M3 3l18 18/);

const page = fs.readFileSync('index.html', 'utf8');
assert.match(page, /id="mobile-layer-toggle" class="mobile-layer-toggle is-inactive"/);
assert.match(page, /class="mobile-layer-toggle-icon"/);
assert.match(page, /class="mobile-layer-toggle-text">Etiquetas<\/span>/);

const catalog = JSON.parse(fs.readFileSync('capas_panel/catalogo_geoma.json', 'utf8'));
let viewport = {west: -70.4, south: -21.7, east: -68.3, north: -18.7};
let zoom = 7;
const listeners = {};
const viewportBounds = {
  getWest: () => viewport.west,
  getSouth: () => viewport.south,
  getEast: () => viewport.east,
  getNorth: () => viewport.north,
  intersects: (featureBounds) => featureBounds.visible,
  contains: () => false
};
const map = {
  getZoom: () => zoom,
  getBounds: () => ({
    ...viewportBounds,
    pad: () => viewportBounds
  }),
  on: (events, callback) => { events.split(' ').forEach((event) => { listeners[event] = callback; }); }
};
const requests = [];
const featureLayers = [];
const geoJsonSettings = [];
const tooltipSettings = [];
const loader = GeoMAPanel.createLoader(map, {
  fetchJson: async (path) => {
    requests.push(path);
    if (path.endsWith('catalogo_geoma.json')) return catalog;
    return JSON.parse(fs.readFileSync(decodeURIComponent(path), 'utf8'));
  },
  createGeoJson(data, options) {
    geoJsonSettings.push(options);
    const child = {
      feature: data.features.find((feature) => GeoMAPanel.validName(feature.properties?.Nombre)) || data.features[0], bound: false, visible: false, binds: 0,
      getBounds() { return {visible: this.visible, isValid: () => true}; },
      bindTooltip(_label, settings) { this.bound = true; this.binds += 1; tooltipSettings.push(settings); },
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

  assert(featureLayers.every((layer) => !layer.bound), 'cargar polígonos no debe crear etiquetas');
  featureLayers[0].visible = true;
  zoom = GeoMAPanel.MIN_LABEL_ZOOM - 1;
  loader.setLabels(true);
  assert(featureLayers.every((layer) => !layer.bound), 'el checkbox queda activo sin etiquetas bajo el zoom mínimo');

  zoom = GeoMAPanel.MIN_LABEL_ZOOM;
  loader.refreshLabels();
  assert.equal(featureLayers[0].bound, true, 'la feature visible debe rotularse al alcanzar el zoom mínimo');
  assert(featureLayers.slice(1).every((layer) => !layer.bound), 'las features fuera del viewport no deben rotularse');
  loader.refreshLabels();
  assert.equal(featureLayers[0].binds, 1, 'una etiqueta activa no debe volver a crearse');
  assert(tooltipSettings.every((settings) => settings.permanent === true));
  assert(tooltipSettings.every((settings) => settings.className === 'geoma-panel-label'));

  featureLayers[0].visible = false;
  featureLayers[1].visible = true;
  listeners.moveend();
  assert.equal(featureLayers[0].bound, false, 'la etiqueta que sale del viewport debe retirarse');
  assert.equal(featureLayers[1].bound, true, 'moveend debe rotular la nueva feature visible');

  loader.setLabels(false);
  assert(featureLayers.every((layer) => !layer.bound));
  assert.equal(loader.loaded.size > 0, true, 'ocultar etiquetas no elimina polígonos');

  zoom = 4;
  assert.equal(loader.requiredForViewport().length, 0, 'la vista nacional no debe descargar las 16 capas');
  assert.deepEqual(Object.keys(listeners), ['moveend', 'zoomend']);
  console.log('GeoMA panel tests passed: viewport, límite, Aysén, caché y etiquetas');
})().catch((error) => { console.error(error); process.exitCode = 1; });
