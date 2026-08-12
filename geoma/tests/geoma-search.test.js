const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const code = fs.readFileSync('js/geoma-search.js', 'utf8');
const context = {window: null, console, Intl, Number, String, Map, setTimeout, clearTimeout};
context.window = context;
vm.runInNewContext(code, context);
const {GeoMASearch} = context;

assert.equal(typeof GeoMASearch.init, 'function', 'la API usada por geoma-map debe inicializar el autocomplete');
assert.equal(GeoMASearch.normalize('  Región de ÑUBLE  '), 'region de nuble');
assert.equal(GeoMASearch.clean('NULL'), '');
assert.match(GeoMASearch.formatArea(2500000), /2,5 km²/);
assert.equal(GeoMASearch.CATALOG_PATH, 'capas_tosearch/catalogo.json');

const catalog = JSON.parse(fs.readFileSync('capas_tosearch/catalogo.json', 'utf8'));
assert.equal(catalog.layer_count, 16);
assert.deepEqual(catalog.search_priority, ['Nombre', 'Tipo', 'Comuna']);
assert.equal(catalog.search_fields.area, 'st_area_sh');
assert.equal(catalog.search_fields.diameter, null, 'los GeoJSON no ofrecen un campo real de diámetro equivalente');
assert(catalog.layers.every((layer) => fs.existsSync(`capas_tosearch/${layer.file}`)));

const fixtures = {type: 'FeatureCollection', features: [
  {type: 'Feature', properties: {Nombre: 'Lago Ranco', Tipo: 'Lago', Comuna: 'Lago Ranco', Region: 'Región de Los Ríos', st_area_sh: 442000000}, geometry: null},
  {type: 'Feature', properties: {Nombre: 'Laguna Verde', Tipo: 'Laguna', Comuna: 'San Pablo', Provincia: 'Osorno', Region: 'Región de Los Lagos', st_area_sh: 50000}, geometry: null},
  {type: 'Feature', properties: {Nombre: 'Embalse Colbún', Tipo: 'Embalse', Comuna: 'Colbún', Region: 'Región del Maule'}, geometry: null}
]};
const search = GeoMASearch.createSearch({}, {
  fetchJson: async (path) => path.endsWith('catalogo.json') ? {...catalog, layers: [{file: 'fixture.geojson', enabled: true, region: 'Test'}]} : fixtures,
  schedule: (callback) => callback()
});

// Populate without binding the browser UI: makeItem uses the real configured fields.
fixtures.features.forEach((feature) => search.items.push(search.makeItem(feature, {region: 'Test'})));
assert.equal(search.find('ranco')[0].title, 'Lago Ranco');
assert.equal(search.find('laguna')[0].title, 'Laguna Verde');
assert.equal(search.find('osorno')[0].title, 'Laguna Verde');
assert.equal(search.find('embalse colbun')[0].title, 'Embalse Colbún');
assert.equal(search.find('ÑUBLE').length, 0);

console.log('GeoMA search tests passed: catálogo, campos, tildes, palabras y prioridad');
