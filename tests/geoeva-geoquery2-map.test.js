const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const calls = [];
const map = {
  loaded: false,
  setView() { this.loaded = true; calls.push("setView"); return this; },
  fitBounds(bounds, options) { calls.push("fitBounds"); assert.deepEqual(options, { padding: [20, 20], maxZoom: 15, animate: false }); return this; },
  getZoom() { return 10; },
  getCenter() { return { lat: -33.45, lng: -70.67 }; },
  getContainer() { return { appendChild() {}, addEventListener() {}, getBoundingClientRect(){return {width:800,height:520};}, querySelector(){return null;}, querySelectorAll(selector){return selector===".leaflet-tile"?[{complete:true,naturalWidth:256}]:[{}];} }; },
  invalidateSize() { calls.push("invalidateSize"); },
  dragging: { disable() {}, enable() {} }
};
function layer(name) {
  return {
    attached: false,
    addTo(target) { this.attached = target.loaded; calls.push(`add:${name}`); return this; },
    bindPopup() { return this; },
    bindTooltip() { return this; },
    getBounds() {
      assert.equal(this.attached, true, "the analysis circle must belong to an initialized map");
      calls.push("getBounds");
      return {};
    },
    getRadius() { return 1000; }
  };
}
function control() { return { onAdd: null, addTo() { return this; } }; }
control.layers = control;
control.scale = control;

global.window = global;
global.document = {
  createElement() { return { append() {}, appendChild() {}, classList: { toggle() {} } }; },
  createTextNode(value) { return value; }
};
global.matchMedia = () => ({ matches: false });
global.navigator = { maxTouchPoints: 0 };
global.requestAnimationFrame = callback => callback();
global.L = {
  map: () => map,
  tileLayer: () => layer("basemap"),
  circleMarker: () => layer("marker"),
  circle: () => layer("circle"),
  polyline: () => layer("line"),
  control,
  DomUtil: { create: () => ({ appendChild() {} }) }
};

vm.runInThisContext(fs.readFileSync("geoeva/geoquery/js/map.js", "utf8"));
GeoQueryMap.render({ query: { lat: -33.45, lon: -70.67 }, radiusMeters: 1000, base: [] }, "osm");

assert.ok(calls.indexOf("setView") < calls.indexOf("add:circle"));
assert.ok(calls.indexOf("add:circle") < calls.indexOf("getBounds"));
assert.ok(calls.indexOf("invalidateSize") < calls.indexOf("fitBounds"));
assert.ok(calls.indexOf("getBounds") < calls.indexOf("fitBounds"));
console.log("GeoQuery 2.0 map initializes before fitting the analysis circle.");
