const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.window=global;
global.document={getElementById:()=>({textContent:"Resumen"})};
global.GeoQueryKmlExporter={createKmlExportRegistry:()=>new Map(),themedStyle:()=>({}),addUniqueKmlItem:(registry,item)=>(registry.set(item.id,item),true)};
global.turf={circle:()=>({geometry:{type:"Polygon",coordinates:[]}})};
vm.runInThisContext(fs.readFileSync("geoeva/geoquery/js/exports.js","utf8"));

const project={distance_km:6.81,feature:{properties:{nombre_proyecto:'Proyecto Águas & "Sol"',titular:"Salmones Aysén S.A.",sector:"Pesca y Acuicultura",estado:"Aprobado",inversion_mmusd:.5,comuna:"Calbuco",region:"Región de Los Lagos",tipo_presentacion:"DIA",anio:2012,web:"https://example.test/expediente?a=1&b=2"}}};
const description=GeoQuery2Exports.buildProjectKmlDescription(project,7,10);
assert.match(description,/<h3>7\. Proyecto Águas &amp; &quot;Sol&quot;<\/h3>/);
assert.match(description,/Salmones Aysén S\.A\./);
assert.match(description,/US\$ 0,50 MM/);
assert.match(description,/7 de 10/);
assert.match(description,/6,81 km/);
assert.match(description,/href="https:\/\/example\.test\/expediente\?a=1&amp;b=2"/);
console.log("GeoQuery 2.0 KML descriptions preserve complete project and spatial metadata.");
