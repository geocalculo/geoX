# Auditoría de inicialización de viewport GeoX

## Matriz de auditoría

| Sitio | Archivo | Función | Acción sobre mapa | Momento de ejecución | Prioridad actual | Riesgo corregido |
| ----- | ------- | ------- | ----------------- | -------------------- | ---------------- | ---------------- |
| GeoIPT | `geoipt/js/index.js` | `iniciarMapa` | resuelve y aplica viewport inicial | creación del mapa | Cross Access → memoria/GeoQuery → GPS/IP → default | ahora reconoce `memory` como restauración y evita modal/reubicación posterior |
| GeoEVA | `geoeva/js/index.js` | `iniciarMapa` | resuelve y aplica viewport inicial | creación del mapa | Cross Access → memoria/GeoQuery → GPS/IP → default | ahora reconoce `memory` como restauración y evita modal/reubicación posterior |
| GeoNEMO | `geonemo/js/index.js` | `iniciarMapa` | resuelve y aplica viewport inicial | creación del mapa | Cross Access → memoria/GeoQuery → GPS/IP → default | ahora reconoce `memory` como restauración y evita modal/reubicación posterior |
| GeoNOXA | `geonoxa/js/index.js` | `iniciarMapa` | resuelve y aplica viewport inicial | creación del mapa | Cross Access → memoria/GeoQuery → GPS/IP → default | ahora reconoce `memory` como restauración y evita modal/reubicación posterior |
| Todos | `shared/geox-viewport-resolver.js` | `parseCrossAccessViewport` | lectura URL | antes de GPS/default | prioridad 1 | se acepta el parámetro estándar `crossAccess=1` además de aliases legacy |
| Todos | `shared/geox-viewport-resolver.js` | `parseGeoQueryReturnViewport` / `loadSiteViewportPreview` | lectura URL/sessionStorage | antes de geolocalización | prioridad 2 | se normaliza como `source: "memory"` y conserva centro, zoom, basemap y punto consultado |
| Todos | `shared/geox-viewport-resolver.js` | `tryGetGpsViewport` / `tryGetIpViewport` | ubicación autorizada | solo si no hay Cross Access ni memoria | prioridad 3 | solo se usa con permiso `granted`; si falla continúa a default |
| Todos | `shared/geox-viewport-resolver.js` | `buildDefaultViewport` | viewport JSON local | fallback final | prioridad 4 | ahora prioriza `initialViewport.zoom` documentado localmente |
| GeoIPT | `geoipt/js/index.js` | selectores/búsqueda/región | `setView`/`fitBounds` | acción del usuario | fuera de inicialización | no forma parte de carga inicial resuelta |
| GeoEVA | `geoeva/js/index.js` | selectores/región | `setView`/`fitBounds` | acción del usuario | fuera de inicialización | no forma parte de carga inicial resuelta |
| GeoNEMO | `geonemo/js/index.js` | búsqueda/selector/región | `setView`/`fitBounds` | acción del usuario | fuera de inicialización | no forma parte de carga inicial resuelta |
| GeoNOXA | `geonoxa/js/index.js` | búsqueda/selector/región | `setView`/`fitBounds` | acción del usuario | fuera de inicialización | no forma parte de carga inicial resuelta |

## Conflictos encontrados

- El resolvedor compartido no aceptaba explícitamente `crossAccess=1`, aunque el esquema requerido lo define como parámetro común.
- El resolvedor devolvía fuentes internas `memory-preview` y `geoquery-return`; los cuatro sitios tenían que conocer esas excepciones para decidir si debían omitir modal/geolocalización.
- Los JSON locales documentaban escala como `scaleDenominator`, pero no exponían el bloque requerido `initialViewport.referenceScale` con el zoom operativo.
- `buildDefaultViewport` calculaba zoom desde escala antes de respetar el zoom declarado, lo que podía diferir del zoom Leaflet parametrizado por sitio.

## Jerarquía final

1. `cross-access`: URL con `crossAccess=1` o aliases legacy y viewport completo válido.
2. `memory`: retorno GeoQuery por URL/restauración o preview en `sessionStorage` con clave `geox:<site>:viewportPreview`.
3. `gps` y luego `ip`: únicamente si el permiso de geolocalización ya está `granted` y las coordenadas son válidas.
4. `site-default`: `initialViewport` local en `parametros/viewport.json`.

## Viewports por defecto

| Sitio | Centro | Zoom | Escala referencial | Basemap |
| ----- | ------ | ---- | ------------------ | ------- |
| GeoIPT | `-33.4489, -70.6693` | `14.5` | `1:20.000` | `osm` |
| GeoEVA | `-23.6509, -70.3975` | `13.5` | `1:50.000` | `osm` |
| GeoNEMO | `-28.5758, -70.7581` | `13.5` | `1:50.000` | `osm` |
| GeoNOXA | `-30.2303, -71.0858` | `14.25` | `1:25.000` | `osm` |

## Diferencias desktop/mobile

No se agregó lógica diferenciada entre desktop y mobile. La misma prioridad y los mismos parámetros aplican a ambos; solo Leaflet puede mostrar una escala visual distinta por tamaño de mapa, latitud, resolución o densidad de píxeles.
