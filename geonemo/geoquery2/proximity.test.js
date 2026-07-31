const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTerritorialExposure, classifyTerritorialAlert, getDominantResult } = require("./proximity.js");

test("reduce el diagnóstico exterior a cinco categorías de alerta", () => {
  assert.deepEqual([.1, .5, 2, 5, 20].map(value => classifyTerritorialExposure(value).label),
    ["Muy alta", "Alta", "Media", "Baja", "Muy baja"]);
});

test("una mayor profundidad interior produce una alerta mayor", () => {
  assert.equal(classifyTerritorialAlert({ posicion: "interior", profundidadRelativa: .1 }).label, "Muy baja");
  assert.equal(classifyTerritorialAlert({ posicion: "interior", profundidadRelativa: .9 }).label, "Muy alta");
});

test("selecciona como dominante el resultado con mayor alerta", () => {
  const exterior = { posicion: "exterior", relacionDiametros: 5 };
  const interior = { posicion: "interior", relacionDiametros: .9, profundidadRelativa: .9 };
  assert.equal(getDominantResult([exterior, interior]), interior);
});
