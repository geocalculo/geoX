const GEOQUERY_BASE_URL = new URL("../capas_geoquery/", window.location.href);
const caches = { json: new Map() };
const GEOQUERY_DEBUG = false;
function $(id) { return document.getElementById(id); }
function escapeHtml(v) { return String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c])); }
function num(params, key) { const v = Number(params.get(key)); return Number.isFinite(v) ? v : null; }
function validLatLon(lat, lon) { return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180; }
function dms(value, type) { const a=Math.abs(value); let d=Math.floor(a), mf=(a-d)*60, m=Math.floor(mf), s=Number(((mf-m)*60).toFixed(2)); if(s>=60){s=0;m++} if(m>=60){m=0;d++} return `${d}° ${m}' ${s.toFixed(2)}" ${type==="lat"?(value>=0?"N":"S"):(value>=0?"E":"W")}`; }
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

const {
  buildMapExport: buildGeoNoxaMapExport,
  installButton: installGeoNoxaKmlButton
} = window.GeoNoxaKmlExport;

window.geoQueryKmlRefresh = installGeoNoxaKmlButton(() => window.geoQueryState?.mapExport);

function buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon){ const sourceParams=new URLSearchParams(window.location.search); const p=new URLSearchParams({from:sourceParams.get("from")==="crossaccess"?"crossaccess":"geoquery",lat:String(lat),lon:String(lon),queryLat:sourceParams.get("queryLat")||String(lat),queryLon:sourceParams.get("queryLon")||String(lon),zoom:String(zoom||sourceParams.get("mapZoom")||14),mapZoom:String(sourceParams.get("mapZoom")||zoom||14),basemap:basemap||"osm"}); const centerLat=sourceParams.get("mapCenterLat")||viewLat, centerLon=sourceParams.get("mapCenterLon")||viewLon; if(Number.isFinite(Number(centerLat))&&Number.isFinite(Number(centerLon))){p.set("viewLat",centerLat);p.set("viewLon",centerLon);p.set("mapCenterLat",centerLat);p.set("mapCenterLon",centerLon)} ["viewWest","viewSouth","viewEast","viewNorth","restoreViewport"].forEach(k=>{const v=sourceParams.get(k); if(v!==null)p.set(k,v)}); return `../index.html?${p}`; }
async function analyzeGroup(entry, queryPoint, viewport){ const base=getGroupBase(entry); const cfg=await fetchJson(new URL(entry.config,GEOQUERY_BASE_URL)); const rules=await fetchJson(new URL(entry.listado_query || `${entry.carpeta}/listado_query.json`, GEOQUERY_BASE_URL)); let loaded=0, normalized=[]; for(const layer of (rules.capas||[]).filter(l=>l.activo && safeLayerFile(l.archivo))){ const gj=await fetchJson(new URL(layer.archivo,base)); const feats=Array.isArray(gj.features)?gj.features:[]; loaded += feats.length; const visible=feats.filter(f=>featureIntersectsViewport(f,viewport)); normalized.push(...visible.map((f,i)=> cfg.id==="relaves"?normalizeRelave(f,layer,cfg,i):normalizeZona(f,layer,cfg,i))); }
 const meta={loaded,inViewport:normalized.length,universe:rules.regla_busqueda?.universo,viewportSource:viewport?.source||"no_disponible"}; const result=cfg.id==="relaves"?analyzeRelaves(normalized,queryPoint,rules):analyzeZonas(normalized,queryPoint,rules); return {entry,cfg,rules,result,meta}; }
async function analyzeGroupSafe(entry, queryPoint, viewport){ try { return await analyzeGroup(entry, queryPoint, viewport); } catch(error) { const id = String(entry.id || entry.carpeta || "grupo").includes("zona") ? "zonas" : "relaves"; console.error(`[GeoNOXA][${id}] No fue posible resolver el grupo`, error); return {entry,cfg:{id,nombre:entry.nombre || id},rules:null,result:{groupId:id,status:"error",relation:"error",items:[],error},meta:{loaded:0,inViewport:0,universe:null,viewportSource:viewport?.source||"no_disponible"}}; } }


(async function init(){ const params=new URLSearchParams(location.search); const lat=num(params,"lat"), lon=num(params,"lon"); const viewLat=num(params,"viewLat")??num(params,"mapCenterLat"), viewLon=num(params,"viewLon")??num(params,"mapCenterLon"), zoom=num(params,"zoom")??num(params,"mapZoom")??14, from=params.get("from"), basemap=(params.get("basemap")||"osm").toLowerCase()==="sat"?"sat":"osm"; const els={back:$("back-link"),status:$("card-status"),groups:$("geoquery-groups"),summary:$("executive-summary"),load:$("groups-load-status")}; if(els.back){ els.back.href=validLatLon(lat,lon)?buildReturnUrl(lat,lon,zoom,basemap,viewLat,viewLon):"../index.html"; els.back.addEventListener("click",event=>{ if(history.length>1){ event.preventDefault(); history.back(); } }); } [[$("card-lat"),lat?.toFixed(6)],[$("card-lon"),lon?.toFixed(6)],[$("card-site"),(params.get("site")||"geonoxa").toUpperCase()],[$("lat-decimal"),lat?.toFixed(6)],[$("lon-decimal"),lon?.toFixed(6)],[$("lat-dms"),Number.isFinite(lat)?dms(lat,"lat"):"—"],[$("lon-dms"),Number.isFinite(lon)?dms(lon,"lon"):"—"]].forEach(([e,v])=>{if(e)e.textContent=v||"—"}); if(!validLatLon(lat,lon)){ if(els.status) els.status.textContent="Coordenada inválida"; return; }
 let currentBasemap=basemap; const mapAdapter=createGeoNoxaMapAdapter({elementId:"geoquery-map",lat,lon,zoom,basemap,onBasemapChange(type){currentBasemap=type;if(window.geoQueryState){window.geoQueryState.basemap=currentBasemap;window.geoQueryState.mapState.basemap=currentBasemap;window.geoQueryState.queryContext.originalViewport.basemap=currentBasemap;if(els.back)els.back.href=buildReturnUrl(lat,lon,zoom,currentBasemap,viewLat,viewLon);}}}); const {map,layers}=mapAdapter; window.geoQueryLeafletMap=map;
 const viewport=parseViewport(params); const registry=await fetchJson(new URL("listado.json",GEOQUERY_BASE_URL)); const entries=(registry.grupos||[]).filter(g=>g.activo).sort((a,b)=>(a.orden||0)-(b.orden||0)); const queryPoint=turf.point([lon,lat]); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Inicio análisis"); const groups=await Promise.all(entries.map(e=>analyzeGroupSafe(e,queryPoint,viewport))); const relavesGroup=groups.find(g=>g.cfg.id==="relaves"); const zonasGroup=groups.find(g=>g.cfg.id==="zonas"); const relavesResult=relavesGroup?.result; const zonasResult=zonasGroup?.result; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado relaves calculado", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Resultado zonas calculado", zonasResult); window.geoQueryState={site:"geonoxa",queryContext:{site:"geonoxa",queryPoint:{lat,lon},originalViewport:{centerLat:viewLat,centerLon:viewLon,zoom,west:viewport?.west,south:viewport?.south,east:viewport?.east,north:viewport?.north,basemap:currentBasemap},from},status:"loading",executiveSummary:"",groupResults:{relaves:relavesResult,zonas:zonasResult},mapState:{basemap:currentBasemap,viewportSource:viewport?.source||"sin viewport"},exportState:{pdfEnabled:false,kmlEnabled:false},lat,lon,basemap:currentBasemap,originalViewport:viewport,groups}; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] relavesResult:", relavesResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] zonasResult:", zonasResult); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] groupResults:", window.geoQueryState?.groupResults); groups.forEach(g=>mapAdapter.drawGroup(g)); if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderAnalysisResults"); if(els.groups) { els.groups.replaceChildren(); const html=[]; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderRelavesPanels"); if(relavesGroup) { try { html.push(renderRelaves(relavesResult,relavesGroup.cfg,relavesGroup.meta)); } catch(error) { console.error("[GeoNOXA][relaves][render]", error); if(relavesResult) relavesResult.renderError = error; } } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de renderZonasPanels"); if(zonasGroup) { try { html.push(renderZonas(zonasResult,zonasGroup.cfg,zonasGroup.meta)); } catch(error) { console.error("[GeoNOXA][zonas][render]", error); if(zonasResult) zonasResult.renderError = error; } } els.groups.innerHTML=html.filter(Boolean).join(""); } if(GEOQUERY_DEBUG) console.log("[GeoNOXA] Antes de resumen ejecutivo"); const executiveSummary=buildExecutiveSummary({relavesResult,zonasResult}); if(els.summary) els.summary.textContent=executiveSummary; if(GEOQUERY_DEBUG) console.log("[GeoNOXA] antes de deriveOverallStatus"); const overallStatus=deriveOverallStatus(relavesResult,zonasResult); window.__geonoxaReportModel=buildGeoNoxaReportModel({ lat, lon, from, currentBasemap, relavesResult, zonasResult, relavesGroup, zonasGroup, executiveSummary, overallStatus, viewport }); if(GEOQUERY_DEBUG) console.table({relavesStatus:relavesResult?.status,selectedCount:relavesResult?.selectedRelaves?.length,clusterRadiusKm:relavesResult?.clusterRadiusKm,dominantResource:relavesResult?.dominantResource,zonasStatus:zonasResult?.status,overallStatus:overallStatus?.label}); window.geoQueryState.status=overallStatus.code; window.geoQueryState.executiveSummary=executiveSummary; window.geoQueryState.exportState={pdfEnabled:groups.some(g=>g.result.status==="resolved"),kmlEnabled:groups.some(g=>g.result.status==="resolved")}; window.GeoNoxaPdfController?.setReady(window.geoQueryState.exportState.pdfEnabled); window.geoQueryState.mapExport=buildGeoNoxaMapExport(relavesResult,zonasResult); window.geoQueryKmlRefresh?.(); if(els.status){ els.status.textContent=overallStatus.label; els.status.classList.toggle("status-ok", overallStatus.code==="resolved"); els.status.classList.toggle("status-warning", overallStatus.code==="partial" || overallStatus.code==="empty"); els.status.classList.toggle("status-error", overallStatus.code==="error"); } if($("detail-status")) $("detail-status").textContent=overallStatus.label; mapAdapter.fitResults(); if(els.load) els.load.textContent=GEOQUERY_DEBUG?`${groups.length} grupos cargados desde listado.json; análisis limitado al viewport original (${viewport?.source || "sin viewport"}).`:""; const tech=$("geoquery-technical-metadata"); if(tech) tech.hidden=!GEOQUERY_DEBUG; const downloads=$("geoquery-downloads-panel"); if(downloads) downloads.hidden=!groups.some(g=>g.result.status==="resolved"); mapAdapter.invalidateSoon(150); })().catch(err=>{ console.error("[GeoNOXA][init]", err); const s=$("card-status"); if(s){s.textContent="Error de análisis";s.classList.add("status-error");} const g=$("geoquery-groups"); if(g) g.innerHTML=`<section class="panel"><p class="placeholder-text">${escapeHtml(err.message)}</p></section>`; });
