const test = require("node:test");
const assert = require("node:assert/strict");
const { applyTheme, normalizeTheme, stylesFor } = require("./map-theme");

test("satellite theme uses the GeoEVA high-contrast palette", () => {
  assert.deepEqual(stylesFor("sat", "#16835f"), {
    polygon: { color: "#F8FF3D", weight: 3, fillColor: "#F8FF3D", fillOpacity: 0.20 },
    distance: { color: "#00FFFF", weight: 3, dashArray: "6 5" },
    poi: { radius: 7, color: "#fff", weight: 3, fillColor: "#dc443b", fillOpacity: 1 }
  });
});

test("OSM theme restores the existing institutional styles", () => {
  assert.equal(normalizeTheme("SAT"), "sat");
  assert.deepEqual(stylesFor("osm", "#16835f").polygon, {
    color: "#16835f", weight: 3, fillColor: "#16835f", fillOpacity: 0.18
  });
  assert.deepEqual(stylesFor("osm", "#16835f").distance, {
    color: "#16835f", weight: 2, dashArray: "6 5"
  });
});

test("applyTheme updates loaded vector layers without recreating them", () => {
  const applied = {};
  const properties = {};
  const themedMap = {
    institutionalColor: "#16835f",
    polygon: { setStyle: (style) => { applied.polygon = style; } },
    distanceLine: { setStyle: (style) => { applied.distance = style; } },
    poiMarker: { setStyle: (style) => { applied.poi = style; } },
    map: { getContainer: () => ({ dataset: {} }) },
    legend: { style: { setProperty: (name, value) => { properties[name] = value; } } }
  };

  applyTheme("sat", themedMap);
  assert.equal(applied.polygon.color, "#F8FF3D");
  assert.equal(applied.distance.color, "#00FFFF");
  assert.equal(applied.poi.fillColor, "#dc443b");
  assert.deepEqual(properties, { "--map-entity-color": "#F8FF3D", "--map-distance-color": "#00FFFF" });
});
