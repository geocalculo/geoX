/* GeoQuery 2.0 GeoNEMO: análisis autocontenido; no altera la consulta productiva. */
const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const lat = Number(params.get("lat") ?? params.get("queryLat") ?? -33.45);
const lon = Number(params.get("lon") ?? params.get("queryLon") ?? -70.66);
const validPoint = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
const point = validPoint ? turf.point([lon, lat]) : turf.point([-70.66, -33.45]);
const dataSources = [
  {url:"../capas_geoquery/grupo_snaspe/nemo_snaspe_sub10k.geojson",group:"SNASPE"},
  {url:"../capas_geoquery/grupo_snaspe/snaspe_XL_from_raster_conti.geojson",group:"SNASPE"},
  {url:"../capas_geoquery/grupo_snaspe/snaspe_XL_from_raster_mar.geojson",group:"SNASPE"},
  {url:"../capas_geoquery/grupo_ramsar/nemo_ramsar_query.geojson",group:"Ramsar"}
];
let current = null;

/* Presentación y navegación conservan los parámetros del mapa de origen. */
$("coordinates").textContent = validPoint ? `${lat.toFixed(5)}, ${lon.toFixed(5)}` : "Coordenadas no válidas";
$("date").textContent = new Intl.DateTimeFormat("es-CL",{dateStyle:"medium"}).format(new Date());
$("back-link").href = `../index.html?${params.toString()}`;

const map = L.map("map",{zoomControl:true,attributionControl:true}).setView([point.geometry.coordinates[1],point.geometry.coordinates[0]],10);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
L.circleMarker([point.geometry.coordinates[1],point.geometry.coordinates[0]],{radius:8,color:"#fff",weight:3,fillColor:"#e64238",fillOpacity:1}).addTo(map).bindTooltip("Punto consultado");

const first = (props,names) => names.map((name)=>props?.[name]).find((value)=>value!==undefined&&value!==null&&String(value).trim()) ?? null;
const formatKm = (km) => km < 1 ? `${Math.round(km*1000).toLocaleString("es-CL")} m` : `${km.toLocaleString("es-CL",{maximumFractionDigits:1})} km`;
const set = (id,value) => { $(id).textContent = value ?? "Sin información"; };
function polygonLines(feature){try{return turf.flatten(turf.polygonToLine(feature)).features}catch{return[]}}

/* La distancia mínima siempre se calcula contra el borde real del polígono. */
function measure(feature,source){
  let nearest=null;
  polygonLines(feature).forEach((line)=>{const candidate=turf.nearestPointOnLine(line,point,{units:"kilometers"});if(!nearest||candidate.properties.dist<nearest.properties.dist)nearest=candidate});
  if(!nearest)return null;
  const inside=turf.booleanPointInPolygon(point,feature);
  const areaKm2=turf.area(feature)/1e6;
  const diameter=2*Math.sqrt(areaKm2/Math.PI);
  const center=turf.centroid(feature);
  return {feature,source,nearest,inside,distance:inside?0:nearest.properties.dist,borderDistance:nearest.properties.dist,areaKm2,diameter,perimeter:polygonLines(feature).reduce((n,line)=>n+turf.length(line,{units:"kilometers"}),0),centroidDistance:turf.distance(point,center,{units:"kilometers"})};
}
function proximity(ratio){if(ratio>1)return["Muy baja",10];if(ratio>.5)return["Baja",30];if(ratio>.25)return["Media",50];if(ratio>.125)return["Alta",70];return["Muy alta",90]}

async function loadFeatures(){
  const settled=await Promise.allSettled(dataSources.map(async(source)=>({source,json:await fetch(source.url).then(r=>{if(!r.ok)throw Error(r.status);return r.json()})})));
  return settled.filter(x=>x.status==="fulfilled").flatMap(x=>x.value.json.features.map(feature=>({feature,source:x.value.source})));
}

/* Un único modelo de resultado alimenta tarjetas, mapa y exportaciones. */
async function render(){
  if(!validPoint){$("interpretation").textContent="Ingrese coordenadas válidas en los parámetros lat y lon para ejecutar la consulta.";return}
  try{
    const measured=(await loadFeatures()).map(({feature,source})=>measure(feature,source)).filter(Boolean).sort((a,b)=>a.distance-b.distance||a.borderDistance-b.borderDistance);
    current=measured[0]; if(!current)throw Error("No hay geometrías disponibles");
    const p=current.feature.properties||{};
    const name=first(p,["NOMBRE_TOT","NOMBRE_UNI","Nombre","nombre"])||"Área protegida sin nombre";
    const category=first(p,["CATEGORIA","Tipo","tipo"])||(current.source.group==="Ramsar"?"Sitio Ramsar":"Área protegida");
    const region=first(p,["REGION","Nomreg","region"])||"Sin información";
    const commune=first(p,["COMUNA","Nomcom","comuna"])||"Sin información";
    const areaHa=current.areaKm2*100;
    const ratio=current.distance/current.diameter;
    const [level,marker]=proximity(ratio);
    const distanceText=formatKm(current.distance),diameterText=formatKm(current.diameter);
    [["header-name",name],["header-category",category],["header-region",region],["position",current.inside?"Interior":"Exterior"],["distance",distanceText],["diameter",diameterText],["ratio",`${ratio.toLocaleString("es-CL",{maximumFractionDigits:3})} diámetros`],["level",level],["area",`${areaHa.toLocaleString("es-CL",{maximumFractionDigits:0})} ha`],["perimeter",formatKm(current.perimeter)],["geometry-diameter",diameterText],["geometry-distance",distanceText],["centroid-distance",formatKm(current.centroidDistance)],["geometry-position",current.inside?"Interior":"Exterior"],["rule-area-type",category],["rule-distance",distanceText],["detail-name",name],["detail-category",category],["detail-area",`${areaHa.toLocaleString("es-CL",{maximumFractionDigits:0})} ha`],["detail-region",region],["commune",commune],["administration",first(p,["ADMINISTRA","EMISOR_DEC","administracion"])||current.source.group],["creation-year",String(first(p,["ANO_CREACI","AÑO","fecha","Decreto"])||"Sin información").match(/\b(18|19|20)\d{2}\b/)?.[0]||"Sin información"]].forEach(([id,value])=>set(id,value));
    $("scale-marker").style.left=`${marker}%`;
    const rule=await fetch("reglas-ejemplo.json").then(r=>r.json()).then(j=>j.reglas.find(x=>x.categorias.includes(category))).catch(()=>null);
    let state="SIN REGLA IDENTIFICADA";
    if(rule){state=current.distance*1000>=rule.distancia_m?"CUMPLE":"NO CUMPLE";set("rule-threshold",`${rule.distancia_m} m`)}else set("rule-threshold","—");
    set("rule-status",state);set("rule-state",state);$("rule-status").className=`status ${state==="CUMPLE"?"ok":state.startsWith("SIN")?"neutral":""}`;
    set("interpretation",`El punto presenta una proximidad territorial ${level.toLowerCase()} respecto del área protegida más cercana. ${state==="SIN REGLA IDENTIFICADA"?"No existen reglas sectoriales cargadas para esta combinación.":state==="CUMPLE"?"La distancia observada supera la referencia experimental definida para este tipo de proyecto.":"La distancia observada se encuentra dentro de la franja de revisión definida para este tipo de proyecto."}`);
    const link=first(p,["LINK","link","URL"]);if(link){$("official-link").href=link;$("official-link").textContent="Ver ficha oficial"}
    const polygonLayer=L.geoJSON(current.feature,{style:{color:"#159a72",weight:3,fillColor:"#20b486",fillOpacity:.18}}).addTo(map);
    L.polyline([[lat,lon],[current.nearest.geometry.coordinates[1],current.nearest.geometry.coordinates[0]]],{color:"#263f3a",weight:2,dashArray:"6 5"}).addTo(map).bindTooltip(distanceText);
    map.fitBounds(L.featureGroup([polygonLayer,L.marker([lat,lon],{opacity:0})]).getBounds().pad(.12),{maxZoom:13});
  }catch(error){console.error(error);$("interpretation").textContent="No fue posible cargar las áreas protegidas. Verifique la conexión y vuelva a intentar.";set("header-name","Consulta no disponible")}
}

/* Exportaciones ligeras, sin dependencias adicionales. */
$("pdf-button").addEventListener("click",()=>window.print());
$("kml-button").addEventListener("click",()=>{if(!current)return;const coords=current.feature.geometry.type==="Polygon"?current.feature.geometry.coordinates[0]:current.feature.geometry.coordinates[0][0];const xml=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>GeoQuery 2.0 GeoNEMO</name><Placemark><name>Punto consultado</name><Point><coordinates>${lon},${lat}</coordinates></Point></Placemark><Placemark><name>Área protegida más cercana</name><Polygon><outerBoundaryIs><LinearRing><coordinates>${coords.map(c=>c.join(",")).join(" ")}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark></Document></kml>`;const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([xml],{type:"application/vnd.google-earth.kml+xml"}));a.download="geonemo_geoquery2.kml";a.click();URL.revokeObjectURL(a.href)});
render();
