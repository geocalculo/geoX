const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function classList() {
  const values = new Set();
  return {
    toggle(name, force) { force ? values.add(name) : values.delete(name); },
    contains(name) { return values.has(name); }
  };
}
function element(hidden = false) {
  return { hidden, style: {}, classList: classList(), textContent: "" };
}

const nodes = {
  "status-view": element(false),
  report: element(true),
  "status-title": element(),
  "status-message": element(),
  "loading-steps": element(false),
  "status-back": element(true)
};
const spinner = element(false);
const steps = [element(), element(), element()];

global.window = global;
global.document = {
  documentElement: { dataset: {} },
  body: { classList: classList() },
  getElementById(id) { return nodes[id]; },
  querySelector(selector) { assert.equal(selector, ".spinner"); return spinner; },
  querySelectorAll(selector) { assert.equal(selector, "#loading-steps li"); return steps; }
};
global.requestAnimationFrame = callback => { callback(); return 1; };
vm.runInThisContext(fs.readFileSync("geoeva/geoquery2/js/render.js", "utf8"));

GeoQueryRender.setAppState("loading", "Cargando", "En curso", 1);
assert.equal(nodes.report.hidden, true);
assert.equal(nodes["status-view"].hidden, false);
assert.equal(spinner.hidden, false);
assert.equal(nodes["loading-steps"].hidden, false);
assert.equal(document.body.classList.contains("is-loading"), true);
assert.deepEqual(steps.map(step => step.classList.contains("active")), [true, true, false]);

GeoQueryRender.setAppState("resolved", "Análisis resuelto", "Disponible", 2);
assert.equal(nodes.report.hidden, false);
assert.equal(nodes["status-view"].hidden, true);
assert.equal(spinner.hidden, true);
assert.equal(spinner.style.animation, "none");
assert.equal(nodes["loading-steps"].hidden, true);
assert.equal(document.body.classList.contains("is-loading"), false);

for (const state of ["empty", "error"]) {
  GeoQueryRender.setAppState(state, state, state);
  assert.equal(document.documentElement.dataset.appState, state);
  assert.equal(nodes.report.hidden, true);
  assert.equal(nodes["status-view"].hidden, false);
  assert.equal(spinner.hidden, true);
  assert.equal(nodes["loading-steps"].hidden, true);
  assert.equal(document.body.classList.contains("is-loading"), false);
  assert.ok(steps.every(step => !step.classList.contains("active")));
}

assert.match(fs.readFileSync("geoeva/geoquery2/css/geoquery2.css", "utf8"), /^\[hidden\]\{display:none!important\}/);
console.log("GeoQuery 2.0 states are mutually exclusive and stop the loading UI.");
