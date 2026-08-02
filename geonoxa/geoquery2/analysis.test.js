const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('./analysis');

test('groups fragmented geometries as one logical entity', () => {
  const features = [1, 2].map(() => ({ properties: { id_zona: 'Zona Á' }, geometry: { type: 'Polygon', coordinates: [] } }));
  assert.equal(A.groupLogicalEntities(features, 'zonas').length, 1);
});

test('prefilters candidate geometries against the original viewport bbox', () => {
  const viewport = [-72, -31, -71, -30];
  assert.equal(A.bboxIntersects([-71.5, -30.5, -70.5, -29.5], viewport), true);
  assert.equal(A.bboxIntersects([-70.9, -30.5, -70.1, -29.5], viewport), false);
  assert.equal(A.bboxIntersects([-72.5, -31.5, -72, -31], viewport), true);
  assert.equal(A.bboxIntersects([NaN, -31, -71, -30], viewport), false);
});

test('includes point tailings only when their coordinates are inside the original viewport', () => {
  const viewport = { west: -72, south: -31, east: -71, north: -30 };
  assert.equal(A.pointInsideViewport(-30.5, -71.5, viewport), true);
  assert.equal(A.pointInsideViewport(-30, -71, viewport), true);
  assert.equal(A.pointInsideViewport(-30.5, -70.999, viewport), false);
  assert.equal(A.pointInsideViewport(-29.999, -71.5, viewport), false);
});

test('does not complete a tailings selection with candidates outside the viewport', () => {
  const viewport = { west: -72, south: -31, east: -71, north: -30 };
  const candidates = [
    { lat: -30.2, lon: -71.2, distanceKm: 20 },
    { lat: -30.4, lon: -71.4, distanceKm: 10 },
    { lat: -30.5, lon: -70.5, distanceKm: 5 }
  ];
  const detected = candidates.filter(item => A.pointInsideViewport(item.lat, item.lon, viewport));
  assert.deepEqual(A.selectNearestTailings(detected, 10).map(item => item.distanceKm), [10, 20]);
});

test('exposure indices remain bounded and categories share the requested scale', () => {
  assert.equal(A.relativeExposure({ inside: true, depthRatio: 1 }), 100);
  assert.equal(A.relativeExposure({ inside: true, depthRatio: 0.38 }), 38);
  assert.equal(A.pointTailingsExposure(0, 100), 100);
  assert.equal(A.exposureCategory(20).label, 'Muy baja');
  assert.equal(A.exposureCategory(21).label, 'Baja');
  assert.equal(A.exposureCategory(81).label, 'Muy alta');
});

test('uses exposure for tailings and position-dependent semantics for zones', () => {
  assert.deepEqual([A.indicatorSemantics('relaves', false, 64).code, A.indicatorSemantics('relaves', false, 64).interpretation], ['IER', 'Exposición alta']);
  assert.deepEqual([A.indicatorSemantics('zonas', false, 43).code, A.indicatorSemantics('zonas', false, 43).interpretation], ['IPT', 'Proximidad media']);
  assert.deepEqual([A.indicatorSemantics('zonas', true, 72).code, A.indicatorSemantics('zonas', true, 72).interpretation], ['IIT', 'Inmersión alta']);
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

test('normalizes tailings coordinates from geometry and known property variants', () => {
  assert.deepEqual(A.getRelaveCoordinates({ geometry: { type: 'Point', coordinates: [-71.1, -30.2] } }), { lat: -30.2, lon: -71.1 });
  assert.deepEqual(A.getRelaveCoordinates({ properties: { latitud: '-30.3', longitud: '-71.2' } }), { lat: -30.3, lon: -71.2 });
  assert.equal(A.getRelaveCoordinates({ properties: { latitud: 200, longitud: -71 } }), null);
});

test('builds complete tailings metadata from the original feature', () => {
  const feature = { properties: { faena: 'A & B', recurso: 'COBRE', tipo_deposito: 'TRANQUE', shape_area_m2: 12080.6, empresa: 'Titular', comuna: 'Ovalle', region: 'Coquimbo', id_relave: 'R-7' } };
  const first = A.buildTailingsKmlMetadata({ feature, distanceKm: 10.1 }, 0, 10);
  const last = A.buildTailingsKmlMetadata({ feature, distanceKm: 10.8 }, 9, 10);
  assert.deepEqual(first, { order: 1, total: 10, name: 'A & B', resource: 'COBRE', status: 'TRANQUE', distanceKm: 10.1, area: 12080.6, owner: 'Titular', commune: 'Ovalle', region: 'Coquimbo', id: 'R-7', role: 'Relave más cercano' });
  assert.equal(last.role, 'Límite del clúster');
  assert.equal(A.escapeXml(`A&B <x> "q" 's'`), 'A&amp;B &lt;x&gt; &quot;q&quot; &apos;s&apos;');
});
