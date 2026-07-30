const assert = require("assert");
const fs = require("fs");

const official = fs.readFileSync("geoeva/geoquery/geoquery.html", "utf8");
const redirect = fs.readFileSync("geoeva/geoquery2/geoquery.html", "utf8");
const pdf = fs.readFileSync("geoeva/geoquery/pdf/geoEvaPdfExport.js", "utf8");

assert.match(official, /GeoQuery 2\.0/);
assert.match(official, /src="pdf\/geoEvaPdfExport\.js"/);
assert.doesNotMatch(official, /(?:src|href)="[^\"]*geoquery2\//);
assert.match(redirect, /new URL\("\.\.\/geoquery\/geoquery\.html"/);
assert.match(redirect, /new URLSearchParams\(window\.location\.search\)/);
assert.match(redirect, /target\.hash = window\.location\.hash/);

assert.match(pdf, /captureNode = isInvestment \? node\.querySelector\("\.donut-wrap"\) : node/);
assert.match(pdf, /kind: legend\.length \? "investment" : "chart"/);
assert.doesNotMatch(pdf, /title: "Fuentes"/);
for (const privateLabel of ["Fuente de proyectos", "Archivo GeoJSON", "Fuente de mapa base", "Configuración de capas", "Viewport original", "Latitud GMS", "Longitud GMS"]) {
  assert.doesNotMatch(pdf, new RegExp(`label: "${privateLabel}"`));
}
assert.match(pdf, /Mapa base activo/);
assert.match(pdf, /Reporte generado automáticamente desde GeoQuery/);

console.log("GeoQuery 2.0 is published at the official route with a parameter-preserving legacy redirect and simplified PDF.");
