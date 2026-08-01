const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTerritorialExposure, classifyTerritorialAlert, getDominantResult } = require("./proximity.js");

test("reduce el diagnóstico exterior a cinco categorías de alerta", () => {
  assert.deepEqual([.1, .5, 2, 5, 20].map(value => classifyTerritorialExposure(value).label),
    ["Muy alta", "Alta", "Media", "Baja", "Muy baja"]);
});

test("clasifica el condicionamiento interior exclusivamente por profundidad relativa", () => {
  assert.equal(classifyTerritorialAlert({ posicion: "interior", profundidadRelativa: .09, relacionDiametros: 20 }).label, "Bajo");
  assert.equal(classifyTerritorialAlert({ posicion: "interior", profundidadRelativa: .48, relacionDiametros: 20 }).label, "Alto");
  assert.equal(classifyTerritorialAlert({ posicion: "interior", profundidadRelativa: .82, relacionDiametros: 20 }).label, "Muy alto");
});

test("respeta los límites de la escala de profundidad interior", () => {
  assert.deepEqual([0, .1, .10001, .3, .30001, .6, .60001].map((profundidadRelativa) =>
    classifyTerritorialAlert({ posicion: "interior", profundidadRelativa }).label),
  ["Bajo", "Bajo", "Medio", "Medio", "Alto", "Alto", "Muy alto"]);
});

test("conserva sin cambios la clasificación exterior basada en la relación territorial", () => {
  const ratios = [.1, .5, 2, 5, 20];
  assert.deepEqual(ratios.map((relacionDiametros) =>
    classifyTerritorialAlert({ posicion: "exterior", relacionDiametros, profundidadRelativa: .82 })),
  ratios.map(classifyTerritorialExposure));
});

test("selecciona como dominante el resultado con mayor alerta", () => {
  const exterior = { posicion: "exterior", relacionDiametros: 5 };
  const interior = { posicion: "interior", relacionDiametros: .9, profundidadRelativa: .9 };
  assert.equal(getDominantResult([exterior, interior]), interior);
});
