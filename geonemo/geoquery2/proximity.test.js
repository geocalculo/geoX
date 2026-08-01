const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTerritorialExposure, classifyTerritorialAlert, calculateIct, classifyIct, getDominantResult } = require("./proximity.js");

test("calcula el ICT exterior con interpolación continua entre referencias", () => {
  const references = [[0, 100], [.25, 90], [.5, 80], [1, 60], [2, 40], [3, 20], [5, 0], [8, 0]];
  for (const [relacionDiametros, expected] of references) {
    assert.equal(calculateIct({ posicion: "exterior", relacionDiametros }), expected);
  }
  assert.equal(calculateIct({ posicion: "exterior", relacionDiametros: .75 }), 70);
});

test("calcula el ICT interior exclusivamente desde la profundidad relativa", () => {
  assert.equal(calculateIct({ posicion: "interior", profundidadRelativa: .41, relacionDiametros: 99 }), 41);
  assert.equal(calculateIct({ posicion: "interior", profundidadRelativa: 1.2 }), 100);
});

test("clasifica los cinco rangos ejecutivos del ICT", () => {
  assert.deepEqual([0, 20, 20.01, 40, 40.01, 60, 60.01, 80, 80.01, 100].map((ict) => classifyIct(ict).label),
    ["Muy bajo", "Muy bajo", "Bajo", "Bajo", "Medio", "Medio", "Alto", "Alto", "Muy alto", "Muy alto"]);
});

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

test("selecciona como dominante el resultado con mayor ICT", () => {
  const exterior = { posicion: "exterior", relacionDiametros: 5 };
  const interior = { posicion: "interior", relacionDiametros: .9, profundidadRelativa: .9 };
  assert.equal(getDominantResult([exterior, interior]), interior);
});
