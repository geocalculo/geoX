const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createViewportPolygon,
  calculateEquivalentDiameterKm,
  isCandidateByViewport
} = require("./viewport-filter.js");

function rectangleFeature(west, south, east, north, areaM2 = 1_000_000) {
  return {
    type: "Feature",
    properties: { areaM2 },
    geometry: { type: "Polygon", coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]] }
  };
}

const fakeTurf = {
  polygon: (coordinates) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates } }),
  area: (feature) => feature.properties.areaM2,
  bbox: (feature) => {
    const coordinates = feature.geometry.coordinates.flat(3);
    const xs = coordinates.filter((_, index) => index % 2 === 0);
    const ys = coordinates.filter((_, index) => index % 2 === 1);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  },
  buffer: (feature, distance, options) => {
    assert.equal(options.units, "kilometers");
    assert.equal(options.steps, 16);
    const [west, south, east, north] = fakeTurf.bbox(feature);
    const delta = distance / 111;
    return rectangleFeature(west - delta, south - delta, east + delta, north + delta);
  },
  booleanIntersects: (left, right) => {
    const a = fakeTurf.bbox(left);
    const b = fakeTurf.bbox(right);
    return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  }
};

test("construye exclusivamente un viewport original válido", () => {
  const viewport = createViewportPolygon({ viewWest: -71, viewSouth: -34, viewEast: -70, viewNorth: -33 }, fakeTurf);
  assert.deepEqual(fakeTurf.bbox(viewport), [-71, -34, -70, -33]);
  assert.equal(createViewportPolygon({ viewWest: -70, viewEast: -71, viewSouth: -34, viewNorth: -33 }, fakeTurf), null);
});

test("calcula Deq métrico para Polygon y rechaza geometrías vacías", () => {
  assert.ok(Math.abs(calculateEquivalentDiameterKm(rectangleFeature(0, 0, 1, 1), fakeTurf) - 1.128379) < 0.000001);
  assert.equal(calculateEquivalentDiameterKm({ geometry: { type: "Point", coordinates: [0, 0] } }, fakeTurf), null);
});

test("acepta entidades interiores y entidades alcanzadas solamente por Buffer(A, Deq)", () => {
  const viewport = createViewportPolygon({ west: 0, south: 0, east: 1, north: 1 }, fakeTurf);
  assert.equal(isCandidateByViewport(rectangleFeature(0.2, 0.2, 0.3, 0.3), viewport, 1, fakeTurf), true);
  assert.equal(isCandidateByViewport(rectangleFeature(1.005, 0.2, 1.01, 0.3), viewport, 1, fakeTurf), true);
});

test("excluye entidades remotas y nunca crea su buffer tras el descarte bbox", () => {
  const viewport = createViewportPolygon({ west: 0, south: 0, east: 1, north: 1 }, fakeTurf);
  let bufferCalls = 0;
  const turf = { ...fakeTurf, buffer: (...args) => { bufferCalls += 1; return fakeTurf.buffer(...args); } };
  assert.equal(isCandidateByViewport(rectangleFeature(10, 10, 11, 11), viewport, 1, turf), false);
  assert.equal(bufferCalls, 0);
});
