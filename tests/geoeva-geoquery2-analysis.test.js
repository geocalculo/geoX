const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function haversine(a, b) {
  const rad = value => value * Math.PI / 180; const earth = 6371.0088;
  const dLat=rad(b[1]-a[1]), dLon=rad(b[0]-a[0]);
  const h=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
  return 2*earth*Math.asin(Math.sqrt(h));
}
global.window=global; global.turf={point:coordinates=>({geometry:{coordinates}}),distance:(a,b)=>haversine(a.geometry.coordinates,b.geometry.coordinates)};
vm.runInThisContext(fs.readFileSync("geoeva/geoquery/js/analysis.js","utf8"));
const features=JSON.parse(fs.readFileSync("geoeva/capas_geoquery/geoeva_geoquery_proyectos.geojson","utf8")).features;
const cases=[[-33.4489,-70.6693],[-23.6509,-70.3975],[-36.8201,-73.0444],[-27.1127,-109.3497]];

function auditedReference(query) {
  const status=f=>String(f.properties?.estado||"").trim().toLowerCase(); const isApproved=f=>["aprobado","aprobada","proyecto aprobado"].includes(status(f));
  const measured=features.map(feature=>{const [lon,lat]=feature.geometry.coordinates; const km=haversine([query.lon,query.lat],[lon,lat]); return {feature,lat,lon,distance_km:km,distance_m:km*1000};});
  const base=measured.filter(x=>isApproved(x.feature)).sort((a,b)=>a.distance_km-b.distance_km).slice(0,10); const radius=base.at(-1).distance_m; const inside=measured.filter(x=>x.distance_m<=radius);
  const sectors=new Map(); base.forEach(x=>{const name=String(x.feature.properties.sector||"").trim().replace(/\s+/g," ")||"Sin sector informado"; const row=sectors.get(name)||{nombre:name,cantidad:0,inversion:0}; row.cantidad+=1; row.inversion+=Number(x.feature.properties.inversion_mmusd)||0; sectors.set(name,row);});
  const rows=[...sectors.values()]; const totalInvestment=rows.reduce((sum,row)=>sum+row.inversion,0);
  const quantity=[...rows].sort((a,b)=>b.cantidad-a.cantidad||a.nombre.localeCompare(b.nombre,"es"))[0];
  const investment=[...rows].sort((a,b)=>b.inversion-a.inversion||a.nombre.localeCompare(b.nombre,"es"))[0];
  return {base,radius,inside,quantity:{nombre:quantity.nombre,cantidad:quantity.cantidad,porcentaje:quantity.cantidad/base.length*100},investment:{nombre:investment.nombre,inversion:investment.inversion,porcentaje:totalInvestment?investment.inversion/totalInvestment*100:0},totalInvestment,min:base[0].distance_km};
}
for (const [lat,lon] of cases) { const query={lat,lon}; const actual=GeoQueryAnalysis.run(query,features); const expected=auditedReference(query);
  assert.deepEqual(actual.base.map(x=>x.feature.properties.id),expected.base.map(x=>x.feature.properties.id)); assert.equal(actual.radiusMeters,expected.radius); assert.equal(actual.inside.length,expected.inside.length); assert.deepEqual(actual.sectorDominanteCantidad,expected.quantity); assert.deepEqual(actual.sectorDominanteInversion,expected.investment); assert.equal(actual.inversionAprobadaGrupoBase,expected.totalInvestment); assert.equal(actual.approvedPointStats.minKm,expected.min);
  assert.equal(actual.baseInvestmentDistribution.total, actual.inversionAprobadaGrupoBase);
  assert.deepEqual(actual.baseInvestmentDistribution.rows.map(row=>row.sector), [...actual.baseInvestmentDistribution.rows].sort((a,b)=>b.investment-a.investment||a.sector.localeCompare(b.sector,"es")).map(row=>row.sector));
  console.log(JSON.stringify({lat,lon,radiusKm:actual.radiusMeters/1000,approved:actual.base.length,total:actual.total,sectorCantidad:actual.sectorDominanteCantidad,sectorInversion:actual.sectorDominanteInversion,inversion:actual.inversionAprobadaGrupoBase,minKm:actual.approvedPointStats.minKm})); }

// Regression: the leader by project count must not leak into the investment indicator.
const divergentFeatures = [
  ...Array.from({length: 6}, (_, index) => ({type:"Feature",properties:{id:`min-${index}`,estado:"Aprobado",sector:"Minería",inversion_mmusd:1},geometry:{type:"Point",coordinates:[-70 + index * .001,-33]}})),
  ...Array.from({length: 4}, (_, index) => ({type:"Feature",properties:{id:`ene-${index}`,estado:"Aprobado",sector:"Energía",inversion_mmusd:25},geometry:{type:"Point",coordinates:[-70 + (index + 6) * .001,-33]}}))
];
const divergent = GeoQueryAnalysis.run({lat:-33,lon:-70}, divergentFeatures);
assert.deepEqual(divergent.sectorDominanteCantidad, {nombre:"Minería",cantidad:6,porcentaje:60});
assert.deepEqual(divergent.sectorDominanteInversion, {nombre:"Energía",inversion:100,porcentaje:100/106*100});
assert.equal(divergent.inversionAprobadaGrupoBase, 106);
assert.equal(divergent.baseInvestmentDistribution.total, 106);
assert.equal("dominantSector" in divergent, false);
assert.equal(GeoQueryAnalysis.validCoordinate(Number.NaN,-70),false); assert.equal(GeoQueryAnalysis.validCoordinate(-91,-70),false); console.log("GeoQuery 2.0: 4 valid comparisons and invalid-coordinate checks passed.");

const timing = GeoQueryAnalysis.averageEvaluationBySector([
  { properties: { estado: "Aprobado", sector: "Energía", meses_tramitacion: 12.25 } },
  { properties: { estado: "Aprobado", sector: " Energía ", meses_tramitacion: 24.35 } },
  { properties: { estado: "Aprobado", sector: "Minería", meses_tramitacion: 30 } },
  { properties: { estado: "Rechazado", sector: "Minería", meses_tramitacion: 100 } },
  { properties: { estado: "Aprobado", sector: "Otros", meses_tramitacion: 0 } },
  { properties: { estado: "Aprobado", sector: "", meses_tramitacion: 20 } },
  { properties: { estado: "Aprobado", sector: "Puertos", meses_tramitacion: null } }
]);
assert.deepEqual(timing, [
  { sector: "Minería", averageMonths: 30, projectCount: 1 },
  { sector: "Energía", averageMonths: 18.3, projectCount: 2 }
]);
assert.doesNotMatch(fs.readFileSync("geoeva/geoquery/js/render.js", "utf8"), /fecha_(presentacion|calificacion)|new Date|dias_evaluacion/);
console.log("GeoQuery 2.0 timing uses precomputed months, valid approved projects, and descending sector averages.");

const investmentDistribution = GeoQueryAnalysis.investmentDistribution([
  {feature:{properties:{sector:" Energía ",inversion_mmusd:"25.5"}}},
  {feature:{properties:{sector:"Energía",inversion_mmusd:null}}},
  {feature:{properties:{sector:"Minería",inversion_mmusd:""}}},
  {feature:{properties:{sector:"Minería",inversion_mmusd:4.5}}}
]);
assert.deepEqual(investmentDistribution, {
  rows:[
    {sector:"Energía",investment:25.5,percentage:85},
    {sector:"Minería",investment:4.5,percentage:15}
  ],
  total:30,
  validProjectCount:2,
  excludedProjectCount:2
});
console.log("GeoQuery 2.0 investment distribution excludes missing values and matches the base-group total.");
