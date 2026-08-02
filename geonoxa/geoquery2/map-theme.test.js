const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('./map-theme');

test('satellite styling is fluorescent yellow', () => {
  const style = theme.entityStyle('relaves', 'sat', false);
  assert.equal(style.color, '#eaff00');
  assert.equal(style.fillColor, '#eaff00');
});

test('restyle uses setStyle and does not recreate data', () => {
  let applied;
  const layer = { setStyle(style) { applied = style; } };
  theme.restyle([{ layer, kind: 'saturada', selected: true }], 'sat');
  assert.equal(applied.color, '#eaff00');
});

test('cluster and distance layers change style with the basemap', () => {
  assert.equal(theme.clusterStyle('osm').color, '#ff7a00');
  assert.equal(theme.clusterStyle('sat').color, '#eaff00');
  assert.equal(theme.distanceStyleFor('sat').color, '#22d3ee');
});
