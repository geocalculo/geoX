const assert = require("assert");
const fs = require("fs");

const publicGeoQueries = [
  "geoeva/geoquery/geoquery.html",
  "geoipt/geo-card.html",
  "geoipt/geoquery/geoquery.html",
  "geonemo/geoquery/geoquery.html",
  "geonemo/geoquery2/geoquery.html",
  "geonoxa/geoquery/geoquery.html",
  "geonoxa/geoquery2/geoquery.html",
];

for (const file of publicGeoQueries) {
  const html = fs.readFileSync(file, "utf8");
  const buttons = html.match(/<button\b[^>]*>[^<]*(?:Exportar|Descargar) PDF<\/button>/gi) || [];
  assert.ok(buttons.length > 0, `${file} conserva el markup y los puntos de integración PDF`);
  for (const button of buttons) {
    assert.match(button, /\bhidden(?:\s|=|>)/i, `${file} oculta cada botón PDF`);
  }

  const kmlButtons = html.match(/<(?:button|a)\b[^>]*>[^<]*(?:Exportar|Descargar) KML<\/(?:button|a)>/gi) || [];
  assert.ok(kmlButtons.length > 0, `${file} conserva al menos una exportación KML`);
  for (const button of kmlButtons) {
    assert.doesNotMatch(button, /\bhidden(?:\s|=|>)/i, `${file} mantiene visible KML`);
  }
}

console.log("Los GeoQuery ocultan PDF, conservan su markup y mantienen visible KML.");
