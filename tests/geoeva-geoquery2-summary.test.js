const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { window: {} };
vm.runInNewContext(fs.readFileSync("geoeva/geoquery2/js/render.js", "utf8"), context);

const actual = context.window.GeoQueryRender.summary({
  inversionAprobadaGrupoBase: 100,
  sectorDominanteInversion: { nombre: "Energía", inversion: 63, porcentaje: 63 },
  base: new Array(10),
  radiusMeters: 52810,
  total: 13,
  approvedPointStats: { minKm: 23.71 }
});

assert.equal(actual, "El clúster de análisis concentra una inversión aprobada de US$ 100,00 MM, de los cuales el sector Energía aporta US$ 63,00 MM, equivalentes al 63 % de la inversión aprobada, consolidándose como la actividad predominante por inversión del entorno. El grupo base está conformado por los 10 proyectos aprobados más cercanos, que definen un radio de análisis de 52,81 km, dentro del cual se registran 13 proyectos sometidos al Sistema de Evaluación de Impacto Ambiental. El proyecto aprobado más cercano se localiza a 23,71 km del punto consultado.");
assert.ok(actual.split(/\s+/).length >= 70 && actual.split(/\s+/).length <= 110);
assert.doesNotMatch(actual, /entorno de concentración moderada|alta actividad ambiental|presencia relevante|configurando un contexto/);

console.log("GeoQuery 2.0 executive summary follows the fixed territorial narrative and formatting rules.");
