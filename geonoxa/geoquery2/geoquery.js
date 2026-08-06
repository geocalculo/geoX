(function () {
  'use strict';
  const A = window.GeoNoxaAnalysis, T = window.GeoNoxaMapTheme;
  const params = new URLSearchParams(location.search);
  const requestedSiteName = (params.get('site') || '').trim();
  const siteName = /^geonoxa$/i.test(requestedSiteName) ? 'GeoNOXA' : (requestedSiteName || 'GeoNOXA');
  const number = key => Number(params.get(key));
  const lat = number('queryLat') || number('lat') || -30.25;
  const lon = number('queryLon') || number('lon') || -71.08;
  const basemap = (params.get('basemap') || 'osm').toLowerCase().includes('sat') ? 'sat' : 'osm';
  const viewWest = number('viewWest');
  const viewSouth = number('viewSouth');
  const viewEast = number('viewEast');
  const viewNorth = number('viewNorth');
  const rawBounds = { west: viewWest, south: viewSouth, east: viewEast, north: viewNorth };
  const validBounds = Object.values(rawBounds).every(Number.isFinite) && rawBounds.east > rawBounds.west && rawBounds.north > rawBounds.south;
  const originalBounds = validBounds ? rawBounds : { west: lon - .35, east: lon + .35, south: lat - .25, north: lat + .25 };
  const originalViewportBbox = validBounds
    ? [viewWest, viewSouth, viewEast, viewNorth]
    : [originalBounds.west, originalBounds.south, originalBounds.east, originalBounds.north];
  const originalViewportPolygon = turf.bboxPolygon(originalViewportBbox);
  const analysisResults = A.createAnalysisResults();
  const state = { lat, lon, basemap, sourceCount: 0, rows: [], failures: [] };
  let relavesMapInstance = null;
  let zonasMapInstance = null;
  const maps = {};
  Object.defineProperties(maps, {
    relaves: { get: () => relavesMapInstance, set: value => { relavesMapInstance = value; } },
    zonas: { get: () => zonasMapInstance, set: value => { zonasMapInstance = value; } }
  });
  const mapLayers = { relaves: [], zonas: [] };
  const tailingsMarkers = new Map();
  const fmt = value => Number(value).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  const esc = value => String(value ?? 'Sin información').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const present = value => value !== null && value !== undefined && String(value).trim() !== '';
  const distanceLabel = value => Number.isFinite(Number(value)) ? `${fmt(value)} km` : 'Sin información';
  const areaM2Label = value => Number.isFinite(Number(value)) && Number(value) > 0 ? `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: 1 })} m²` : 'Sin información';
  const resourceColors = ['#0f766e', '#f59e0b', '#2563eb', '#7c3aed', '#dc2626', '#0891b2', '#65a30d', '#c2410c'];
  const metadataTable = (title, entries) => `<div style="font-family:Arial,sans-serif;font-size:13px"><h3 style="margin:0 0 8px">${esc(title)}</h3><table>${entries.filter(([, value]) => present(value)).map(([label, value]) => `<tr><td style="padding:2px 10px 2px 0"><strong>${esc(label)}:</strong></td><td>${esc(value)}</td></tr>`).join('')}</table></div>`;
  function tailingsMetadata(item, index, total) { return A.buildTailingsKmlMetadata(item, index, total); }
  function tailingsMetadataEntries(metadata) {
    return [['Orden', `${metadata.order} de ${metadata.total}`], ['Recurso', metadata.resource], ['Estado', metadata.status], ['Distancia al POI', distanceLabel(metadata.distanceKm)], ['Superficie', areaM2Label(metadata.area)], ['Empresa o titular', metadata.owner], ['Comuna', metadata.commune], ['Región', metadata.region], ['Identificador original', metadata.id], ['Rol', metadata.role]];
  }
  function tailingsDescription(metadata) { return metadataTable(metadata.name, tailingsMetadataEntries(metadata)); }
  function tailingsExtendedData(metadata) {
    return Object.fromEntries(tailingsMetadataEntries(metadata).map(([name, value]) => [name, value]).filter(([, value]) => present(value) && value !== 'Sin información'));
  }
  function tailingsSummaryModel(item, index, total) {
    return { metadata: tailingsMetadata(item, index, total) };
  }
  function buildCompactTailingsPopup(item, index, total) {
    const { metadata } = tailingsSummaryModel(item, index, total);
    const popup = document.createElement('div');
    popup.className = 'tailing-popup';
    const title = document.createElement('div');
    title.className = 'tailing-popup__title';
    title.textContent = metadata.name;
    popup.append(title);
    const appendMeta = (label, value) => {
      if (!present(value) || String(value).trim() === 'Sin información') return;
      const meta = document.createElement('div');
      meta.className = 'tailing-popup__meta';
      meta.textContent = `${label}: ${value}`;
      popup.append(meta);
    };
    appendMeta('Código', metadata.id);
    appendMeta('Distancia', distanceLabel(metadata.distanceKm));
    appendMeta('Recurso', metadata.resource);
    return popup;
  }
  function buildPoiPopup() {
    const popup = document.createElement('div');
    popup.className = 'tailing-popup tailing-popup--poi';
    const entries = [['Punto consultado', 'tailing-popup__title'], [`Latitud: ${lat.toFixed(6)}`, 'tailing-popup__meta'], [`Longitud: ${lon.toFixed(6)}`, 'tailing-popup__meta']];
    entries.forEach(([value, className]) => {
      const line = document.createElement('div');
      line.className = className;
      line.textContent = value;
      popup.append(line);
    });
    return popup;
  }
  function clearTailingsSelection() {
    document.querySelectorAll('.geoquery-list__item').forEach(row => row.classList.remove('geoquery-list__item--active'));
    if (relavesMapInstance) relavesMapInstance.closePopup();
  }
  const validFeature = feature => feature && feature.type === 'Feature' && feature.geometry && feature.geometry.type;

  function isTailingsInsideOriginalViewport(feature) {
    if (!validFeature(feature)) return false;
    try {
      if (feature.geometry.type === 'Point') {
        const coordinates = A.getRelaveCoordinates(feature);
        return coordinates ? A.pointInsideViewport(coordinates.lat, coordinates.lon, originalBounds) : false;
      }
      if (/Polygon/.test(feature.geometry.type)) {
        const box = turf.bbox(feature);
        return A.bboxIntersects(box, originalViewportBbox) && turf.booleanIntersects(feature, originalViewportPolygon);
      }
      return false;
    } catch (error) {
      console.warn('GeoNOXA: relave descartado al evaluar el viewport original', feature, error);
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
      distanceKm = boundary.distanceKm;
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

  async function analyzeTailings() {
    const data = await loadGroup('../capas_geoquery/geonoxa_relaves_query.geojson');
    const entities = A.groupLogicalEntities(data.features.filter(validFeature), 'relaves');
    const detected = [];
    entities.forEach(entity => {
      const feature = entity.features.find(isTailingsInsideOriginalViewport);
      if (!feature) return;
      try { detected.push(relation(feature, 'relaves')); }
      catch (error) { console.warn('GeoNOXA: relave descartado', feature?.properties, error); }
    });
    return { detected, related: A.selectNearestTailings(detected, 10), ier: null, sourceCount: entities.length, error: null };
  }

  async function analyzeZones() {
    const data = await loadGroup('../capas_geoquery/geonoxa_zonas_query.geojson');
    const entities = A.groupLogicalEntities(data.features.filter(validFeature), 'zonas');
    const detected = [];
    entities.forEach(entity => {
      const intersectingRelations = entity.features.flatMap(zone => {
        try {
          const zoneBbox = turf.bbox(zone);
          if (!A.bboxIntersects(zoneBbox, originalViewportBbox)) return [];
          if (!turf.booleanIntersects(zone, originalViewportPolygon)) return [];
          return [relation(zone, 'zonas')];
        } catch (error) {
          console.warn('GeoNOXA: zona inválida para filtro de viewport', error);
          return [];
        }
      });
      const relatedFragment = A.selectRelatedZones(intersectingRelations)[0];
      if (relatedFragment) detected.push(relatedFragment);
    });
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
    const score = scores.length ? (isTailings ? scores.reduce((sum, item) => sum + item, 0) / scores.length : scores[0]) : null;
    const semantics = A.indicatorSemantics(kind, main.inside, score);
    const category = semantics.category;
    const clusterRadiusKm = isTailings ? ordered.at(-1)?.distanceKm ?? null : null;
    const meanDistance = isTailings ? ordered.reduce((sum, item) => sum + item.distanceKm, 0) / ordered.length : null;
    return { group: isTailings ? 'Relaves' : 'Zona Saturada', entity: entityName(kind, main), distance: main.distanceKm, score, category: category?.label || 'Sin información', categoryData: category, semantics, detail: isTailings ? `${dominant?.name || 'Sin información'} · ${main.p.comuna || ''}` : `${main.p.zona_dec || main.p.tipo || main.p.clasificacion || 'Zona ambiental'} · ${dominant?.name || 'Sin información'}`, main, kind, relations: ordered, clusterRadiusKm, meanDistance, dominant };
  }

  function indicatorValue(score) {
    if (!Number.isFinite(score)) return 'No calculable';
    if (score > 0 && score < 1) return '&lt; 1';
    return String(Math.round(score));
  }

  function destroyMap(kind) {
    if (maps[kind]) { maps[kind].remove(); maps[kind] = null; }
    mapLayers[kind] = [];
  }

  // Adaptación acotada del mapa productivo: conserva sus capas OSM/SAT, POI,
  // marcadores, círculo dinámico, fitBounds, escala e invalidación de Leaflet.
  function initializeTailingsMap(result) {
    const container = document.getElementById('relaves-map');
    if (!container) throw Error('No existe el contenedor relaves-map');
    if (!A.isValidCoordinate(lat, lon)) throw Error('Las coordenadas del POI no son válidas');
    if (relavesMapInstance) {
      relavesMapInstance.remove();
      relavesMapInstance = null;
    }
    mapLayers.relaves = [];
    tailingsMarkers.clear();
    const nearestTailings = result.related || [];
    console.table(nearestTailings.map(item => ({
      nombre: A.getTailingsName(item.feature || item),
      coordenadas: A.getRelaveCoordinates(item.feature || item),
      distanciaKm: item.distanceKm
    })));
    const validTailings = nearestTailings
      .map(item => ({ item, coordinates: A.getRelaveCoordinates(item.feature || item) }))
      .filter(entry => entry.coordinates);
    if (!validTailings.length) {
      container.innerHTML = '<div class="empty">Mapa no disponible</div>';
      return;
    }
    const center = [lat, lon];
    const map = L.map(container, { zoomControl: true }).setView(center, 10);
    relavesMapInstance = map;
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap', crossOrigin: true });
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, attribution: 'Tiles &copy; Esri', crossOrigin: true });
    (basemap === 'sat' ? sat : osm).addTo(map);
    const poiMarker = L.circleMarker(center, { radius: 8, color: '#fff', weight: 3, fillColor: '#ef233c', fillOpacity: 1 }).addTo(map).bindPopup(buildPoiPopup(), { maxWidth: 260 });
    const setActiveTailing = (index, openPopup = false) => {
      document.querySelectorAll('.geoquery-list__item').forEach((row, rowIndex) => {
        const active = rowIndex === index;
        row.classList.toggle('geoquery-list__item--active', active);
      });
      tailingsMarkers.forEach((marker, markerIndex) => {
        const nearest = markerIndex === 0;
        marker.setStyle({ ...T.entityStyle('relaves', basemap, nearest || markerIndex === index), radius: nearest || markerIndex === index ? 9 : 6, fillOpacity: .85 });
      });
      if (openPopup) tailingsMarkers.get(index)?.openPopup();
    };
    validTailings.forEach(({ item, coordinates }) => {
      const index = nearestTailings.indexOf(item);
      const selected = item === nearestTailings[0];
      const popup = buildCompactTailingsPopup(item, index, nearestTailings.length);
      const marker = L.circleMarker([coordinates.lat, coordinates.lon], { ...T.entityStyle('relaves', basemap, selected), radius: selected ? 9 : 6, fillOpacity: .85 }).addTo(map).bindPopup(popup, { maxWidth: 260 });
      mapLayers.relaves.push({ layer: marker, kind: 'relaves', selected });
      tailingsMarkers.set(index, marker);
      marker.on('click', () => setActiveTailing(index));
    });
    document.querySelectorAll('.geoquery-list__item').forEach((row, index) => {
      row.addEventListener('mouseenter', () => setActiveTailing(index, true));
      row.addEventListener('focus', () => setActiveTailing(index, true));
      row.addEventListener('click', () => setActiveTailing(index, true));
    });
    const nearestCoordinates = validTailings.find(entry => entry.item === nearestTailings[0])?.coordinates;
    if (nearestCoordinates) {
      const line = L.polyline([center, [nearestCoordinates.lat, nearestCoordinates.lon]], T.distanceStyleFor(basemap)).addTo(map).bindTooltip(`${fmt(nearestTailings[0].distanceKm)} km`);
      mapLayers.relaves.push({ layer: line, kind: 'distance', selected: false });
    }
    const radioClusterKm = nearestTailings.length ? nearestTailings[nearestTailings.length - 1].distanceKm : null;
    let clusterCircle = null;
    if (Number.isFinite(radioClusterKm) && radioClusterKm >= 0) {
      clusterCircle = L.circle(center, { radius: radioClusterKm * 1000, ...T.clusterStyle(basemap) }).addTo(map).bindTooltip(`Radio del clúster: ${fmt(radioClusterKm)} km`);
      mapLayers.relaves.push({ layer: clusterCircle, kind: 'cluster', selected: false });
    }
    const mapBounds = L.latLngBounds([center]);
    validTailings.forEach(({ coordinates }) => mapBounds.extend([coordinates.lat, coordinates.lon]));
    if (clusterCircle) {
      const circleBounds = clusterCircle.getBounds();
      if (circleBounds.isValid()) mapBounds.extend(circleBounds);
    }
    if (mapBounds.isValid()) map.fitBounds(mapBounds, { padding: [24, 24], maxZoom: 13 });
    else map.setView(center, 10);
    L.control.layers({ OSM: osm, SAT: sat }).addTo(map);
    L.control.scale({ metric: true, imperial: false }).addTo(map);
    const legend = L.control({ position: 'bottomright' });
    let legendElement;
    const updateLegend = theme => {
      const relaveColor = theme === 'sat' ? '#eaff00' : '#f97316';
      legendElement.innerHTML = `<i style="background:#ef233c"></i>POI<br><i style="background:${relaveColor}"></i>Relaves relacionados<br><i class="nearest" style="background:${relaveColor}"></i>Relave más cercano<br><span style="color:${relaveColor}">◯</span> Radio del grupo seleccionado<br><span class="distance-key">--- </span>Distancia mínima`;
    };
    legend.onAdd = () => { legendElement = L.DomUtil.create('div', 'map-legend'); updateLegend(basemap); return legendElement; };
    legend.addTo(map);
    map.on('baselayerchange', event => {
      const theme = event.name === 'SAT' ? 'sat' : 'osm';
      T.restyle(mapLayers.relaves, theme);
      updateLegend(theme);
    });
    setTimeout(() => { if (relavesMapInstance === map) relavesMapInstance.invalidateSize(); }, 150);
  }

  function createMap(id, relations, kind, primary) {
    if (kind === 'relaves') return initializeTailingsMap({ related: relations });
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

  function renderGroup(kind, result, scheduleMap = true) {
    const isTailings = kind === 'relaves';
    const title = isTailings ? 'RELAVES' : 'ZONAS SATURADAS / LATENTES';
    const target = document.getElementById(isTailings ? 'tailings-report' : 'zones-report');
    const group = document.createElement('section');
    group.className = 'group';
    group.innerHTML = `<div class="group-title"><div class="section-heading"><small>MICROINFORME</small><h2>${title}</h2><p>${isTailings ? 'Infraestructura de relaves considerada en el análisis territorial.' : 'Zonas ambientales consideradas en el análisis territorial.'}</p></div><div class="group-count"><b>${result.related.length} ${isTailings ? 'relaves analizados' : result.related.length === 1 ? 'zona analizada' : 'zonas analizadas'}</b>${isTailings ? `<small>${result.detected.length} relaves encontrados en el área territorial analizada</small>` : ''}</div></div>`;
    if (!result.related.length) {
      if (!isTailings) {
        target.replaceChildren();
        return null;
      }
      const emptyMessage = isTailings ? 'Sin entidades relevantes en el área territorial analizada.' : '<b>Zonas Saturadas / Latentes:</b> sin entidades relevantes en el viewport.';
      group.classList.add('group--empty');
      group.innerHTML += `<div class="empty">${result.error ? 'Grupo no disponible por un error de análisis.' : emptyMessage}</div>`;
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
      : [['Zona principal', row.entity], ['Clasificación', p.zona_dec || p.tipo || p.clasificacion || 'Zona ambiental'], ['Contaminante', row.dominant.name], ['Posición', row.main.inside ? 'Interior' : 'Exterior'], ['Distancia al borde', `${fmt(row.distance)} km`], ...(row.main.inside ? [['Profundidad relativa', row.main.depth !== null ? fmt(row.main.depth) : 'No aplica']] : [['Diámetro equivalente', row.main.diameter ? `${fmt(row.main.diameter)} km` : 'Sin información'], ['Relación territorial', row.main.ratio !== null ? `${fmt(row.main.ratio)} diámetros` : 'No aplica']])];
    const index = row.score === null ? '<strong>No calculable</strong>' : `<strong>${indicatorValue(row.score)}</strong> · ${row.semantics.interpretation}`;
    const scale = !isTailings ? `<div class="territorial-scale" aria-label="Escala de ${row.semantics.concept.toLowerCase()} territorial"><div class="territorial-scale__bar"></div><div>${['Muy alta', 'Alta', 'Media', 'Baja', 'Muy baja'].map(level => `<span>${row.semantics.concept} ${level.toLowerCase()}</span>`).join('')}</div><small>${row.main.inside ? 'Mayor profundidad relativa implica mayor inmersión territorial dentro de la zona.' : 'Menor cantidad de diámetros implica mayor proximidad territorial.'}</small></div>` : '';
    const mapId = isTailings ? 'relaves-map' : 'map-zonas';
    group.innerHTML += `<div class="micro"><div><div class="index" style="background:${row.categoryData?.color || '#64748b'}"><small style="color:white">${row.semantics.code}</small><br>${index}</div><div class="metrics">${metrics.map(metric => `<div class="metric"><b>${metric[0]}</b>${esc(metric[1])}</div>`).join('')}</div>${scale}${isTailings ? `<div class="chart"><b>Distribución por recurso</b><div class="resource-bars">${distribution.map((item, index) => `<div><span>${esc(item.name)}</span><i><em class="color-${index}" style="width:${item.count / row.relations.length * 100}%"></em></i><strong>${item.count}</strong></div>`).join('')}</div><div class="legend">${distribution.map((item, index) => `<span class="legend-${index}">● ${esc(item.name)} · ${item.count}</span>`).join('')}</div></div>` : ''}</div><div id="${mapId}" class="map" aria-label="Mapa independiente de ${title}"></div></div>`;
    target.replaceChildren(group);
    state.rows.push(row);
    if (scheduleMap) requestAnimationFrame(() => {
      try { createMap(mapId, row.relations, kind, row.main); }
      catch (error) {
        console.error(isTailings ? 'GeoNOXA: error al crear mapa de relaves' : `GeoNOXA: fallo al renderizar mapa de ${title}`, error);
        state.failures.push({ stage: `Mapa de ${title}`, error });
        if (!isTailings) document.getElementById(mapId).innerHTML = '<div class="empty">Mapa no disponible. Los resultados del grupo siguen vigentes.</div>';
        safeRender('resumen de consulta', renderQuerySummary);
      }
    });
    return row;
  }

  function areaLabel(areaM2, average = false) {
    if (!Number.isFinite(areaM2) || areaM2 <= 0) return 'Sin información suficiente';
    if (areaM2 >= 100000) return `${Number(areaM2 / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 2 })} km²`;
    return `${Number(areaM2 / 10000).toLocaleString('es-CL', { maximumFractionDigits: average ? 2 : 1 })} ha`;
  }

  function renderTailingsPanelsShell(result) {
    const target = document.getElementById('tailings-report');
    if (!result.related.length) return renderGroup('relaves', result, false);
    const row = buildRow('relaves', result.related);
    result.ier = row.score;
    state.rows.push(row);
    const selectionText = result.detected.length >= 10
      ? 'Se seleccionaron los 10 relaves más cercanos entre los contenidos en el viewport.'
      : `Se identificaron ${result.detected.length} relaves dentro del viewport consultado.`;
    target.innerHTML = `<section class="report-card tailings-related-panel">
      <header class="report-card__header"><div><span class="eyebrow">RELAVES</span><h2>Relaves relacionados</h2><p>Los relaves más cercanos contenidos en el viewport consultado. ${selectionText}</p></div>
      <div class="report-card__meta"><strong>${row.relations.length} relaves analizados</strong><span>Radio: ${fmt(row.clusterRadiusKm)} km</span></div></header>
      <div class="relaves-layout tailings-related-layout"><div class="relaves-list-column"><ol id="geoquery-tailings-list" class="geoquery-list" aria-label="Relaves relacionados"></ol></div><div class="relaves-map-column"><div id="relaves-map" aria-label="Mapa del clúster de relaves"></div></div></div>
    </section>
    <section class="report-card geoquery-card resource-magnitude-panel" id="resource-magnitude-panel">
      <header class="report-card__header"><div><span class="eyebrow">ANÁLISIS DE MAGNITUD</span><h2>Distribución territorial por recurso</h2><p>Comparación entre la composición del clúster y la superficie acumulada de los relaves seleccionados.</p></div></header>
      <div id="resource-magnitude-content"></div>
    </section>
    <section class="report-card tailings-cluster-panel">
      <header class="report-card__header"><div><span class="eyebrow">ANÁLISIS TERRITORIAL</span><h2>Descripción del clúster de relaves</h2><p>Indicadores calculados sobre los ${row.relations.length} relaves relacionados.</p></div></header>
      <div id="tailings-cluster-content"></div>
    </section>`;
    return row;
  }

  function normalizeClassTokens(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.flatMap(classNames => String(classNames ?? '').split(/\s+/)).map(token => token.trim()).filter(Boolean);
  }

  function renderGeoQueryList({ container, items = [], getIndex, getName, getMeta, getDistance, getStatus, getClasses, getTitle, onItemClick }) {
    if (!container) return;
    container.replaceChildren();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'geoquery-list-empty';
      empty.textContent = 'No se identificaron relaves relacionados en el área consultada.';
      container.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const safelyRead = (reader, fallback = '') => {
        if (typeof reader !== 'function') return fallback;
        try {
          const value = reader(item, index, items);
          return value === null || value === undefined ? fallback : value;
        } catch (error) {
          console.error('GeoNOXA: fallo al renderizar lista de relaves', error);
          return fallback;
        }
      };
      const row = document.createElement('li');
      row.className = 'geoquery-list__item';
      row.classList.add(...normalizeClassTokens(safelyRead(getClasses, [])));
      row.dataset.tailingsIndex = String(index);
      row.tabIndex = 0;
      const title = safelyRead(getTitle);
      if (present(title)) row.title = String(title);
      if (typeof onItemClick === 'function') row.addEventListener('click', () => onItemClick(item, index, row));

      const indexElement = document.createElement('span');
      indexElement.className = 'geoquery-list__index';
      indexElement.textContent = String(safelyRead(getIndex, `${index + 1}.`));

      const content = document.createElement('div');
      content.className = 'geoquery-list__content';
      const name = document.createElement('span');
      name.className = 'geoquery-list__name';
      const itemName = safelyRead(getName, 'Sin nombre');
      name.textContent = present(itemName) ? String(itemName) : 'Sin nombre';
      content.append(name);

      const distance = document.createElement('div');
      distance.className = 'geoquery-list__distance';
      const distanceValue = document.createElement('span');
      distanceValue.className = 'geoquery-list__distance-value';
      distanceValue.textContent = String(safelyRead(getDistance));
      distance.append(distanceValue);
      row.append(indexElement, content, distance);
      fragment.append(row);
    });
    container.append(fragment);
  }

  function renderTailingsList(relatedTailings) {
    const selectedTailings = relatedTailings || [];
    const container = document.querySelector('#geoquery-tailings-list');
    if (!container) {
      console.error('No se encontró #geoquery-tailings-list');
      return;
    }
    renderGeoQueryList({
      container,
      items: selectedTailings,
      getIndex: (item, index, items) => {
        const id = tailingsSummaryModel(item, index, items.length).metadata.id;
        return present(id) ? String(id) : `${index + 1}.`;
      },
      getName: (item, index, items) => tailingsSummaryModel(item, index, items.length).metadata.name,
      getMeta: (item, index, items) => tailingsSummaryModel(item, index, items.length).metadata.resource || 'Sin recurso',
      getDistance: (item, index, items) => distanceLabel(tailingsSummaryModel(item, index, items.length).metadata.distanceKm),
      getStatus: (_, index, items) => index === 0 ? 'Más cercano' : index === items.length - 1 ? 'Límite del clúster' : '',
      getClasses: (_, index, items) => [index === 0 ? ['geoquery-list__item--nearest', 'geoquery-list__item--active'] : [], index === items.length - 1 ? 'geoquery-list__item--limit' : ''],
      getTitle: (item, index, items) => tailingsSummaryModel(item, index, items.length).metadata.name || 'Sin nombre',
      onItemClick: (item, index, row) => {
        document.querySelectorAll('.geoquery-list__item--active').forEach(element => element.classList.remove('geoquery-list__item--active'));
        row.classList.add('geoquery-list__item--active');
        tailingsMarkers.get(index)?.openPopup();
      }
    });
    container.querySelectorAll('.geoquery-list__item').forEach(row => row.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); row.click(); }
    }));
  }

  function renderIerCard(row) {
    const index = row.score === null ? '<strong>No calculable</strong>' : `<strong>${indicatorValue(row.score)}</strong><span>Exposición ${row.category}</span>`;
    return `<div class="index" style="background:${row.categoryData?.color || '#64748b'}"><small>IER</small>${index}</div>`;
  }

  function renderResourceMagnitude(result) {
    const container = document.getElementById('resource-magnitude-content');
    if (!container || !result.related.length) return;
    const magnitude = A.resourceMagnitude(result.related);
    if (magnitude.invalidAreaCount) console.warn(`GeoNOXA: se descartaron ${magnitude.invalidAreaCount} superficies nulas, negativas o no numéricas del gráfico.`);
    if (!magnitude.categories.length) {
      container.innerHTML = '<p class="resource-chart-empty">No hay información de recurso disponible para los relaves analizados.</p>';
      return;
    }
    let offset = 0;
    const radius = 62;
    const circumference = 2 * Math.PI * radius;
    const slices = magnitude.categories.map((item, index) => {
      const length = item.countPercent / 100 * circumference;
      const slice = `<circle cx="80" cy="80" r="${radius}" fill="none" stroke="${resourceColors[index % resourceColors.length]}" stroke-width="41" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"/>`;
      offset += length;
      return slice;
    }).join('');
    const legend = magnitude.categories.map((item, index) => `<li><i style="background:${resourceColors[index % resourceColors.length]}"></i><span>${esc(item.name)}</span><strong>${item.count} · ${Math.round(item.countPercent)} %</strong></li>`).join('');
    const surfaceGroups = magnitude.categories.filter(item => item.areaM2 > 0).sort((a, b) => b.areaM2 - a.areaM2 || a.name.localeCompare(b.name));
    const bars = surfaceGroups.length ? surfaceGroups.map(item => {
      const colorIndex = magnitude.categories.findIndex(category => category.name === item.name);
      return `<li><span>${esc(item.name)}</span><div><i style="width:${item.areaPercent}%;background:${resourceColors[colorIndex % resourceColors.length]}"></i></div><strong>${(item.areaM2 / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha</strong></li>`;
    }).join('') : '<li class="resource-surface-empty">No hay superficies válidas para construir este gráfico.</li>';
    const resourceCount = magnitude.categories.length;
    const areaRecordCount = magnitude.totalCount - magnitude.missingAreaCount;
    const meanAreaLabel = areaRecordCount ? `${(magnitude.totalAreaM2 / areaRecordCount / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha` : 'Sin información';
    container.innerHTML = `<div class="resource-magnitude-kpis geoquery-indicator"><span><b>Relaves analizados:</b> ${magnitude.totalCount}</span><span><b>Superficie total:</b> ${magnitude.totalAreaM2 ? `${(magnitude.totalAreaM2 / 10000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ha` : 'Sin información'}</span></div><div class="resource-charts geoquery-chart"><section><h3>Cantidad de relaves por recurso</h3><div class="resource-pie"><svg viewBox="0 0 160 160" role="img" aria-label="Distribución de cantidad de relaves por recurso">${slices}<circle cx="80" cy="80" r="40" fill="#fff"/><text class="resource-pie__total" x="80" y="70" text-anchor="middle">${magnitude.totalCount}</text><text x="80" y="85" text-anchor="middle">Relaves</text><text class="resource-pie__detail" x="80" y="99" text-anchor="middle">${resourceCount} ${resourceCount === 1 ? 'recurso' : 'recursos'}</text></svg></div><ul class="resource-legend">${legend}</ul></section><section><h3>Superficie por recurso (ha)</h3><ul class="resource-surface-bars">${bars}</ul><div class="resource-surface-average"><span>Superficie media por relave</span><strong>${meanAreaLabel}</strong></div>${magnitude.invalidAreaCount ? '<p class="resource-area-note">La superficie acumulada y la media consideran únicamente registros con superficie válida.</p>' : ''}</section></div>`;
  }

  function renderTailingsClusterDescription(result) {
    const container = document.getElementById('tailings-cluster-content');
    if (!container || !result.related.length) return;
    const row = buildRow('relaves', result.related);
    const areas = row.relations.map(item => Number(item.area)).filter(value => Number.isFinite(value) && value > 0);
    const totalArea = areas.reduce((sum, value) => sum + value, 0);
    const dominantState = A.dominant(row.relations, item => item.p.estado || item.p.tipo_deposito)?.name || 'Sin información';
    const metrics = [['Relaves relacionados', row.relations.length], ['Relave más cercano', row.entity], ['Distancia mínima', `${fmt(row.distance)} km`], ['Distancia media', `${fmt(row.meanDistance)} km`], ['Radio del clúster', `${fmt(row.clusterRadiusKm)} km`], ['Recurso dominante', `${row.dominant.name} · ${row.dominant.percent} %`], ['Estado predominante', dominantState], ['Superficie total', areaLabel(totalArea)]];
    if (areas.length) metrics.push(['Superficie media', areaLabel(totalArea / areas.length, true)]);
    const summary = `El clúster se caracteriza por la concentración de ${row.relations.length} relaves en un radio de ${fmt(row.clusterRadiusKm)} km. Predominan las instalaciones asociadas a ${String(row.dominant.name).toLowerCase()}, que representan el ${row.dominant.percent} % del conjunto (${row.dominant.count} de ${row.relations.length}). La proximidad territorial se expresa en una distancia mínima de ${fmt(row.distance)} km y una distancia media de ${fmt(row.meanDistance)} km respecto del punto consultado.`;
    container.innerHTML = `<div class="tailings-cluster-layout"><div class="tailings-cluster-kpis">${renderIerCard(row)}<div class="metrics">${metrics.map(metric => `<div class="metric"><b>${metric[0]}</b>${esc(metric[1])}</div>`).join('')}</div></div></div><div class="tailings-cluster-summary"><strong>Síntesis automática del clúster</strong><p>${esc(summary)}</p></div>`;
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
    const status = state.failures.length ? 'Análisis parcial completado' : 'Análisis completado';
    document.getElementById('site').textContent = siteName === 'GeoNOXA' ? 'Consulta territorial' : siteName;
    document.getElementById('query-grid').innerHTML = `<div class="query-block query-block--point"><b>Punto consultado</b><dl><div><dt>Latitud</dt><dd>${lat.toFixed(6)}</dd></div><div><dt>Longitud</dt><dd>${lon.toFixed(6)}</dd></div></dl></div><div class="query-block query-block--context"><dl><div><dt>Origen</dt><dd>${esc(siteName)}</dd></div><div><dt>Estado</dt><dd>${esc(status)}</dd></div></dl></div><div class="query-block query-block--indicators"><b>Indicadores principales</b><dl><div><dt>Registros fuente</dt><dd>${state.sourceCount}</dd></div><div><dt>Relaves encontrados</dt><dd>${analysisResults.relaves.detected.length}</dd></div><div><dt>Relaves analizados</dt><dd>${analysisResults.relaves.related.length}</dd></div></dl></div>`;
  }


  function renderExecutiveSummary() {
    const tailings = state.rows.find(item => item.kind === 'relaves');
    const zone = state.rows.find(item => item.kind === 'zonas');
    const conclusions = [];
    if (tailings) {
      conclusions.push(`El análisis caracteriza un escenario de ${tailings.score === null ? 'exposición no calculable' : tailings.semantics.interpretation.toLowerCase()} frente a ${analysisResults.relaves.related.length} relaves seleccionados, concentrados en un radio de ${fmt(tailings.clusterRadiusKm)} km.`);
      conclusions.push(`La instalación más próxima se ubica a ${fmt(tailings.distance)} km y el recurso ${String(tailings.dominant.name).toLowerCase()} predomina en el ${tailings.dominant.percent} % del clúster.`);
    } else conclusions.push(analysisResults.relaves.error ? 'No fue posible analizar los relaves.' : 'No se detectaron relaves en el área analizada.');
    if (zone) conclusions.push(zone.main.inside ? `La localización dentro de ${zone.entity} refuerza el diagnóstico con ${zone.semantics.interpretation.toLowerCase()} territorial.` : `La zona ${zone.entity} mantiene una separación de ${fmt(zone.distance)} km${zone.main.ratio !== null ? `, equivalente a ${fmt(zone.main.ratio)} diámetros` : ''}, respecto del punto.`);
    if (state.failures.length) conclusions.push('El análisis se completó parcialmente; los resultados disponibles se mantienen vigentes.');
    document.getElementById('synthesis').innerHTML = `<ul>${conclusions.map(sentence => `<li>${esc(sentence)}</li>`).join('')}</ul>`;
  }

  function renderAnalysisConclusion() {
    const tailings = state.rows.find(item => item.kind === 'relaves');
    const zone = state.rows.find(item => item.kind === 'zonas');
    let diagnosis;
    if (tailings) {
      const indicator = tailings.score === null ? 'sin un IER calculable' : `con un nivel de ${tailings.semantics.interpretation.toLowerCase()} territorial`;
      const zoneIndex = Number.isFinite(zone?.score) ? (zone.score > 0 && zone.score < 1 ? '< 1' : Math.round(zone.score)) : 'no calculable';
      const zoneContext = zone ? (zone.main.inside ? ` La zona saturada o latente ${zone.entity} contiene el punto y registra ${zone.semantics.code} ${zoneIndex} (${zone.semantics.interpretation.toLowerCase()}).` : ` La zona saturada o latente ${zone.entity} registra ${zone.semantics.code} ${zoneIndex}, a ${fmt(zone.distance)} km del borde${zone.main.ratio !== null ? ` (${fmt(zone.main.ratio)} diámetros equivalentes)` : ''}.`) : ' No se detectaron zonas saturadas o latentes relacionadas.';
      diagnosis = `Dictamen: ${indicator} ante ${tailings.relations.length} relaves; la distancia mínima es ${fmt(tailings.distance)} km y el radio del clúster ${fmt(tailings.clusterRadiusKm)} km, con predominio de ${String(tailings.dominant.name).toLowerCase()}.${zoneContext}`;
    } else {
      diagnosis = analysisResults.relaves.error ? 'La información disponible no permite consolidar un diagnóstico de infraestructura de relaves para el punto consultado.' : 'No se identificó infraestructura de relaves dentro del área territorial analizada; el diagnóstico se limita a los demás indicadores ambientales disponibles.';
    }
    document.getElementById('analysis-conclusion').textContent = diagnosis;
  }

  function renderComplementaryTable() {
    document.getElementById('details').innerHTML = state.rows.flatMap(row => row.kind === 'relaves'
      ? row.relations.map((item, index) => { const metadata = tailingsMetadata(item, index, row.relations.length); return `<tr><td>${row.group}</td><td>${esc(metadata.name)}</td><td>${distanceLabel(metadata.distanceKm)}</td><td>${row.semantics.code} ${row.score === null ? 'No calculable' : indicatorValue(row.score)}</td><td>${esc(metadata.role)}</td><td>${esc([metadata.resource, metadata.status, areaM2Label(metadata.area), metadata.owner, metadata.commune, metadata.region, metadata.id].filter(present).join(' · '))}</td></tr>`; })
      : [`<tr><td>${row.group}</td><td>${esc(row.entity)}</td><td>${distanceLabel(row.distance)}</td><td>${row.semantics.code} ${row.score === null ? 'No calculable' : row.score}</td><td>${row.semantics.interpretation}</td><td>${esc(row.detail)}</td></tr>`]).join('') || '<tr><td colspan="6">Sin entidades relevantes.</td></tr>';
  }

  function finalizeLoadingStates() {
    const synthesis = document.getElementById('synthesis');
    if (/Analizando/.test(synthesis.textContent)) synthesis.textContent = state.failures.length ? 'Análisis parcial completado.' : 'Análisis completado sin entidades relacionadas.';
    safeRender('resumen de consulta', renderQuerySummary);
    const conclusion = document.getElementById('analysis-conclusion');
    if (!conclusion.textContent.trim()) conclusion.textContent = state.failures.length ? 'El análisis finalizó parcialmente y no fue posible consolidar un dictamen con los datos disponibles.' : 'El análisis finalizó sin entidades territoriales relacionadas para emitir un dictamen de exposición.';
  }

  async function runFullAnalysis() {
    const tailingsResult = await safeAnalyzeTailings();
    const zonesResult = await safeAnalyzeZones();
    Object.assign(analysisResults.relaves, tailingsResult);
    Object.assign(analysisResults.zonas, zonesResult);
    state.sourceCount = tailingsResult.sourceCount + zonesResult.sourceCount;
    state.rows = [];
    safeRender('paneles de Relaves', () => renderTailingsPanelsShell(tailingsResult));
    safeRender('lista de relaves', () => renderTailingsList(tailingsResult.related));
    safeRender('distribución territorial por recurso', () => renderResourceMagnitude(tailingsResult));
    safeRender('descripción del clúster', () => renderTailingsClusterDescription(tailingsResult));
    requestAnimationFrame(() => safeRender('mapa de Relaves', () => initializeTailingsMap(tailingsResult)));
    safeRender('Zonas', () => renderGroup('zonas', zonesResult));
    safeRender('síntesis ejecutiva', renderExecutiveSummary);
    safeRender('tabla complementaria', renderComplementaryTable);
    safeRender('conclusión del análisis', renderAnalysisConclusion);
  }

  async function init() {
    document.getElementById('report-date').textContent = `Fecha de consulta · ${new Date().toLocaleDateString('es-CL')}`;
    document.getElementById('report-coordinates').textContent = `Coordenadas · ${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    try { await runFullAnalysis(); }
    catch (error) { console.error('GeoNOXA: error general', error); state.failures.push({ stage: 'general', error }); }
    finally { finalizeLoadingStates(); }
  }

  function waitForExportMaps(timeout = 2500) {
    if (relavesMapInstance) relavesMapInstance.closePopup();
    Object.values(maps).filter(Boolean).forEach(map => map.invalidateSize(false));
    if (!document.querySelector('#report .leaflet-tile-loading')) return Promise.resolve();
    return new Promise(resolve => {
      const startedAt = Date.now();
      const check = () => {
        if (!document.querySelector('#report .leaflet-tile-loading') || Date.now() - startedAt >= timeout) resolve();
        else setTimeout(check, 80);
      };
      check();
    });
  }

  function buildKmlConfig(exporter) {
    const styles = exporter.geoNoxaStyles();
    const registry = exporter.createKmlExportRegistry();
    const add = item => exporter.addUniqueKmlItem(registry, { site: 'GeoNOXA', visible: true, ...item });
    const tailingsRow = state.rows.find(row => row.kind === 'relaves');
    const poiData = { Latitud: lat.toFixed(6), Longitud: lon.toFixed(6), 'Sitio de origen': siteName, 'Fecha de consulta': new Date().toLocaleString('es-CL'), 'Radio del clúster': tailingsRow ? distanceLabel(tailingsRow.clusterRadiusKm) : '', 'Cantidad de relaves': tailingsRow?.relations.length ?? 0, 'Recurso dominante': tailingsRow?.dominant?.name || '', IER: tailingsRow?.score ?? '', Clasificación: tailingsRow?.semantics?.interpretation || '' };
    add({ id: 'geonoxa-query-point', groupId: 'general', folderId: 'query', role: 'query-point', type: 'point', name: 'POI', geometry: { type: 'Point', coordinates: [lon, lat] }, styleId: 'Style-POI', style: styles.poi, description: metadataTable('Punto de interés', Object.entries(poiData)), extendedData: poiData });
    state.rows.forEach(row => {
      const items = row.kind === 'relaves' ? row.relations : [row.main];
      items.forEach((item, index) => {
        if (row.kind === 'relaves') {
          const metadata = tailingsMetadata(item, index, items.length);
          add({ id: `geonoxa-relaves-${index + 1}`, groupId: row.kind, folderId: index === 0 ? 'nearest-relave' : 'relaves', role: index === 0 ? 'nearest-relave' : 'related-point', type: item.feature.geometry.type.toLowerCase(), name: `${String(index + 1).padStart(2, '0')} · ${metadata.role} · ${metadata.name}`, geometry: item.feature.geometry, styleId: index === 0 ? 'Style-Relave-Cercano' : 'Style-Relave', style: index === 0 ? styles.nearest : styles.relave, description: tailingsDescription(metadata), extendedData: tailingsExtendedData(metadata) });
          return;
        }
        const p = item.feature?.properties || item.p || {};
        const position = item.inside ? 'Interior' : 'Exterior';
        const zoneData = { Nombre: entityName('zonas', item), Clasificación: p.zona_dec || p.tipo || p.clasificacion || '', Contaminante: p.contaminante || p.contaminantes || p.saturado || p.latentes || '', Posición: position, 'Distancia al borde': distanceLabel(item.distanceKm), 'Diámetro equivalente': distanceLabel(item.diameter), 'Relación territorial': item.inside ? 'Inmersión' : 'Proximidad', Indicador: row.semantics.code, Valor: row.score ?? '', Interpretación: row.semantics.interpretation };
        add({ id: `geonoxa-zonas-${index + 1}`, groupId: row.kind, folderId: 'zonas', role: 'related-feature', type: item.feature.geometry.type.toLowerCase(), name: entityName(row.kind, item), geometry: item.feature.geometry, styleId: 'Style-Zona-Saturada', style: styles.zone, description: metadataTable(zoneData.Nombre, Object.entries(zoneData).slice(1)), extendedData: zoneData });
      });
      const nearest = row.main.nearest?.geometry?.coordinates;
      if (nearest) {
        const lineData = { Origen: 'POI', Destino: entityName(row.kind, row.main), Distancia: distanceLabel(row.main.distanceKm), Tipo: row.kind === 'relaves' ? 'Distancia mínima' : 'Distancia al borde' };
        add({ id: `geonoxa-distance-${row.kind}`, groupId: row.kind, folderId: 'relations', role: row.kind === 'relaves' ? 'minimum-distance' : 'zone-nearest-line', type: 'line', name: `POI → ${entityName(row.kind, row.main)}`, geometry: { type: 'LineString', coordinates: [[lon, lat], nearest] }, styleId: 'Style-Linea-Distancia', style: styles.distance, description: metadataTable('Relación espacial', Object.entries(lineData)), extendedData: lineData });
      }
      if (row.kind === 'relaves' && Number.isFinite(row.clusterRadiusKm)) {
        const circleData = { Tipo: 'Radio de análisis', Centro: `${lat.toFixed(6)}, ${lon.toFixed(6)}`, Radio: distanceLabel(row.clusterRadiusKm), Criterio: 'Distancia al relave más lejano del grupo seleccionado', 'Relaves incluidos': row.relations.length };
        add({ id: 'geonoxa-cluster-circle', groupId: 'cluster', folderId: 'cluster', role: 'cluster-circle', type: 'polygon', name: `Radio del clúster: ${fmt(row.clusterRadiusKm)} km`, geometry: turf.circle([lon, lat], row.clusterRadiusKm, { steps: 128, units: 'kilometers' }).geometry, styleId: 'Style-Radio', style: styles.radius, description: metadataTable('Radio del clúster', Object.entries(circleData)), extendedData: circleData });
      }
    });
    const features = Array.from(registry.values());
    return { site: 'GeoNOXA', documentName: 'GeoQuery GeoNOXA', documentDescription: document.getElementById('synthesis').textContent, queryPoint: { lat, lon }, folders: [{ id: 'query', name: 'POI' }, { id: 'relaves', name: 'Relaves relacionados' }, { id: 'nearest-relave', name: 'Relave más cercano' }, { id: 'cluster', name: 'Radio del clúster' }, { id: 'relations', name: 'Distancia mínima' }, { id: 'zonas', name: 'Zona Saturada' }], features, debugTheme: false };
  }

  function reportData(extension) {
    const generatedAt = new Date();
    return {
      element: document.getElementById('report'),
      filename: buildExportFilename('GeoNOXA', extension, generatedAt),
      generatedAt,
      locale: 'es-CL',
      title: 'Informe Ejecutivo de Exposición Ambiental',
      header: 'GeoNOXA | Informe Ejecutivo de Exposición Ambiental',
      beforeExport: async () => { clearTailingsSelection(); await waitForExportMaps(); },
      afterExport: () => Object.values(maps).filter(Boolean).forEach(map => map.invalidateSize(false)),
      buildKML: buildKmlConfig
    };
  }

  document.getElementById('back').onclick = () => { const query = new URLSearchParams(params); query.set('lat', params.get('viewLat') || lat); query.set('lon', params.get('viewLon') || lon); location.href = `../index.html?${query}`; };
  document.getElementById('pdf').onclick = () => ReportEngine.exportPDF(reportData('pdf'));
  document.getElementById('kml').onclick = () => ReportEngine.exportKML(reportData('kml'));
  init();
})();
