const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = {window: null, console};
context.window = context;
vm.runInNewContext(fs.readFileSync('shared/geox-label-grid.js', 'utf8'), context);

const map = {
  getSize: () => ({x: 900, y: 600}),
  latLngToContainerPoint: (latlng) => ({x: latlng.x, y: latlng.y})
};
const candidates = [
  {id: 'small', text: 'Laguna menor', latlng: {x: 300, y: 250}, area: 300},
  {id: 'large', text: 'Embalse principal', latlng: {x: 300, y: 250}, area: 15000}
];

const selected = context.GeoXLabelGrid.selectLabels(map, candidates, {
  priorityComparator: (a, b) => b.area - a.area
});

assert.deepEqual(Array.from(selected, (candidate) => candidate.id), ['large']);
console.log('GeoX label grid priority test passed');
