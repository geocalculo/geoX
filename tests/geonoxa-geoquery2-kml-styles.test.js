const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global;
vm.runInThisContext(fs.readFileSync('shared/geoquery-kml-exporter.js', 'utf8'));

const styles = GeoQueryKmlExporter.geoNoxaStyles();
const kml = GeoQueryKmlExporter.buildGeoQueryKml({
  site: 'geonoxa',
  debugTheme: false,
  folders: [{ id: 'cluster', name: 'Radio' }, { id: 'relaves', name: 'Relaves' }],
  features: [
    { id: 'radius', folderId: 'cluster', type: 'polygon', name: 'Radio', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, styleId: 'Style-Radio', style: styles.radius },
    { id: 'relave', folderId: 'relaves', type: 'point', name: 'Relave', geometry: { type: 'Point', coordinates: [0, 0] }, styleId: 'Style-Relave', style: styles.relave }
  ]
});

assert.match(kml, /<Style id="Style-Radio">[\s\S]*?<LineStyle><color>ff0c58ea<\/color><width>2\.0<\/width><\/LineStyle><PolyStyle><color>1f1673f9<\/color>/);
assert.match(kml, /<Style id="Style-Relave">[\s\S]*?<IconStyle><color>ff1673f9<\/color><scale>1\.00<\/scale><Icon><href>http:\/\/maps\.google\.com\/mapfiles\/kml\/shapes\/placemark_circle\.png<\/href>/);
assert.match(kml, /<Style id="Style-Relave">[\s\S]*?<LabelStyle><color>ff12349a<\/color><scale>0\.90<\/scale>/);

const production = fs.readFileSync('geonoxa/geoquery/geoquery.js', 'utf8');
const geoQuery2 = fs.readFileSync('geonoxa/geoquery2/geoquery.js', 'utf8');
assert.match(production, /GeoQueryKmlExporter\.geoNoxaStyles\(\)/);
assert.match(geoQuery2, /exporter\.geoNoxaStyles\(\)/);
assert.doesNotMatch(geoQuery2, /<Style>|<StyleMap>/);

console.log('GeoQuery and GeoQuery2 reuse the same production GeoNOXA KML styles.');
