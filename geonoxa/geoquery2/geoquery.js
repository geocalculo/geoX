(function () {
  'use strict';
  const A = window.GeoNoxaAnalysis, T = window.GeoNoxaMapTheme;
  const params = new URLSearchParams(location.search); const number = key => Number(params.get(key));
  const lat = number('queryLat') || number('lat') || -30.25, lon = number('queryLon') || number('lon') || -71.08;
  const basemap = (params.get('basemap') || 'osm').toLowerCase().includes('sat') ? 'sat' : 'osm';
  const rawBounds = { west:number('viewWest'),south:number('viewSouth'),east:number('viewEast'),north:number('viewNorth') };
  const validBounds = Object.values(rawBounds).every(Number.isFinite) && rawBounds.east > rawBounds.west;
  const bounds = A.expandedViewport(validBounds ? rawBounds : {west:lon-.35,east:lon+.35,south:lat-.25,north:lat+.25});
  const analysisResults = A.createAnalysisResults();
  const state = { lat, lon, basemap, sourceCount:0, rows:[] };
  let tailingsMap = null, zonesMap = null;
  const tailingsLayers = [], zoneLayers = [];
  const fmt = n => Number(n).toLocaleString('es-CL',{maximumFractionDigits:1});
  const esc = value => String(value ?? 'Sin información').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const insideBbox = feature => { const b=turf.bbox(feature); return !(b[2]<bounds.west||b[0]>bounds.east||b[3]<bounds.south||b[1]>bounds.north); };
  function summary() {
    const fields=[['Latitud',lat.toFixed(6)],['Longitud',lon.toFixed(6)],['Sitio de origen',params.get('site')||'GeoNOXA'],['Estado','Análisis completado'],['Grupos ambientales','2'],['Entidades fuente',state.sourceCount],['Entidades detectadas en ViewPort',analysisResults.relaves.detected.length+analysisResults.zonas.detected.length],['Entidades relacionadas',A.totalRelatedEntities(analysisResults)]];
    document.getElementById('site').textContent=params.get('site')||'Consulta territorial'; document.getElementById('query-grid').innerHTML=fields.map(x=>`<div class="datum"><b>${x[0]}</b>${esc(x[1])}</div>`).join('');
  }
  function relation(feature, kind) {
    const point=turf.point([lon,lat]), geometry=feature.geometry, p=feature.properties||{}; let target=feature, inside=false, distance=0, nearest=point, area=Number(p.shape_area_m2||p.superficie_m2||p.area_m2)||null, diameter=null, depth=null;
    if (/Polygon/.test(geometry.type)) { inside=turf.booleanPointInPolygon(point,feature); area=area||turf.area(feature); diameter=A.equivalentDiameterKm(area); const line=turf.polygonToLine(feature); nearest=turf.nearestPointOnLine(line,point); const edge=turf.distance(point,nearest); distance=kind==='relaves'?edge:(inside?0:edge); if(inside){depth=Math.min(1,edge/Math.max((diameter||1)/2,.001));} }
    else { nearest=geometry.type==='Point'?feature:turf.centroid(feature); distance=turf.distance(point,nearest); diameter=A.equivalentDiameterKm(area); }
    const score=kind==='relaves'&&geometry.type==='Point'?A.pointTailingsExposure(distance,area):A.relativeExposure({inside,distanceKm:distance,diameterKm:diameter,depthRatio:depth});
    return { feature,target,inside,distance,distanceKm:distance,nearest,area,diameter,depth,score,category:A.exposureCategory(score),ratio:diameter?distance/diameter:null,p };
  }
  function createMap(id, relations, kind, primary) {
    const map=L.map(id,{zoomControl:true}); const osm=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}), sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Esri'}); (basemap==='sat'?sat:osm).addTo(map);
    const marker=L.circleMarker([lat,lon],{radius:8,color:'#fff',weight:3,fillColor:'#ef233c',fillOpacity:1}).addTo(map).bindTooltip('POI'); const fit=[marker];
    relations.forEach(rel=>{const layer=L.geoJSON(rel.feature,{style:T.entityStyle(kind==='relaves'?'relaves':(String(rel.p.tipo||rel.p.clasificacion).toLowerCase().includes('latent')?'latente':'saturada'),basemap,rel===primary),pointToLayer:(f,ll)=>L.circleMarker(ll,{...T.entityStyle('relaves',basemap,rel===primary),radius:rel===primary?9:6,fillOpacity:.75})}).addTo(map); fit.push(layer); (kind==='relaves'?tailingsLayers:zoneLayers).push({layer,kind:kind==='relaves'?'relaves':'saturada',selected:rel===primary});});
    if(primary){const ll=primary.nearest.geometry.coordinates; fit.push(L.polyline([[lat,lon],[ll[1],ll[0]]],T.distanceStyle).addTo(map).bindTooltip(`${fmt(primary.distance)} km`));}
    if(kind==='relaves'&&relations.length){const radiusKm=relations[relations.length-1].distanceKm; fit.push(L.circle([lat,lon],{radius:radiusKm*1000,color:'#047857',weight:2,dashArray:'7 5',fillColor:'#10b981',fillOpacity:.06}).addTo(map).bindTooltip(`Radio del clúster: ${fmt(radiusKm)} km`));}
    const fg=L.featureGroup(fit); map.fitBounds(fg.getBounds().pad(.18),{maxZoom:13}); L.control.layers({'OSM':osm,'SAT':sat}).addTo(map); map.on('baselayerchange',e=>T.restyle(kind==='relaves'?tailingsLayers:zoneLayers,e.name==='SAT'?'sat':'osm')); if(kind==='relaves')tailingsMap=map;else zonesMap=map;
  }
  function groupCard(kind, relations) {
    const isR=kind==='relaves', title=isR?'RELAVES':'ZONAS SATURADAS / LATENTES', group=document.createElement('section'); group.className='group'; group.innerHTML=`<div class="group-title"><div><small>MICROINFORME</small><h2>${title}</h2></div><div class="group-count"><b>${relations.length} ${isR?'relaves relacionados':relations.length===1?'zona relacionada':'zonas relacionadas'}</b>${isR?`<small>${analysisResults.relaves.detected.length} relaves detectados en el área territorial analizada</small>`:''}</div></div>`;
    if(!relations.length){group.innerHTML+=`<div class="empty">Sin entidades relevantes<br>en el área territorial analizada.</div>`;document.getElementById(isR?'tailings-report':'zones-report').replaceChildren(group);return;}
    if(!isR) relations.sort((a,b)=>b.score-a.score); const main=relations[0], p=main.p, name=p.faena||p.nombre||p.zona||p.id_relave||'Entidad ambiental'; const dominant=A.dominant(relations,x=>isR?(x.p.recurso||'Sin información'):(x.p.contaminante||x.p.contaminantes||'Sin información')); const mapId=`map-${kind}`; const clusterRadiusKm=isR?relations[relations.length-1].distanceKm:null; const meanDistance=isR?relations.reduce((sum,item)=>sum+item.distanceKm,0)/relations.length:null; const areas=isR?relations.filter(item=>Number.isFinite(item.area)&&item.area>0):[]; const totalArea=areas.reduce((sum,item)=>sum+item.area,0); const resourceDistribution=isR?A.distribution(relations,item=>item.p.recurso||'Sin información',5):[];
    // El IER conserva la función de exposición existente y promedia sus resultados para
    // el clúster: usa la distancia y superficie de cada relave. Por incluir todo el grupo
    // ordenado, incorpora la distancia mínima, la media y el radio del último relacionado.
    const clusterScore=isR?Math.round(relations.reduce((sum,item)=>sum+item.score,0)/relations.length):main.score; const clusterCategory=A.exposureCategory(clusterScore);
    const metrics=isR?[["Relave más cercano",name],["Relaves relacionados",relations.length],["Recurso dominante",`${dominant.name} · ${dominant.percent} %`],["Distancia mínima",`${fmt(main.distanceKm)} km`],["Distancia media",`${fmt(meanDistance)} km`],["Radio del clúster",`${fmt(clusterRadiusKm)} km`],["Estado predominante",A.dominant(relations,x=>x.p.estado||x.p.tipo_deposito)?.name||'Sin información'],["Superficie total",totalArea?`${fmt(totalArea/1e6)} km²`:'Sin información'],["Superficie media",areas.length?`${fmt(totalArea/areas.length/1e6)} km²`:'Sin información']]:[["Zona principal",name],["Clasificación",p.tipo||p.clasificacion||'Zona ambiental'],["Contaminante",dominant.name],["Posición",main.inside?'Interior':'Exterior'],["Distancia al borde",`${fmt(main.distance)} km`],["Diámetro equivalente",main.diameter?`${fmt(main.diameter)} km`:'Sin información'],["Relación territorial",main.ratio!==null?`${fmt(main.ratio)} diámetros`:'No aplica'],["Profundidad relativa",main.depth!==null?`${fmt(main.depth*100)} %`:'No aplica']];
    group.innerHTML+=`<div class="micro"><div><div class="index" style="background:${clusterCategory.color}"><small style="color:white">${isR?'IER':'IEZ'}</small><br><strong>${clusterScore}</strong> · Exposición ${clusterCategory.label}</div><div class="metrics">${metrics.map(m=>`<div class="metric"><b>${m[0]}</b>${esc(m[1])}</div>`).join('')}</div>${isR?`<div class="chart"><b>Distribución por recurso</b><div class="resource-bars">${resourceDistribution.map((item,index)=>`<div><span>${esc(item.name)}</span><i><em class="color-${index}" style="width:${item.count/relations.length*100}%"></em></i><strong>${item.count}</strong></div>`).join('')}</div><div class="legend">${resourceDistribution.map((item,index)=>`<span class="legend-${index}">● ${esc(item.name)} · ${item.count}</span>`).join('')}</div></div>`:''}</div><div id="${mapId}" class="map" aria-label="Mapa independiente de ${title}"></div></div>`;
    document.getElementById(isR?'tailings-report':'zones-report').replaceChildren(group); createMap(mapId,relations,kind,main); const row={group:title,entity:name,distance:main.distance,score:clusterScore,category:clusterCategory.label,detail:isR?`${dominant.name} · ${p.comuna||''}`:`${p.tipo||''} · ${dominant.name}`,main,kind,relations,clusterRadiusKm,meanDistance,dominant}; state.rows.push(row); if(isR)analysisResults.relaves.ier=clusterScore;else analysisResults.zonas.iez=clusterScore;
  }
  function renderOverallExposure() {
    const maximum = A.maximumExposure(analysisResults);
    const row = maximum && state.rows.find(item => item.kind === maximum.kind);
    const panel = document.getElementById('greatest');
    panel.classList.remove('loading');
    panel.innerHTML = row
      ? `<small>MAYOR EXPOSICIÓN TERRITORIAL</small><h2>${esc(maximum.group)}</h2><div class="score">${maximum.kind === 'relaves' ? 'IER' : 'IEZ'} ${maximum.index}</div><b>${esc(row.entity)}</b><span>Exposición ${row.category}</span>`
      : '<small>MAYOR EXPOSICIÓN TERRITORIAL</small><h2>Sin exposición territorial calculable</h2>';
  }
  function renderExecutiveSummary() {
    const r=state.rows.find(x=>x.kind==='relaves'), z=state.rows.find(x=>x.kind==='zonas');
    const sentences=r?[`Se analizaron los ${analysisResults.relaves.related.length} relaves más cercanos al punto consultado, contenidos en un radio de ${fmt(r.clusterRadiusKm)} km. El relave más próximo se ubica a ${fmt(r.distance)} km y el recurso dominante es ${r.dominant.name}, presente en ${r.dominant.count} de los ${analysisResults.relaves.related.length} depósitos. La exposición territorial del grupo corresponde a un IER de ${r.score}.`, `De ${analysisResults.relaves.detected.length} relaves detectados en el viewport ampliado, el informe ejecutivo analiza los ${analysisResults.relaves.related.length} más cercanos.`]:['No se detectaron relaves en el viewport ampliado.'];
    if(z) sentences.push(`La zona ${z.entity} presenta un IEZ de ${z.score}, asociado a ${z.detail.split('·').pop().trim()}.`);
    else sentences.push('No se detectaron zonas saturadas o latentes relacionadas.');
    document.getElementById('synthesis').textContent=sentences.join(' ');
  }
  function finish(){
    state.rows=[];
    summary();
    groupCard('relaves',analysisResults.relaves.related);
    groupCard('zonas',analysisResults.zonas.related);
    renderOverallExposure();
    document.getElementById('details').innerHTML=state.rows.map(r=>`<tr><td>${r.group}</td><td>${esc(r.entity)}</td><td>${fmt(r.distance)} km</td><td>${r.score}</td><td>${r.category}</td><td>${esc(r.detail)}</td></tr>`).join('')||'<tr><td colspan="6">Sin entidades relevantes.</td></tr>';
    renderExecutiveSummary();
  }
  async function loadGroup(url) {
    const response=await fetch(url);
    if(!response.ok) throw Error(`${response.status} al cargar ${url}`);
    return response.json();
  }
  async function analyzeTailings() {
    const data=await loadGroup('../capas_geoquery/geonoxa_relaves_query.geojson');
    const entities=A.groupLogicalEntities(data.features,'relaves');
    analysisResults.relaves.detected=entities.filter(entity=>entity.features.some(insideBbox)).map(entity=>relation(entity.features.find(insideBbox),'relaves'));
    analysisResults.relaves.related=A.selectNearestTailings(analysisResults.relaves.detected,10);
    return entities.length;
  }
  async function analyzeZones() {
    const data=await loadGroup('../capas_geoquery/geonoxa_zonas_query.geojson');
    const entities=A.groupLogicalEntities(data.features,'zonas');
    analysisResults.zonas.detected=entities.filter(entity=>entity.features.some(insideBbox)).map(entity=>relation(entity.features.find(insideBbox),'zonas'));
    analysisResults.zonas.related=A.selectRelatedZones(analysisResults.zonas.detected);
    return entities.length;
  }
  async function init(){
    const settled=await Promise.allSettled([analyzeTailings(),analyzeZones()]);
    state.sourceCount=settled.reduce((sum,result)=>sum+(result.status==='fulfilled'?result.value:0),0);
    const failures=settled.filter(result=>result.status==='rejected');
    finish();
    if(failures.length) document.getElementById('synthesis').textContent+=` No fue posible cargar ${failures.length} grupo(s) ambiental(es): ${failures.map(item=>item.reason.message).join('; ')}`;
  }
  document.getElementById('back').onclick=()=>{const q=new URLSearchParams(params);q.set('lat',params.get('viewLat')||lat);q.set('lon',params.get('viewLon')||lon);location.href=`../index.html?${q}`;};document.getElementById('pdf').onclick=()=>html2pdf().set({margin:8,filename:'geonoxa-informe-exposicion.pdf',html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'},pagebreak:{mode:['css','legacy']}}).from(document.getElementById('report')).save();document.getElementById('kml').onclick=()=>{
    const geometryKml=feature=>{const g=feature.geometry;if(g.type==='Point')return `<Point><coordinates>${g.coordinates.join(',')}</coordinates></Point>`;if(g.type==='Polygon')return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${g.coordinates[0].map(c=>c.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`;return `<Point><coordinates>${turf.centroid(feature).geometry.coordinates.join(',')}</coordinates></Point>`;};
    const placemarks=[`<Placemark><name>POI</name><Point><coordinates>${lon},${lat}</coordinates></Point></Placemark>`];
    state.rows.forEach(row=>{
      const exported=row.kind==='relaves'?row.relations:[row.main];
      exported.forEach((rel,index)=>placemarks.push(`<Placemark><name>${esc(rel.p.faena||rel.p.nombre||rel.p.id_relave||row.entity)}</name><ExtendedData><Data name="distancia_km"><value>${rel.distanceKm}</value></Data><Data name="indice"><value>${row.score}</value></Data><Data name="clasificacion"><value>${row.category}</value></Data><Data name="radio_cluster_km"><value>${row.clusterRadiusKm??''}</value></Data><Data name="relave_mas_cercano"><value>${index===0}</value></Data></ExtendedData>${geometryKml(rel.feature)}</Placemark>`));
      const n=row.main.nearest.geometry.coordinates;placemarks.push(`<Placemark><name>Distancia ${row.group}</name><LineString><coordinates>${lon},${lat} ${n[0]},${n[1]}</coordinates></LineString></Placemark>`);
      if(row.kind==='relaves'){const ring=[];for(let bearing=0;bearing<=360;bearing+=6)ring.push(turf.destination(turf.point([lon,lat]),row.clusterRadiusKm,bearing).geometry.coordinates.join(','));placemarks.push(`<Placemark><name>Radio del clúster</name><ExtendedData><Data name="radio_km"><value>${row.clusterRadiusKm}</value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`);}
    });
    const k=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.join('')}</Document></kml>`;const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([k],{type:'application/vnd.google-earth.kml+xml'}));a.download='geonoxa-exposicion.kml';a.click();URL.revokeObjectURL(a.href);
  };init();
})();
