(function () {
  'use strict';
  const A = window.GeoNoxaAnalysis, T = window.GeoNoxaMapTheme;
  const params = new URLSearchParams(location.search);
  const number = key => Number(params.get(key));
  const lat = number('queryLat') || number('lat') || -30.25;
  const lon = number('queryLon') || number('lon') || -71.08;
  const basemap = (params.get('basemap') || 'osm').toLowerCase().includes('sat') ? 'sat' : 'osm';
  const rawBounds = { west: number('viewWest'), south: number('viewSouth'), east: number('viewEast'), north: number('viewNorth') };
  const validBounds = Object.values(rawBounds).every(Number.isFinite) && rawBounds.east > rawBounds.west && rawBounds.north > rawBounds.south;
  const bounds = A.expandedViewport(validBounds ? rawBounds : { west: lon - .35, east: lon + .35, south: lat - .25, north: lat + .25 });
  const analysisResults = A.createAnalysisResults();
  const state = { lat, lon, basemap, sourceCount: 0, rows: [], failures: [] };
  const maps = { relaves: null, zonas: null };
  const mapLayers = { relaves: [], zonas: [] };
  const fmt = value => Number(value).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  const esc = value => String(value ?? 'Sin información').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const validFeature = feature => feature && feature.type === 'Feature' && feature.geometry && feature.geometry.type;

  function insideBbox(feature) {
    if (!validFeature(feature)) return false;
    try {
      const box = turf.bbox(feature);
      return box.every(Number.isFinite) && !(box[2] < bounds.west || box[0] > bounds.east || box[3] < bounds.south || box[1] > bounds.north);
    } catch (error) {
      console.warn('GeoNOXA: geometría descartada al evaluar el viewport', feature, error);
      return false;
    }
  }

  function nearestBoundary(point, feature) {
    let best = null;
    const lines = turf.polygonToLine(feature);
    turf.flattenEach(lines, line => {
      const candidate = turf.nearestPointOnLine(line, point);
      const distanceKm = turf.distance(point, candidate);
      if (!best || distanceKm < best.distanceKm) best = { point: candidate, distanceKm };
    });
    if (!best) throw Error('No se pudo obtener un borde válido');
    return best;
  }

  function relation(feature, kind) {
    if (!validFeature(feature)) throw Error('Entidad sin geometría utilizable');
    const point = turf.point([lon, lat]);
    const geometry = feature.geometry;
    const p = feature.properties || {};
    let nearest, inside = false, distanceKm, depth = null;
    let area = Number(p.shape_area_m2 || p.superficie_m2 || p.area_m2);
    area = Number.isFinite(area) && area > 0 ? area : null;
    if (/Polygon/.test(geometry.type)) {
      inside = turf.booleanPointInPolygon(point, feature);
      if (!area) area = turf.area(feature) || null;
      const boundary = nearestBoundary(point, feature);
      nearest = boundary.point;
      distanceKm = kind === 'zonas' && inside ? 0 : boundary.distanceKm;
      const diameterForDepth = A.equivalentDiameterKm(area);
      if (inside) depth = Math.min(1, boundary.distanceKm / Math.max((diameterForDepth || 1) / 2, .001));
    } else {
      nearest = geometry.type === 'Point' ? feature : turf.centroid(feature);
      distanceKm = turf.distance(point, nearest);
    }
    const coordinates = nearest?.geometry?.coordinates;
    if (!Array.isArray(coordinates) || !A.isValidCoordinate(Number(coordinates[1]), Number(coordinates[0])) || !Number.isFinite(distanceKm)) throw Error('Entidad sin coordenadas válidas');
    const diameter = A.equivalentDiameterKm(area);
    const score = kind === 'relaves' && geometry.type === 'Point'
      ? A.pointTailingsExposure(distanceKm, area)
      : A.relativeExposure({ inside, distanceKm, diameterKm: diameter, depthRatio: depth });
    return { feature, inside, distance: distanceKm, distanceKm, nearest, area, diameter, depth, score, category: A.exposureCategory(score), ratio: diameter ? distanceKm / diameter : null, p };
  }

  async function loadGroup(url) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`${response.status} al cargar ${url}`);
    const data = await response.json();
    if (!Array.isArray(data.features)) throw Error(`GeoJSON inválido en ${url}`);
    return data;
  }

  function analyzeEntities(entities, kind) {
    const detected = [];
    entities.forEach(entity => {
      const feature = entity.features.find(insideBbox);
      if (!feature) return;
      try { detected.push(relation(feature, kind)); }
      catch (error) { console.warn(`GeoNOXA: entidad de ${kind} descartada`, feature?.properties, error); }
    });
    return detected;
  }

  async function analyzeTailings() {
    const data = await loadGroup('../capas_geoquery/geonoxa_relaves_query.geojson');
    const entities = A.groupLogicalEntities(data.features.filter(validFeature), 'relaves');
    const detected = analyzeEntities(entities, 'relaves');
    return { detected, related: A.selectNearestTailings(detected, 10), ier: null, sourceCount: entities.length, error: null };
  }

  async function analyzeZones() {
    const data = await loadGroup('../capas_geoquery/geonoxa_zonas_query.geojson');
    const entities = A.groupLogicalEntities(data.features.filter(validFeature), 'zonas');
    const detected = analyzeEntities(entities, 'zonas');
    return { detected, related: A.selectRelatedZones(detected), iez: null, sourceCount: entities.length, error: null };
  }

  async function safeAnalyze(label, analyze, empty) {
    try { return await analyze(); }
    catch (error) {
      console.error(`GeoNOXA: fallo en ${label}`, error);
      state.failures.push({ stage: label, error });
      return { ...empty, error };
    }
  }
  const safeAnalyzeTailings = () => safeAnalyze('Relaves', analyzeTailings, { detected: [], related: [], ier: null, sourceCount: 0 });
  const safeAnalyzeZones = () => safeAnalyze('Zonas', analyzeZones, { detected: [], related: [], iez: null, sourceCount: 0 });

  function entityName(kind, relationItem) {
    const p = relationItem?.p || {};
    if (kind === 'relaves') return A.getTailingsName(relationItem?.feature);
    return p.nombre_zon || p.nombre || p.zona || p.zona_dec || 'Zona sin nombre';
  }

  function buildRow(kind, relations) {
    if (!relations.length) return null;
    const isTailings = kind === 'relaves';
    const ordered = isTailings ? relations : [...relations].sort((a, b) => b.score - a.score);
    const main = ordered[0];
    const dominant = A.dominant(ordered, item => isTailings ? item.p.recurso : (item.p.contaminante || item.p.contaminantes || item.p.saturado || item.p.latentes));
    const scores = ordered.map(item => Number(item.score)).filter(Number.isFinite);
    const score = scores.length ? (isTailings ? Math.round(scores.reduce((sum, item) => sum + item, 0) / scores.length) : scores[0]) : null;
    const category = score === null ? null : A.exposureCategory(score);
    const clusterRadiusKm = isTailings ? ordered.at(-1)?.distanceKm ?? null : null;
    const meanDistance = isTailings ? ordered.reduce((sum, item) => sum + item.distanceKm, 0) / ordered.length : null;
    return { group: isTailings ? 'RELAVES' : 'ZONAS SATURADAS / LATENTES', entity: entityName(kind, main), distance: main.distanceKm, score, category: category?.label || 'Sin información', categoryData: category, detail: isTailings ? `${dominant?.name || 'Sin información'} · ${main.p.comuna || ''}` : `${main.p.zona_dec || main.p.tipo || main.p.clasificacion || 'Zona ambiental'} · ${dominant?.name || 'Sin información'}`, main, kind, relations: ordered, clusterRadiusKm, meanDistance, dominant };
  }

  function destroyMap(kind) {
    if (maps[kind]) { maps[kind].remove(); maps[kind] = null; }
    mapLayers[kind] = [];
  }

  function createMap(id, relations, kind, primary) {
    const container = document.getElementById(id);
    if (!container) throw Error(`No existe el contenedor ${id}`);
    destroyMap(kind);
    const map = L.map(container, { zoomControl: true });
    maps[kind] = map;
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Esri' });
    (basemap === 'sat' ? sat : osm).addTo(map);
    const fit = [L.circleMarker([lat, lon], { radius: 8, color: '#fff', weight: 3, fillColor: '#ef233c', fillOpacity: 1 }).addTo(map).bindTooltip('POI')];
    relations.forEach(item => {
      const coordinates = item.nearest?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || !A.isValidCoordinate(Number(coordinates[1]), Number(coordinates[0]))) {
        console.warn('GeoNOXA: entidad sin coordenadas utilizables para el mapa', item.p);
        return;
      }
      const layer = L.geoJSON(item.feature, { style: T.entityStyle(kind === 'relaves' ? 'relaves' : (String(item.p.zona_dec || item.p.tipo || item.p.clasificacion).toLowerCase().includes('latent') ? 'latente' : 'saturada'), basemap, item === primary), pointToLayer: (feature, ll) => L.circleMarker(ll, { ...T.entityStyle('relaves', basemap, item === primary), radius: item === primary ? 9 : 6, fillOpacity: .75 }) }).addTo(map);
      fit.push(layer);
      mapLayers[kind].push({ layer, kind: kind === 'relaves' ? 'relaves' : 'saturada', selected: item === primary });
    });
    const nearest = primary?.nearest?.geometry?.coordinates;
    if (Array.isArray(nearest) && A.isValidCoordinate(Number(nearest[1]), Number(nearest[0]))) fit.push(L.polyline([[lat, lon], [nearest[1], nearest[0]]], T.distanceStyle).addTo(map).bindTooltip(`${fmt(primary.distanceKm)} km`));
    if (kind === 'relaves') {
      const radiusKm = relations.at(-1)?.distanceKm;
      if (Number.isFinite(radiusKm) && radiusKm >= 0) fit.push(L.circle([lat, lon], { radius: radiusKm * 1000, color: '#047857', weight: 2, dashArray: '7 5', fillColor: '#10b981', fillOpacity: .06 }).addTo(map).bindTooltip(`Radio del clúster: ${fmt(radiusKm)} km`));
    }
    const featureGroup = L.featureGroup(fit);
    const mapBounds = featureGroup.getBounds();
    if (mapBounds?.isValid()) map.fitBounds(mapBounds.pad(.18), { padding: [28, 28], maxZoom: 13 });
    else map.setView([lat, lon], 10);
    L.control.layers({ OSM: osm, SAT: sat }).addTo(map);
    map.on('baselayerchange', event => T.restyle(mapLayers[kind], event.name === 'SAT' ? 'sat' : 'osm'));
    requestAnimationFrame(() => { if (maps[kind] === map) map.invalidateSize(); });
  }

  function renderGroup(kind, result) {
    const isTailings = kind === 'relaves';
    const title = isTailings ? 'RELAVES' : 'ZONAS SATURADAS / LATENTES';
    const target = document.getElementById(isTailings ? 'tailings-report' : 'zones-report');
    const group = document.createElement('section');
    group.className = 'group';
    group.innerHTML = `<div class="group-title"><div><small>MICROINFORME</small><h2>${title}</h2></div><div class="group-count"><b>${result.related.length} ${isTailings ? 'relaves relacionados' : result.related.length === 1 ? 'zona relacionada' : 'zonas relacionadas'}</b>${isTailings ? `<small>${result.detected.length} relaves detectados en el área territorial analizada</small>` : ''}</div></div>`;
    if (!result.related.length) {
      group.innerHTML += `<div class="empty">${result.error ? 'Grupo no disponible por un error de análisis.' : 'Sin entidades relevantes<br>en el área territorial analizada.'}</div>`;
      target.replaceChildren(group);
      return null;
    }
    const row = buildRow(kind, result.related);
    if (isTailings) result.ier = row.score; else result.iez = row.score;
    const areas = isTailings ? row.relations.map(item => Number(item.area)).filter(value => Number.isFinite(value) && value > 0) : [];
    const totalArea = areas.reduce((sum, value) => sum + value, 0);
    const distribution = isTailings ? A.distribution(row.relations, item => item.p.recurso || 'Sin información', 5) : [];
    const p = row.main.p;
    const metrics = isTailings
      ? [['Relave más cercano', row.entity], ['Relaves relacionados', row.relations.length], ['Recurso dominante', `${row.dominant.name} · ${row.dominant.percent} %`], ['Distancia mínima', `${fmt(row.distance)} km`], ['Distancia media', `${fmt(row.meanDistance)} km`], ['Radio del clúster', `${fmt(row.clusterRadiusKm)} km`], ['Estado predominante', A.dominant(row.relations, item => item.p.estado || item.p.tipo_deposito)?.name || 'Sin información'], ['Superficie total', areas.length ? `${fmt(totalArea / 1e6)} km²` : 'Sin información'], ['Superficie media', areas.length ? `${fmt(totalArea / areas.length / 1e6)} km²` : 'Sin información']]
      : [['Zona principal', row.entity], ['Clasificación', p.zona_dec || p.tipo || p.clasificacion || 'Zona ambiental'], ['Contaminante', row.dominant.name], ['Posición', row.main.inside ? 'Interior' : 'Exterior'], ['Distancia al borde', `${fmt(row.distance)} km`], ['Diámetro equivalente', row.main.diameter ? `${fmt(row.main.diameter)} km` : 'Sin información'], ['Relación territorial', row.main.ratio !== null ? `${fmt(row.main.ratio)} diámetros` : 'No aplica'], ['Profundidad relativa', row.main.depth !== null ? `${fmt(row.main.depth * 100)} %` : 'No aplica']];
    const index = row.score === null ? '<strong>IER no calculable</strong>' : `<strong>${row.score}</strong> · Exposición ${row.category}`;
    const mapId = `map-${kind}`;
    group.innerHTML += `<div class="micro"><div><div class="index" style="background:${row.categoryData?.color || '#64748b'}"><small style="color:white">${isTailings ? 'IER' : 'IEZ'}</small><br>${index}</div><div class="metrics">${metrics.map(metric => `<div class="metric"><b>${metric[0]}</b>${esc(metric[1])}</div>`).join('')}</div>${isTailings ? `<div class="chart"><b>Distribución por recurso</b><div class="resource-bars">${distribution.map((item, index) => `<div><span>${esc(item.name)}</span><i><em class="color-${index}" style="width:${item.count / row.relations.length * 100}%"></em></i><strong>${item.count}</strong></div>`).join('')}</div><div class="legend">${distribution.map((item, index) => `<span class="legend-${index}">● ${esc(item.name)} · ${item.count}</span>`).join('')}</div></div>` : ''}</div><div id="${mapId}" class="map" aria-label="Mapa independiente de ${title}"></div></div>`;
    target.replaceChildren(group);
    state.rows.push(row);
    try { createMap(mapId, row.relations, kind, row.main); }
    catch (error) {
      console.error(`GeoNOXA: fallo al renderizar mapa de ${title}`, error);
      state.failures.push({ stage: `Mapa de ${title}`, error });
      document.getElementById(mapId).innerHTML = '<div class="empty">Mapa no disponible. Los resultados del grupo siguen vigentes.</div>';
    }
    return row;
  }

  function safeRender(label, render) {
    try { return render(); }
    catch (error) {
      console.error(`GeoNOXA: fallo al renderizar ${label}`, error);
      state.failures.push({ stage: label, error });
      return null;
    }
  }

  function renderQuerySummary() {
    const fields = [['Latitud', lat.toFixed(6)], ['Longitud', lon.toFixed(6)], ['Sitio de origen', params.get('site') || 'GeoNOXA'], ['Estado', state.failures.length ? 'Análisis parcial completado' : 'Análisis completado'], ['Grupos ambientales', '2'], ['Entidades fuente', state.sourceCount], ['Entidades detectadas en ViewPort', analysisResults.relaves.detected.length + analysisResults.zonas.detected.length], ['Entidades relacionadas', A.totalRelatedEntities(analysisResults)]];
    document.getElementById('site').textContent = params.get('site') || 'Consulta territorial';
    document.getElementById('query-grid').innerHTML = fields.map(field => `<div class="datum"><b>${field[0]}</b>${esc(field[1])}</div>`).join('');
  }

  function renderOverallExposure() {
    const maximum = A.maximumExposure(analysisResults);
    const row = maximum && state.rows.find(item => item.kind === maximum.kind);
    const panel = document.getElementById('greatest');
    panel.classList.remove('loading');
    panel.innerHTML = row ? `<small>MAYOR EXPOSICIÓN TERRITORIAL</small><h2>${esc(maximum.group)}</h2><div class="score">${maximum.kind === 'relaves' ? 'IER' : 'IEZ'} ${maximum.index}</div><b>${esc(row.entity)}</b><span>Exposición ${row.category}</span>` : '<small>MAYOR EXPOSICIÓN TERRITORIAL</small><h2>Sin exposición territorial calculable</h2>';
  }

  function renderExecutiveSummary() {
    const tailings = state.rows.find(item => item.kind === 'relaves');
    const zone = state.rows.find(item => item.kind === 'zonas');
    const sentences = [];
    if (tailings) sentences.push(`Se analizaron los ${analysisResults.relaves.related.length} relaves más cercanos al punto consultado, contenidos en un radio de ${fmt(tailings.clusterRadiusKm)} km. El relave más próximo, ${tailings.entity}, se ubica a ${fmt(tailings.distance)} km. ${tailings.score === null ? 'No fue posible calcular el IER con la información disponible.' : `La exposición territorial del grupo corresponde a un IER de ${tailings.score}.`}`);
    else sentences.push(analysisResults.relaves.error ? 'No fue posible analizar los relaves.' : 'No se detectaron relaves en el viewport ampliado.');
    if (zone) sentences.push(`La zona ${zone.entity} presenta un IEZ de ${zone.score}, asociado a ${zone.dominant.name}.`);
    else sentences.push(analysisResults.zonas.error ? 'No fue posible analizar las zonas saturadas o latentes.' : 'No se detectaron zonas saturadas o latentes relacionadas.');
    if (state.failures.length) sentences.push('Análisis parcial completado; los resultados disponibles se mantienen vigentes.');
    document.getElementById('synthesis').textContent = sentences.join(' ');
  }

  function renderComplementaryTable() {
    document.getElementById('details').innerHTML = state.rows.map(row => `<tr><td>${row.group}</td><td>${esc(row.entity)}</td><td>${fmt(row.distance)} km</td><td>${row.score === null ? 'No calculable' : row.score}</td><td>${row.category}</td><td>${esc(row.detail)}</td></tr>`).join('') || '<tr><td colspan="6">Sin entidades relevantes.</td></tr>';
  }

  function finalizeLoadingStates() {
    const greatest = document.getElementById('greatest');
    greatest.classList.remove('loading');
    if (/Calculando/.test(greatest.textContent)) greatest.innerHTML = `<small>MAYOR EXPOSICIÓN TERRITORIAL</small><h2>${state.failures.length ? 'Análisis parcial completado' : 'Sin exposición territorial calculable'}</h2>`;
    const synthesis = document.getElementById('synthesis');
    if (/Analizando/.test(synthesis.textContent)) synthesis.textContent = state.failures.length ? 'Análisis parcial completado.' : 'Análisis completado sin entidades relacionadas.';
    safeRender('resumen de consulta', renderQuerySummary);
  }

  async function runFullAnalysis() {
    const tailingsResult = await safeAnalyzeTailings();
    const zonesResult = await safeAnalyzeZones();
    Object.assign(analysisResults.relaves, tailingsResult);
    Object.assign(analysisResults.zonas, zonesResult);
    state.sourceCount = tailingsResult.sourceCount + zonesResult.sourceCount;
    state.rows = [];
    safeRender('Relaves', () => renderGroup('relaves', tailingsResult));
    safeRender('Zonas', () => renderGroup('zonas', zonesResult));
    safeRender('mayor exposición', renderOverallExposure);
    safeRender('síntesis ejecutiva', renderExecutiveSummary);
    safeRender('tabla complementaria', renderComplementaryTable);
  }

  async function init() {
    try { await runFullAnalysis(); }
    catch (error) { console.error('GeoNOXA: error general', error); state.failures.push({ stage: 'general', error }); }
    finally { finalizeLoadingStates(); }
  }

  document.getElementById('back').onclick = () => { const query = new URLSearchParams(params); query.set('lat', params.get('viewLat') || lat); query.set('lon', params.get('viewLon') || lon); location.href = `../index.html?${query}`; };
  document.getElementById('pdf').onclick = () => html2pdf().set({ margin: 8, filename: 'geonoxa-informe-exposicion.pdf', html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: ['css', 'legacy'] } }).from(document.getElementById('report')).save();
  document.getElementById('kml').onclick = () => {
    const geometryKml = feature => { const geometry = feature.geometry; if (geometry.type === 'Point') return `<Point><coordinates>${geometry.coordinates.join(',')}</coordinates></Point>`; if (geometry.type === 'Polygon') return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${geometry.coordinates[0].map(coordinate => coordinate.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon>`; const center = turf.centroid(feature).geometry.coordinates; return `<Point><coordinates>${center.join(',')}</coordinates></Point>`; };
    const placemarks = [`<Placemark><name>POI</name><Point><coordinates>${lon},${lat}</coordinates></Point></Placemark>`];
    state.rows.forEach(row => {
      (row.kind === 'relaves' ? row.relations : [row.main]).forEach((item, index) => placemarks.push(`<Placemark><name>${esc(entityName(row.kind, item))}</name><ExtendedData><Data name="distancia_km"><value>${item.distanceKm}</value></Data><Data name="indice"><value>${row.score ?? ''}</value></Data><Data name="clasificacion"><value>${row.category}</value></Data><Data name="radio_cluster_km"><value>${row.clusterRadiusKm ?? ''}</value></Data><Data name="relave_mas_cercano"><value>${index === 0}</value></Data></ExtendedData>${geometryKml(item.feature)}</Placemark>`));
      const nearest = row.main.nearest.geometry.coordinates;
      placemarks.push(`<Placemark><name>Distancia ${row.group}</name><LineString><coordinates>${lon},${lat} ${nearest[0]},${nearest[1]}</coordinates></LineString></Placemark>`);
      if (row.kind === 'relaves' && Number.isFinite(row.clusterRadiusKm)) { const ring = []; for (let bearing = 0; bearing <= 360; bearing += 6) ring.push(turf.destination(turf.point([lon, lat]), row.clusterRadiusKm, bearing).geometry.coordinates.join(',')); placemarks.push(`<Placemark><name>Radio del clúster</name><ExtendedData><Data name="radio_km"><value>${row.clusterRadiusKm}</value></Data></ExtendedData><Polygon><outerBoundaryIs><LinearRing><coordinates>${ring.join(' ')}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`); }
    });
    const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks.join('')}</Document></kml>`;
    const anchor = document.createElement('a'); anchor.href = URL.createObjectURL(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' })); anchor.download = 'geonoxa-exposicion.kml'; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  init();
})();
