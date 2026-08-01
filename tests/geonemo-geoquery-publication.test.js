const assert = require("assert");
const fs = require("fs");

const officialHtml = fs.readFileSync("geonemo/geoquery/geoquery.html", "utf8");
const officialJs = fs.readFileSync("geonemo/geoquery/geoquery.js", "utf8");
const indexJs = fs.readFileSync("geonemo/js/index.js", "utf8");
const productionFiles = fs.readdirSync("geonemo/geoquery", { recursive: true });

assert.match(officialHtml, /GeoQuery 2\.0/);
assert.match(officialHtml, /\.\.\/\.\.\/shared\/geocalculo-telemetry\.js/);
for (const module of ["geoquery.css", "proximity.js", "viewport-filter.js", "map-theme.js", "geoquery.js"]) {
  assert.match(officialHtml, new RegExp(`(?:src|href)="${module.replace(".", "\\.")}"`));
}
assert.doesNotMatch(`${officialHtml}\n${officialJs}`, /(?:\/|\.\/)geoquery2\//i);
assert.doesNotMatch(`${officialHtml}\n${officialJs}`, /GeoQuery2|localhost|versión propuesta|experimental/i);
assert.match(indexJs, /\.\/geoquery\/geoquery\.html/);
assert.doesNotMatch(indexJs, /\.\/geoquery2\/geoquery\.html/);
assert.match(officialJs, /"lat", "queryLat"/);
assert.match(officialJs, /"lon", "queryLon"/);
for (const parameter of ["viewLat", "viewLon", "zoom", "basemap", "mapCenterLat", "mapCenterLon", "mapZoom", "queryLat", "queryLon", "viewWest", "viewSouth", "viewEast", "viewNorth"]) {
  assert.match(`${officialJs}\n${indexJs}`, new RegExp(`"${parameter}"`));
}
assert.doesNotMatch(productionFiles.join("\n"), /\.test\.js$|\.log$|\.png$/);
assert.ok(fs.existsSync("geonemo/geoquery_backup_pre_2_0/geoquery.html"));
assert.ok(fs.existsSync("geonemo/geoquery_backup_pre_2_0/pdf/geoNemoPdfExport.js"));

console.log("GeoQuery 2.0 de GeoNEMO está publicada en la ruta oficial y la versión previa está respaldada.");
