(function (root, factory) {
  const api = factory(root.turf, root.GeoQueryKmlExporter);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GeoNoxaKmlExport = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (turf, exporter) {
  "use strict";

  if (!turf) throw new Error("GeoNoxaKmlExport requiere Turf.");
  if (!exporter) throw new Error("GeoNoxaKmlExport requiere GeoQueryKmlExporter.");

  const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
  const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function escapeHtml(v) {
    return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c]));
  }

  function cleanText(v) {
    const text = String(v ?? "").replace(/\s+/g, " ").trim();
    return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null;
  }

  function formatDistanceKm(km) {
    return Number.isFinite(km) ? `${fmtKm.format(km)} km` : "N/D";
  }

  function formatAreaM2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `${fmt.format(n)} m²` : null;
  }

function isPresentValue(value) { if (value === null || value === undefined) return false; if (typeof value === "number") return Number.isFinite(value); if (typeof value === "object") return false; const text = String(value).trim(); return text !== "" && !["undefined", "null", "nan", "N/D", "—"].includes(text.toLowerCase()); }
function htmlTable(rows) { return rows.length ? `<table>${rows.join("")}</table>` : ""; }
function appendHtmlRow(target, label, value, options = {}) { if (!isPresentValue(value)) return; const htmlValue = options.html ? String(value) : escapeHtml(value); target.push(`<tr><th>${escapeHtml(label)}</th><td>${htmlValue}</td></tr>`); }
function kmlData(entries) { const out = {}; entries.forEach(([name, displayName, value]) => { if (isPresentValue(value)) out[displayName || name] = value; }); return out; }
function validHttpUrl(value) { const text = cleanText(value); return text && /^https?:\/\//i.test(text) ? text : null; }
function formatPercent(value) { return Number.isFinite(value) ? `${fmt.format(value)}%` : null; }
function formatOfficialArea(value) { return cleanText(value); }
function relationLabel(result) { return (result?.relationType || result?.relation) === "intersects" ? "Punto dentro de la zona relacionada" : "Zona más cercana al punto consultado"; }
function relaveTitle(relave) { return cleanText(relave?.siteName) || cleanText(relave?.company) || cleanText(relave?.idRelave) || "Relave relacionado"; }
function buildGeoNoxaRelaveKmlDescription(relave, relavesResult) {
  const total = relavesResult?.selectedRelaves?.length || relavesResult?.items?.length || null;
  const rowsId = [];
  appendHtmlRow(rowsId, "Empresa", relave.company || relave.originalProperties?.empresa);
  appendHtmlRow(rowsId, "Faena", relave.siteName || relave.originalProperties?.faena);
  appendHtmlRow(rowsId, "Recurso", relave.resourceOriginal || relave.originalProperties?.recurso);
  appendHtmlRow(rowsId, "Tipo de depósito", relave.depositType || relave.originalProperties?.tipo_deposito);
  appendHtmlRow(rowsId, "Comuna", relave.commune || relave.originalProperties?.comuna);
  appendHtmlRow(rowsId, "Método constructivo", relave.constructionMethod || relave.originalProperties?.metodo_constructivo);
  appendHtmlRow(rowsId, "Área", formatAreaM2(relave.areaM2 || relave.originalProperties?.shape_area_m2));
  appendHtmlRow(rowsId, "ID relave", relave.idRelave || relave.originalProperties?.id_relave);
  const rowsSpatial = [];
  appendHtmlRow(rowsSpatial, "Ranking", `${relave.rank || ""}${total ? ` de ${total}` : ""}`);
  appendHtmlRow(rowsSpatial, "Distancia al punto consultado", formatDistanceKm(relave.distanceKm));
  appendHtmlRow(rowsSpatial, "Recurso dominante", relavesResult?.dominantResource);
  appendHtmlRow(rowsSpatial, "Pertenece al recurso dominante", relave.isDominantResource ? "Sí" : "No");
  appendHtmlRow(rowsSpatial, "Participación del recurso dominante", formatPercent(relavesResult?.dominantResourcePercentage));
  appendHtmlRow(rowsSpatial, "Radio del clúster", formatDistanceKm(relavesResult?.clusterRadiusKm ?? relavesResult?.radiusKm));
  appendHtmlRow(rowsSpatial, "Archivo de origen", relave.sourceFile || relavesResult?.sourceFile);
  return `<h2>${escapeHtml(`${relave.rank || ""}. ${relaveTitle(relave)}`.trim())}</h2>${rowsId.length ? `<h3>Identificación del relave</h3>${htmlTable(rowsId)}` : ""}${rowsSpatial.length ? `<h3>Relación espacial</h3>${htmlTable(rowsSpatial)}` : ""}`;
}
function buildGeoNoxaRelaveExtendedData(relave, relavesResult) {
  return kmlData([["ranking","Ranking",relave.rank],["id_relave","ID relave",relave.idRelave || relave.originalProperties?.id_relave],["faena","Faena",relave.siteName || relave.originalProperties?.faena],["empresa","Empresa",relave.company || relave.originalProperties?.empresa],["recurso","Recurso",relave.resourceOriginal || relave.originalProperties?.recurso],["tipo_deposito","Tipo de depósito",relave.depositType || relave.originalProperties?.tipo_deposito],["comuna","Comuna",relave.commune || relave.originalProperties?.comuna],["metodo_constructivo","Método constructivo",relave.constructionMethod || relave.originalProperties?.metodo_constructivo],["area","Área",formatAreaM2(relave.areaM2 || relave.originalProperties?.shape_area_m2)],["distancia","Distancia al punto consultado",formatDistanceKm(relave.distanceKm)],["recurso_dominante","Recurso dominante",relavesResult?.dominantResource],["pertenece_recurso_dominante","Pertenece al recurso dominante",relave.isDominantResource ? "Sí" : "No"],["archivo_origen","Archivo de origen",relave.sourceFile || relavesResult?.sourceFile]]);
}
function buildGeoNoxaZoneKmlDescription(metadata, result) {
  const env = [];
  appendHtmlRow(env, "Condición", metadata.condition);
  appendHtmlRow(env, "Contaminante", metadata.pollutant);
  appendHtmlRow(env, "Contaminante saturado", metadata.saturatedValue);
  appendHtmlRow(env, "Contaminante latente", metadata.latentValue);
  appendHtmlRow(env, "Código de región", metadata.regionCode);
  appendHtmlRow(env, "Superficie oficial", formatOfficialArea(metadata.officialArea));
  const norm = [];
  appendHtmlRow(norm, "Decreto", metadata.decree);
  const url = validHttpUrl(metadata.link);
  appendHtmlRow(norm, "Enlace", url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir documento normativo</a>` : metadata.link, {html:Boolean(url)});
  const spatial = [];
  appendHtmlRow(spatial, "Tipo de relación", relationLabel(result));
  if ((result?.relationType || result?.relation) === "nearest") appendHtmlRow(spatial, "Distancia mínima al perímetro", formatDistanceKm(result.minimumDistanceKm ?? result.distanceKm));
  appendHtmlRow(spatial, "Archivo de origen", metadata.sourceFile);
  return `<h2>${escapeHtml(metadata.name || "Zona saturada o latente relacionada")}</h2>${env.length ? `<h3>Identificación ambiental</h3>${htmlTable(env)}` : ""}${norm.length ? `<h3>Documento normativo</h3>${htmlTable(norm)}` : ""}<h3>Relación espacial</h3>${htmlTable(spatial)}`;
}
function buildGeoNoxaZoneExtendedData(metadata, result) {
  return kmlData([["identificador","Identificador",metadata.featureId],["nombre_zona","Nombre de zona",metadata.name],["condicion","Condición",metadata.condition],["contaminante","Contaminante utilizado",metadata.pollutant],["contaminante_saturado","Contaminante saturado",metadata.saturatedValue],["contaminante_latente","Contaminante latente",metadata.latentValue],["decreto","Decreto",metadata.decree],["enlace","Enlace",metadata.link],["codigo_regional","Código regional",metadata.regionCode],["superficie_oficial","Superficie oficial",formatOfficialArea(metadata.officialArea)],["tipo_relacion","Tipo de relación",relationLabel(result)],["distancia_minima","Distancia mínima",(result?.relationType || result?.relation) === "nearest" ? formatDistanceKm(result.minimumDistanceKm ?? result.distanceKm) : null],["archivo_origen","Archivo de origen",metadata.sourceFile]]);
}


const ARCHIVO_API_URL = "https://hidden-mud-ce7a.geocalculo.workers.dev/api/archivo";

function obtenerConsultaIdGeoQuery() {
  const consultaId = Number(new URLSearchParams(root.location.search).get("consulta_id"));
  return Number.isSafeInteger(consultaId) && consultaId > 0 ? consultaId : null;
}

function fechaHoraLocalKml(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0")
  ].join("");
}

function registrarArchivoGeoCalculo({ consultaId, tipoArchivo, nombreArchivo, archivo }) {
  const formData = new root.FormData();
  formData.append("consulta_id", String(consultaId));
  formData.append("tipo_archivo", tipoArchivo);
  formData.append("nombre_archivo", nombreArchivo);
  formData.append("archivo", archivo, nombreArchivo);
  return root.fetch(ARCHIVO_API_URL, { method: "POST", body: formData }).then((response) => {
    if (!response.ok) throw new Error(`Registro de archivo rechazado (${response.status})`);
    return response;
  });
}

function registrarKmlDescargado({ blob, name }) {
  const consultaId = obtenerConsultaIdGeoQuery();
  if (!consultaId) {
    console.warn("[GeoCálculo] KML descargado sin consulta_id; no se registra en R2");
    return;
  }
  registrarArchivoGeoCalculo({ consultaId, tipoArchivo: "kml", nombreArchivo: name, archivo: blob })
    .catch((error) => console.warn("[GeoCálculo] No fue posible registrar KML", error));
}


function buildMapExport(relavesResult, zonasResult, state = root.geoQueryState || {}) {
 const folders=[{id:"query",name:"POI"},{id:"relaves",name:"Relaves relacionados"},{id:"nearest-relave",name:"Relave más cercano"},{id:"cluster",name:"Radio del clúster"},{id:"relations",name:"Distancia mínima"},{id:"zonas",name:"Zona Saturada"}];
 const registry=exporter.createKmlExportRegistry();
 const {poi:poiStyle,relave:relaveStyle,nearest:nearestStyle,radius:radiusStyle,distance:distanceStyle,zone:zoneStyle}=exporter.geoNoxaStyles();
 exporter.addUniqueKmlItem(registry,{id:"geonoxa-query-point",site:"geonoxa",groupId:"general",folderId:"query",role:"query-point",type:"point",name:"POI",geometry:{type:"Point",coordinates:[state.lon,state.lat]},styleId:"Style-POI",style:poiStyle,description:`<h2>POI</h2>${htmlTable([`<tr><th>Latitud</th><td>${escapeHtml(state.lat)}</td></tr>`,`<tr><th>Longitud</th><td>${escapeHtml(state.lon)}</td></tr>`])}`,visible:true});
 const rels=(Array.isArray(relavesResult?.selectedRelaves)?relavesResult.selectedRelaves:(relavesResult?.items||[])).slice(0,10);
 if(relavesResult?.status==="resolved"&&rels.length){
  const radius=relavesResult.clusterRadiusKm??relavesResult.radiusKm;
  if(Number.isFinite(radius)) exporter.addUniqueKmlItem(registry,{id:"geonoxa-cluster-circle",site:"geonoxa",groupId:"cluster",folderId:"cluster",role:"cluster-circle",type:"polygon",name:`Radio del clúster: ${formatDistanceKm(radius)}`,geometry:turf.circle([state.lon,state.lat],radius,{steps:128,units:"kilometers"}).geometry,styleId:"Style-Radio",style:radiusStyle,extendedData:{"Radio del clúster":formatDistanceKm(radius)},visible:true});
  rels.forEach((r,i)=>{
   const rank=r.rank||i+1, nearest=i===0, data=buildGeoNoxaRelaveExtendedData({...r,rank},relavesResult);
   exporter.addUniqueKmlItem(registry,{id:`geonoxa-relave-${rank}`,site:"geonoxa",folderId:nearest?"nearest-relave":"relaves",groupId:"relaves",role:nearest?"nearest-relave":"related-point",type:"point",name:relaveTitle(r),geometry:r.feature?.geometry||{type:"Point",coordinates:r.coordinates},styleId:nearest?"Style-Relave-Cercano":"Style-Relave",style:nearest?nearestStyle:relaveStyle,description:buildGeoNoxaRelaveKmlDescription({...r,rank},relavesResult),extendedData:{Recurso:data.Recurso,Distancia:data["Distancia al punto consultado"],Superficie:data["Área"]},visible:true});
  });
  const nearest=rels[0];
  if(nearest?.coordinates) exporter.addUniqueKmlItem(registry,{id:"geonoxa-nearest-relave-line",site:"geonoxa",groupId:"relaves",folderId:"relations",role:"minimum-distance",type:"line",name:`POI → ${relaveTitle(nearest)}`,geometry:{type:"LineString",coordinates:[[state.lon,state.lat],nearest.coordinates]},styleId:"Style-Linea-Distancia",style:distanceStyle,extendedData:{Distancia:formatDistanceKm(nearest.distanceKm)},visible:true});
 }
 const z=(zonasResult?.items||[])[0];
 if(zonasResult?.status==="resolved"&&z){
  const zoneName=cleanText(z.name)||cleanText(z.condition)||"Zona saturada o latente relacionada";
  exporter.addUniqueKmlItem(registry,{id:"geonoxa-related-zone",site:"geonoxa",folderId:"zonas",groupId:"zonas",role:"related-feature",type:z.feature?.geometry?.type?.toLowerCase(),name:zoneName,geometry:z.feature?.geometry,styleId:"Style-Zona-Saturada",style:zoneStyle,description:buildGeoNoxaZoneKmlDescription(z,zonasResult),visible:true});
  if((zonasResult.relationType||zonasResult.relation)!=="intersects"&&zonasResult.nearestPoint?.geometry?.coordinates){ const p=zonasResult.nearestPoint.geometry.coordinates; exporter.addUniqueKmlItem(registry,{id:"geonoxa-zone-nearest-line",site:"geonoxa",groupId:"zonas",folderId:"relations",role:"zone-nearest-line",type:"line",name:`POI → borde de ${zoneName}`,geometry:{type:"LineString",coordinates:[[state.lon,state.lat],p]},styleId:"Style-Linea-Distancia",style:distanceStyle,extendedData:{Distancia:formatDistanceKm(zonasResult.minimumDistanceKm??zonasResult.distanceKm)},visible:true}); }
 }
 const original=state.queryContext?.originalViewport||{};
 const analyticalBounds=[original.west,original.south,original.east,original.north].every(Number.isFinite)?[original.west,original.south,original.east,original.north]:null;
 const features=Array.from(registry.values()); exporter.validateKmlExportItems(features); return {site:"geonoxa",get fileName(){return `geonoxa_Consulta_${fechaHoraLocalKml()}.kml`;},documentName:"GeoQuery GeoNOXA",documentDescription:state.executiveSummary,queryPoint:{lat:state.lat,lon:state.lon},analyticalBounds,folders,features,debugTheme:false};
}

  function installButton(getMapExport = () => root.geoQueryState?.mapExport) {
    return exporter.installGeoQueryKmlButton(getMapExport, registrarKmlDescargado);
  }

  return Object.freeze({
    buildMapExport,
    installButton
  });
});
