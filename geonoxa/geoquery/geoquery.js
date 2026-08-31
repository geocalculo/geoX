const GEOQUERY_BASE_URL = new URL("../capas_geoquery/", window.location.href);
const caches = { json: new Map() };
const fmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
const fmtKm = new Intl.NumberFormat("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const GEOQUERY_DEBUG = false;
function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c])); }
function escapeXml(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&apos;",'"':"&quot;"}[c])); }
function safeCdata(v) { return String(v ?? "").replace(/]]>/g, "]]]]><![CDATA[>"); }
function num(params, key) { const v = Number(params.get(key)); return Number.isFinite(v) ? v : null; }
function validLatLon(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
function dms(value, type) { const a=Math.abs(value); let d=Math.floor(a), mf=(a-d)*60, m=Math.floor(mf), s=Number(((mf-m)*60).toFixed(2)); if(s>=60){s=0;m++} if(m>=60){m=0;d++} return `${d}° ${m}' ${s.toFixed(2)}" ${type==="lat"?(value>=0?"N":"S"):(value>=0?"E":"W")}`; }
function field(props, names) { for (const n of names || []) { const v = props?.[n]; if (v !== null && v !== undefined && String(v).trim() !== "") return v; } return null; }
function normText(v) { return String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function formatDistance(km) { return !Number.isFinite(km) ? "—" : km < 1 ? `${fmt.format(km * 1000)} m` : `${fmt.format(km)} km`; }
function formatDistanceKm(km) { return Number.isFinite(km) ? `${fmtKm.format(km)} km` : "N/D"; }
function formatAreaM2(value) { const n = Number(value); return Number.isFinite(n) ? `${fmt.format(n)} m²` : null; }
function cleanText(v) { const text = String(v ?? "").replace(/\s+/g, " ").trim(); return text && !["undefined", "null", "nan"].includes(text.toLowerCase()) ? text : null; }
function displayRelaveTitle(r) { return cleanText(r.siteName) || cleanText(r.company) || cleanText(r.idRelave) || "Relave sin nombre informado"; }
function rows(items) { return `<dl class="details">${items.filter(([,v])=>cleanText(v)).map(([k,v]) => `<div class="detail-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join("")}</dl>`; }
async function fetchJson(url) { const href = url.toString(); if (!caches.json.has(href)) caches.json.set(href, fetch(href, {cache:"no-store"}).then(r => { if(!r.ok) throw new Error(`${r.status} ${r.url}`); return r.json(); })); return caches.json.get(href); }
function safeLayerFile(file) { return typeof file === "string" && file.trim() && !file.startsWith("/") && !/^[a-z][\w+.-]*:/i.test(file) && !file.split(/[\\/]+/).includes(".."); }
function getGroupBase(entry) { return new URL(`${entry.carpeta}/`, GEOQUERY_BASE_URL); }

const {
  parseViewport,
  featureIntersectsViewport,
  normalizeRelave,
  normalizeZona,
  analyzeRelaves,
  analyzeZonas,
  dominantResource,
  dominantResourceRelaves,
  pairDistanceStats,
  pointDistanceStats
} = window.GeoNoxaSpatialEngine;

const {
  renderRelaves,
  renderZonas
} = window.GeoNoxaScreenRender;

const {
  buildExecutiveSummary,
  buildGeoNoxaReportModel,
  deriveOverallStatus
} = window.GeoNoxaReportModel;

const {
  create: createGeoNoxaMapAdapter
} = window.GeoNoxaMapAdapter;

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
  const consultaId = Number(new URLSearchParams(window.location.search).get("consulta_id"));
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
  const formData = new FormData();
  formData.append("consulta_id", String(consultaId));
  formData.append("tipo_archivo", tipoArchivo);
  formData.append("nombre_archivo", nombreArchivo);
  formData.append("archivo", archivo, nombreArchivo);
  return fetch(ARCHIVO_API_URL, { method: "POST", body: formData }).then((response) => {
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

function buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon){ const sourceParams=new URLSearchParams(window.location.search); const p=new URLSearchParams({from:sourceParams.get("from")==="crossaccess"?"crossaccess":"geoquery",lat:String(lat),lon:String(lon),queryLat:sourceParams.get("queryLat")||String(lat),queryLon:sourceParams.get("queryLon")||String(lon),zoom:String(zoom||sourceParams.get("mapZoom")||14),mapZoom:String(sourceParams.get("mapZoom")||zoom||14),basemap:basemap||"osm"}); const centerLat=sourceParams.get("mapCenterLat")||viewLat, centerLon=sourceParams.get("mapCenterLon")||viewLon; if(Number.isFinite(Number(centerLat))&&Number.isFinite(Number(centerLon))){p.set("viewLat",centerLat);p.set("viewLon",centerLon);p.set("mapCenterLat",centerLat);p.set("mapCenterLon",centerLon)} ["viewWest","viewSouth","viewEast","viewNorth","restoreViewport"].forEach(k=>{const v=sourceParams.get(k); if(v!==null)p.set(k,v)}); return `../index.html?${p}`; }
async function analyzeGroup(entry, queryPoint, viewport){ const base=getGroupBase(entry); const cfg=await fetchJson(new URL(entry.config,GEOQUERY_BASE_URL)); const rules=await fetchJson(new URL(entry.listado_query || `${entry.carpeta}/listado_query.json`, GEOQUERY_BASE_URL)); let loaded=0, normalized=[]; for(const layer of (rules.capas||[]).filter(l=>l.activo && safeLayerFile(l.archivo))){ const gj=await fetchJson(new URL(layer.archivo,base)); const feats=Array.isArray(gj.features)?gj.features:[]; loaded += feats.length; const visible=feats.filter(f=>featureIntersectsViewport(f,viewport)); normalized.push(...visible.map((f,i)=> cfg.id==="relaves"?normalizeRelave(f,layer,cfg,i):normalizeZona(f,layer,cfg,i))); }
 const meta={loaded,inViewport:normalized.length,universe:rules.regla_busqueda?.universo,viewportSource:viewport?.source||"no_disponible"}; const result=cfg.id==="relaves"?analyzeRelaves(normalized,queryPoint,rules):analyzeZonas(normalized,queryPoint,rules); return {entry,cfg,rules,result,meta}; }
async function analyzeGroupSafe(entry, queryPoint, viewport){ try { return await analyzeGroup(entry, queryPoint, viewport); } catch(error) { const id = String(entry.id || entry.carpeta || "grupo").includes("zona") ? "zonas" : "relaves"; console.error(`[GeoNOXA][${id}] No fue posible resolver el grupo`, error); return {entry,cfg:{id,nombre:entry.nombre || id},rules:null,result:{groupId:id,status:"error",relation:"error",items:[],error},meta:{loaded:0,inViewport:0,universe:null,viewportSource:viewport?.source||"no_disponible"}}; } }
function buildGeoNoxaMapExport(relavesResult, zonasResult) {
 const state=window.geoQueryState||{};
 const folders=[{id:"query",name:"POI"},{id:"relaves",name:"Relaves relacionados"},{id:"nearest-relave",name:"Relave más cercano"},{id:"cluster",name:"Radio del clúster"},{id:"relations",name:"Distancia mínima"},{id:"zonas",name:"Zona Saturada"}];
 const registry=GeoQueryKmlExporter.createKmlExportRegistry();
 const {poi:poiStyle,relave:relaveStyle,nearest:nearestStyle,radius:radiusStyle,distance:distanceStyle,zone:zoneStyle}=GeoQueryKmlExporter.geoNoxaStyles();
 GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-query-point",site:"geonoxa",groupId:"general",folderId:"query",role:"query-point",type:"point",name:"POI",geometry:{type:"Point",coordinates:[state.lon,state.lat]},styleId:"Style-POI",style:poiStyle,description:`<h2>POI</h2>${htmlTable([`<tr><th>Latitud</th><td>${escapeHtml(state.lat)}</td></tr>`,`<tr><th>Longitud</th><td>${escapeHtml(state.lon)}</td></tr>`])}`,visible:true});
 const rels=(Array.isArray(relavesResult?.selectedRelaves)?relavesResult.selectedRelaves:(relavesResult?.items||[])).slice(0,10);
 if(relavesResult?.status==="resolved"&&rels.length){
  const radius=relavesResult.clusterRadiusKm??relavesResult.radiusKm;
  if(Number.isFinite(radius)) GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-cluster-circle",site:"geonoxa",groupId:"cluster",folderId:"cluster",role:"cluster-circle",type:"polygon",name:`Radio del clúster: ${formatDistanceKm(radius)}`,geometry:turf.circle([state.lon,state.lat],radius,{steps:128,units:"kilometers"}).geometry,styleId:"Style-Radio",style:radiusStyle,extendedData:{"Radio del clúster":formatDistanceKm(radius)},visible:true});
  rels.forEach((r,i)=>{
   const rank=r.rank||i+1, nearest=i===0, data=buildGeoNoxaRelaveExtendedData({...r,rank},relavesResult);
   GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:`geonoxa-relave-${rank}`,site:"geonoxa",folderId:nearest?"nearest-relave":"relaves",groupId:"relaves",role:nearest?"nearest-relave":"related-point",type:"point",name:relaveTitle(r),geometry:r.feature?.geometry||{type:"Point",coordinates:r.coordinates},styleId:nearest?"Style-Relave-Cercano":"Style-Relave",style:nearest?nearestStyle:relaveStyle,description:buildGeoNoxaRelaveKmlDescription({...r,rank},relavesResult),extendedData:{Recurso:data.Recurso,Distancia:data["Distancia al punto consultado"],Superficie:data["Área"]},visible:true});
  });
  const nearest=rels[0];
  if(nearest?.coordinates) GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-nearest-relave-line",site:"geonoxa",groupId:"relaves",folderId:"relations",role:"minimum-distance",type:"line",name:`POI → ${relaveTitle(nearest)}`,geometry:{type:"LineString",coordinates:[[state.lon,state.lat],nearest.coordinates]},styleId:"Style-Linea-Distancia",style:distanceStyle,extendedData:{Distancia:formatDistanceKm(nearest.distanceKm)},visible:true});
 }
 const z=(zonasResult?.items||[])[0];
 if(zonasResult?.status==="resolved"&&z){
  const zoneName=cleanText(z.name)||cleanText(z.condition)||"Zona saturada o latente relacionada";
  GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-related-zone",site:"geonoxa",folderId:"zonas",groupId:"zonas",role:"related-feature",type:z.feature?.geometry?.type?.toLowerCase(),name:zoneName,geometry:z.feature?.geometry,styleId:"Style-Zona-Saturada",style:zoneStyle,description:buildGeoNoxaZoneKmlDescription(z,zonasResult),visible:true});
  if((zonasResult.relationType||zonasResult.relation)!=="intersects"&&zonasResult.nearestPoint?.geometry?.coordinates){ const p=zonasResult.nearestPoint.geometry.coordinates; GeoQueryKmlExporter.addUniqueKmlItem(registry,{id:"geonoxa-zone-nearest-line",site:"geonoxa",groupId:"zonas",folderId:"relations",role:"zone-nearest-line",type:"line",name:`POI → borde de ${zoneName}`,geometry:{type:"LineString",coordinates:[[state.lon,state.lat],p]},styleId:"Style-Linea-Distancia",style:distanceStyle,extendedData:{Distancia:formatDistanceKm(zonasResult.minimumDistanceKm??zonasResult.distanceKm)},visible:true}); }
 }
 const original=state.queryContext?.originalViewport||{};
 const analyticalBounds=[original.west,original.south,original.east,original.north].every(Number.isFinite)?[original.west,original.south,original.east,original.north]:null;
 const features=Array.from(registry.values()); GeoQueryKmlExporter.validateKmlExportItems(features); return {site:"geonoxa",get fileName(){return `geonoxa_Consulta_${fechaHoraLocalKml()}.kml`;},documentName:"GeoQuery GeoNOXA",documentDescription:state.executiveSummary,queryPoint:{lat:state.lat,lon:state.lon},analyticalBounds,folders,features,debugTheme:false};
}
window.geoQueryKmlRefresh = GeoQueryKmlExporter.installGeoQueryKmlButton(() => window.geoQueryState.mapExport, registrarKmlDescargado);

(async function init(){ const params=new URLSearchParams(location.search); const lat=num(params,"lat"), lon=num(params,"lon"); const viewLat=num(params,"viewLat")??num(params,"mapCenterLat"), viewLon=num(params,"viewLon")??num(params,"mapCenterLon"), zoom=num(params,"zoom")??num(params,"mapZoom")??14, from=params.get("from"), basemap=(params.get("basemap")||"osm").toLowerCase()==="sat"?"sat":"osm"; const els={back:$("back-link"),status:$("card-status"),groups:$("geoquery-groups"),summary:$("executive-summary"),load:$("groups-load-status")}; if(els.back){ els.back.href=validLatLon(lat,lon)?buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon):"../index.html"; els.back.addEventListener("click",event=>{ if(history.length>1){ event.preventDefault(); history.back(); } }); } [[$("card-lat"),lat?.toFixed(6)],[$("card-lon"),lon?.toFixed(6)],[$("card-site"),(params.get("site")||"geonoxa").toUpperCase()],[$("lat-decimal"),lat?.toFixed(6)],[$("lon-decimal"),lon?.toFixed(6)],[$("lat-dms"),Number.isFinite(lat)?dms(lat,"lat"):"—"],[$("lon-dms"),Number.isFinite(lon)?dms(lon,"lon"):"—"]].forEach(([e,v])=>{if(e)e.textContent=v||"—"}); if(!validLatLon(lat,lon)){ if(els.status) els.status.textContent="Coordenada inválida"; return; }
 let currentBasemap=basemap; const mapAdapter=createGeoNoxaMapAdapter({elementId:"geoquery-map",lat,lon,zoom,basemap,onBasemapChange(type){currentBasemap=type;if(window.geoQueryState){window.geoQueryState.basemap=currentBasemap;window.geoQueryState.mapState.basemap=currentBasemap;window.geoQueryState.queryContext.originalViewport.basemap=currentBasemap;if(els.back)els.back.href=buildReturnUrl(lat,lon,zoom,currentBasemap,viewLat,viewLon);}}}); const {map,layers}=mapAdapter; window.geoQueryLeafletMap=map;
 const viewport=parseViewport(params); const registry=await fetchJson(new URL("listado.json",GEOQUERY_BASE_URL)); const entries=(registry.grupos||[]).filter(g=>g.activo).sort((a,b)=>(a.orden||0)-(b.orden||0)); const queryPoint=turf.point([lon,lat]); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Inicio análisis"); const groups=await Promise.all(entries.map(e=>analyzeGroupSafe(e,queryPoint,viewport))); const relavesGroup=groups.find(g=>g.cfg.id==="relaves"); const zonasGroup=groups.find(g=>g.cfg.id==="zonas"); const relavesResult=relavesGroup?.result; const zonasResult=zonasGroup?.result; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado relaves calculado", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado zonas calculado", zonasResult); window.geoQueryState={site:"geonoxa",queryContext:{site:"geonoxa",queryPoint:{lat,lon},originalViewport:{centerLat:viewLat,centerLon:viewLon,zoom,west:viewport?.west,south:viewport?.south,east:viewport?.east,north:viewport?.north,basemap:currentBasemap},from},status:"loading",executiveSummary:"",groupResults:{relaves:relavesResult,zonas:zonasResult},mapState:{basemap:currentBasemap,viewportSource:viewport?.source||"sin viewport"},exportState:{pdfEnabled:false,kmlEnabled:false},lat,lon,basemap:currentBasemap,originalViewport:viewport,groups}; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] relavesResult:", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] zonasResult:", zonasResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] groupResults:", window.geoQueryState?.groupResults); groups.forEach(g=>mapAdapter.drawGroup(g)); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderAnalysisResults"); if(els.groups) { els.groups.replaceChildren(); const html=[]; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderRelavesPanels"); if(relavesGroup) { try { html.push(renderRelaves(relavesResult,relavesGroup.cfg,relavesGroup.meta)); } catch(error) { console.error("[GeoNOXA][relaves][render]", error); if(relavesResult) relavesResult.renderError = error; } } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderZonasPanels"); if(zonasGroup) { try { html.push(renderZonas(zonasResult,zonasGroup.cfg,zonasGroup.meta)); } catch(error) { console.error("[GeoNOXA][zonas][render]", error); if(zonasResult) zonasResult.renderError = error; } } els.groups.innerHTML=html.filter(Boolean).join(""); } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Antes de resumen ejecutivo"); const executiveSummary=buildExecutiveSummary({relavesResult,zonasResult}); if(els.summary) els.summary.textContent=executiveSummary; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de deriveOverallStatus"); const overallStatus=deriveOverallStatus(relavesResult,zonasResult); window.__geonoxaReportModel=buildGeoNoxaReportModel({ lat, lon, from, currentBasemap, relavesResult, zonasResult, relavesGroup, zonasGroup, executiveSummary, overallStatus, viewport }); if(GEOQUERY_DEBUG) console.table({relavesStatus:relavesResult?.status,selectedCount:relavesResult?.selectedRelaves?.length,clusterRadiusKm:relavesResult?.clusterRadiusKm,dominantResource:relavesResult?.dominantResource,zonasStatus:zonasResult?.status,overallStatus:overallStatus?.label}); window.geoQueryState.status=overallStatus.code; window.geoQueryState.executiveSummary=executiveSummary; window.geoQueryState.exportState={pdfEnabled:groups.some(g=>g.result.status==="resolved"),kmlEnabled:groups.some(g=>g.result.status==="resolved")}; window.GeoNoxaPdfController?.setReady(window.geoQueryState.exportState.pdfEnabled); window.geoQueryState.mapExport=buildGeoNoxaMapExport(relavesResult,zonasResult); window.geoQueryKmlRefresh?.(); if(els.status){ els.status.textContent=overallStatus.label; els.status.classList.toggle("status-ok", overallStatus.code==="resolved"); els.status.classList.toggle("status-warning", overallStatus.code==="partial" || overallStatus.code==="empty"); els.status.classList.toggle("status-error", overallStatus.code==="error"); } if($("detail-status")) $("detail-status").textContent=overallStatus.label; mapAdapter.fitResults(); if(els.load) els.load.textContent=GEOQUERY_DEBUG?`${groups.length} grupos cargados desde listado.json; análisis limitado al viewport original (${viewport?.source || "sin viewport"}).`:""; const tech=$("geoquery-technical-metadata"); if(tech) tech.hidden=!GEOQUERY_DEBUG; const downloads=$("geoquery-downloads-panel"); if(downloads) downloads.hidden=!groups.some(g=>g.result.status==="resolved"); mapAdapter.invalidateSoon(150); })().catch(err=>{ console.error("[GeoNOXA][init]", err); const s=$("card-status"); if(s){s.textContent="Error de análisis";s.classList.add("status-error");} const g=$("geoquery-groups"); if(g) g.innerHTML=`<section class="panel"><p class="placeholder-text">${escapeHtml(err.message)}</p></section>`; });
