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

test('selects at most the ten nearest tailings with finite distances', () => {
  const candidates = [12, 3, NaN, 7, 1, 15, 2, 8, 9, 4, 6, 5, 10, 11].map(distanceKm => ({ distanceKm }));
  assert.deepEqual(A.selectNearestTailings(candidates).map(item => item.distanceKm), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(A.selectNearestTailings([{ distanceKm: 2 }, { distanceKm: 1 }]).map(item => item.distanceKm), [1, 2]);
});

test('tailings selection cannot overwrite detected or related zones', () => {
  const results = A.createAnalysisResults();
  results.relaves.detected = Array.from({ length: 12 }, (_, distanceKm) => ({ distanceKm }));
  results.zonas.detected = [{ score: 80, distanceKm: 0 }, { score: 30, distanceKm: 2 }];
  results.zonas.related = A.selectRelatedZones(results.zonas.detected);
  results.relaves.related = A.selectNearestTailings(results.relaves.detected, 10);
  assert.equal(results.relaves.related.length, 10);
  assert.deepEqual(results.zonas.related, [{ score: 80, distanceKm: 0 }]);
  assert.equal(A.totalRelatedEntities(results), 11);
});

test('maximum exposure accepts either valid index and has an explicit empty state', () => {
  const results = A.createAnalysisResults();
  assert.equal(A.maximumExposure(results), null);
  results.zonas.iez = 63;
  assert.deepEqual(A.maximumExposure(results), { group: 'ZONAS SATURADAS / LATENTES', kind: 'zonas', index: 63 });
  results.relaves.ier = 72;
  assert.deepEqual(A.maximumExposure(results), { group: 'RELAVES', kind: 'relaves', index: 72 });
});

test('resource distribution keeps five categories and groups the remainder', () => {
  const values = ['Oro', 'Oro', 'Cobre', 'Cobre', 'Hierro', 'Plata', 'Zinc', 'Litio'];
  const result = A.distribution(values, value => value, 5);
  assert.equal(result.length, 5);
  assert.equal(result.reduce((sum, item) => sum + item.count, 0), values.length);
  assert.equal(result.at(-1).name, 'Otros');
});

test('validates marker coordinates and obtains a tailings name from real field variants', () => {
  assert.equal(A.isValidCoordinate(-30.2, -71.1), true);
  assert.equal(A.isValidCoordinate(NaN, -71.1), false);
  assert.equal(A.isValidCoordinate(-91, -71.1), false);
  assert.equal(A.getTailingsName({ properties: { faena: '  El Sauce  ' } }), 'El Sauce');
  assert.equal(A.getTailingsName({ properties: { NOMBRE_RELAVE: 'Depósito 4' } }), 'Depósito 4');
  assert.equal(A.getTailingsName({ properties: {} }), 'Relave sin nombre');
});
