const assert = require("assert");
const fs = require("fs");
const path = require("path");

const sites = ["geoeva", "geoipt", "geonemo", "geonoxa"];
const publicGeoQueries = sites.flatMap((site) => ["geoquery", "geoquery2"]
  .map((version) => `${site}/${version}/geoquery.html`)
  .filter((file) => fs.existsSync(file)));

const additionalPublicUi = [
  "geoipt/geo-card.html",
  "geoipt/js/mapago.js",
];

const pdfLabel = /(?:Exportar|Descargar|Generar)\s+PDF|>\s*PDF(?:\s+PRO)?\s*</i;
const pdfAction = /(?:id|href|onclick|data-pdf-button)=["'][^"']*pdf[^"']*["']/i;

for (const file of [...publicGeoQueries, ...additionalPublicUi]) {
  const source = fs.readFileSync(file, "utf8");
  const controls = source.match(/<(?:button|a|input)\b[\s\S]*?<\/(?:button|a)>|<input\b[^>]*>/gi) || [];
  const pdfControls = controls.filter((control) => pdfLabel.test(control) || pdfAction.test(control));
  assert.deepEqual(pdfControls, [], `${file} no debe publicar controles PDF en su markup`);
}

for (const file of publicGeoQueries) {
  const html = fs.readFileSync(file, "utf8");
  if (/redirectToOfficialGeoQuery/.test(html)) {
    assert.match(html, /\.\.\/geoquery\/geoquery\.html/, `${file} redirige al GeoQuery oficial auditado`);
    continue;
  }
  const kmlControls = html.match(/<(?:button|a)\b[^>]*>[^<]*(?:Exportar|Descargar) KML<\/(?:button|a)>/gi) || [];
  assert.ok(kmlControls.length > 0, `${file} conserva al menos una exportación KML`);
  assert.match(html, /<(?:button|a)\b[^>]*>[^<]*(?:Volver|← Volver)/i, `${file} conserva el control Volver`);
}

const internalPdfModules = [
  "geoipt/geoquery/pdf/geoIptPdfExport.js",
  "geoeva/geoquery/pdf/geoEvaPdfExport.js",
  "geonemo/geoquery/geoquery.js",
  "geonoxa/geoquery/geoquery.js",
  "geoquery-pdf/geoquery-pdf.js",
];

for (const file of internalPdfModules) {
  assert.ok(fs.existsSync(path.resolve(file)), `${file} conserva el módulo PDF interno`);
}

console.log(`Verificados ${publicGeoQueries.length} GeoQuery: sin controles PDF; KML, Volver y módulos internos conservados.`);
