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
vm.runInThisContext(fs.readFileSync("geoeva/geoquery2/js/analysis.js","utf8"));
const features=JSON.parse(fs.readFileSync("geoeva/capas_geoquery/geoeva_geoquery_proyectos.geojson","utf8")).features;
const cases=[[-33.4489,-70.6693],[-23.6509,-70.3975],[-36.8201,-73.0444],[-27.1127,-109.3497]];

function legacyReference(query) {
  const status=f=>String(f.properties?.estado||"").trim().toLowerCase(); const isApproved=f=>["aprobado","aprobada","proyecto aprobado"].includes(status(f));
  const measured=features.map(feature=>{const [lon,lat]=feature.geometry.coordinates; const km=haversine([query.lon,query.lat],[lon,lat]); return {feature,lat,lon,distance_km:km,distance_m:km*1000};});
  const base=measured.filter(x=>isApproved(x.feature)).sort((a,b)=>a.distance_km-b.distance_km).slice(0,10); const radius=base.at(-1).distance_m; const inside=measured.filter(x=>x.distance_m<=radius);
  const counts=new Map(); base.forEach(x=>{const s=String(x.feature.properties.sector||"").trim().replace(/\s+/g," ")||"Sin sector informado";counts.set(s,(counts.get(s)||0)+1);}); let sector="Sin sector informado", count=0; counts.forEach((n,s)=>{if(n>count){sector=s;count=n;}});
  return {base,radius,inside,sector,share:count/base.length*100,approvedInvestment:inside.filter(x=>isApproved(x.feature)).reduce((s,x)=>s+(Number.isFinite(Number(x.feature.properties.inversion_mmusd))?Number(x.feature.properties.inversion_mmusd):0),0),min:base[0].distance_km};
}
for (const [lat,lon] of cases) { const query={lat,lon}; const actual=GeoQueryAnalysis.run(query,features); const expected=legacyReference(query);
  assert.deepEqual(actual.base.map(x=>x.feature.properties.id),expected.base.map(x=>x.feature.properties.id)); assert.equal(actual.radiusMeters,expected.radius); assert.equal(actual.inside.length,expected.inside.length); assert.equal(actual.dominantSector,expected.sector); assert.equal(actual.dominantSectorShare,expected.share); assert.equal(actual.approvedInvestment,expected.approvedInvestment); assert.equal(actual.approvedPointStats.minKm,expected.min);
  console.log(JSON.stringify({lat,lon,radiusKm:actual.radiusMeters/1000,approved:actual.base.length,total:actual.total,sector:actual.dominantSector,share:actual.dominantSectorShare,investment:actual.approvedInvestment,minKm:actual.approvedPointStats.minKm})); }
assert.equal(GeoQueryAnalysis.validCoordinate(Number.NaN,-70),false); assert.equal(GeoQueryAnalysis.validCoordinate(-91,-70),false); console.log("GeoQuery 2.0: 4 valid comparisons and invalid-coordinate checks passed.");
