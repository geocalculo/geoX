const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./analysis');

test('groups fragmented geometries as one logical entity', () => {
  const features = [1, 2].map(() => ({ properties: { id_zona: 'Zona Á' }, geometry: { type: 'Polygon', coordinates: [] } }));
  assert.equal(A.groupLogicalEntities(features, 'zonas').length, 1);
});

test('doubles viewport dimensions around its center', () => {
  assert.deepEqual(A.expandedViewport({ west: 0, east: 2, south: 2, north: 4 }), { west: -1, east: 3, south: 1, north: 5 });
});

test('exposure indices remain bounded and categories share the requested scale', () => {
  assert.equal(A.relativeExposure({ inside: true, depthRatio: 1 }), 100);
  assert.equal(A.pointTailingsExposure(0, 100), 100);
  assert.equal(A.exposureCategory(20).label, 'Muy baja');
  assert.equal(A.exposureCategory(21).label, 'Baja');
  assert.equal(A.exposureCategory(81).label, 'Muy alta');
});

test('does not invent an equivalent diameter without area', () => {
  assert.equal(A.equivalentDiameterKm(null), null);
  assert.equal(A.equivalentDiameterKm(0), null);
});
