const test = require("node:test");
const assert = require("node:assert/strict");
const filter = require("./viewport-filter.js");

const rectangle = (west, south, east, north) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] } });
const fakeTurf = {
  polygon: (coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } }),
  bbox: (feature) => { const flat = feature.geometry.coordinates.flat(3); const x = flat.filter((_, i) => i % 2 === 0); const y = flat.filter((_, i) => i % 2); return [Math.min(...x), Math.min(...y), Math.max(...x), Math.max(...y)]; },
  booleanIntersects: (a, b) => filter.bboxIntersects(fakeTurf.bbox(a), fakeTurf.bbox(b)),
  area: () => 1_000_000
};

test("lee únicamente límites válidos del viewport original", () => {
  assert.deepEqual(filter.readOriginalViewport(new URLSearchParams("viewWest=-71&viewSouth=-34&viewEast=-70&viewNorth=-33")), { west: -71, south: -34, east: -70, north: -33 });
  assert.equal(filter.readOriginalViewport({ viewWest: -70, viewEast: -71, viewSouth: -34, viewNorth: -33 }), null);
});

test("duplica ancho y alto conservando el centro y limita coordenadas", () => {
  assert.deepEqual(filter.expandViewportByFactor({ west: -71, south: -34, east: -70, north: -33 }), { west: -71.5, east: -69.5, south: -34.5, north: -32.5 });
  assert.deepEqual(filter.clampExpandedViewport({ west: -200, east: 190, south: -100, north: 95 }), { west: -180, east: 180, south: -90, north: 90 });
});

test("descarta por bbox antes de comprobar intersección precisa", async () => {
  let preciseCalls = 0;
  const turf = { ...fakeTurf, booleanIntersects: (...args) => { preciseCalls += 1; return fakeTurf.booleanIntersects(...args); } };
  const viewport = rectangle(0, 0, 2, 2);
  const result = await filter.filterFeaturesByViewport([rectangle(1, 1, 1.5, 1.5), rectangle(10, 10, 11, 11)], viewport, [0, 0, 2, 2], turf, 1);
  assert.equal(result.roughCandidates.length, 1);
  assert.equal(result.spatialCandidates.length, 1);
  assert.equal(preciseCalls, 1);
  assert.equal("buffer" in turf, false);
});
