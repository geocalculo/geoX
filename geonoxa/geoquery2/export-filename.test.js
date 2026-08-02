const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

vm.runInThisContext(fs.readFileSync('geonoxa/geoquery2/export-filename.js', 'utf8'));

const localDate = new Date(2026, 7, 2, 11, 14, 25);
assert.equal(buildExportFilename('GeoNOXA', '.PDF', localDate), 'geonoxa_20260802_111425.pdf');
assert.equal(buildExportFilename(' Geo EVA ', 'KML', localDate), 'geo_eva_20260802_111425.kml');
assert.equal(buildExportFilename('GeoNEMO módulo', 'pdf', localDate), 'geonemo_m_dulo_20260802_111425.pdf');

console.log('Export filenames use the normalized module name and the supplied local timestamp.');
