# Auditoría retorno GeoQuery: restauración exacta del viewport del index

## Resumen ejecutivo

Se auditó el flujo index → GeoQuery → retorno en GeoIPT, GeoEVA, GeoNEMO y GeoNOXA. La causa común era que GeoQuery recibía parte del contexto del mapa, pero la entrada histórica del index no quedaba sincronizada con ese estado antes de navegar. Al volver con Atrás, el navegador podía entregar una página desde BFCache o reconstruir el index desde una URL que no siempre contenía centro, zoom, basemap, punto y BBOX completos; además, la inicialización podía aplicar ubicación inicial o vistas por defecto.

La corrección estándar captura el viewport exacto antes de abrir GeoQuery, lo persiste en URL del index mediante `history.replaceState`, en `history.state.geoQueryOrigin` y en `sessionStorage` por sitio. En la carga del index, `pageshow` BFCache y `popstate`, se restaura primero desde URL, luego `history.state`, luego `sessionStorage`.

## Matriz de auditoría y corrección

| Elemento             | GeoIPT | GeoEVA | GeoNEMO | GeoNOXA | Corrección |
| -------------------- | ------ | ------ | ------- | ------- | ---------- |
| Centro guardado      | Parcial: GeoQuery recibía zoom pero no entrada histórica robusta del index. | Se enviaba `viewLat/viewLon`, no se sincronizaba la entrada del index. | Se enviaba `viewLat/viewLon`, no se sincronizaba la entrada del index. | Se enviaba `viewLat/viewLon`, no se sincronizaba la entrada del index. | `mapCenterLat/mapCenterLon` y aliases `viewLat/viewLon` en URL, estado e index. |
| Zoom guardado        | Se enviaba `zoom`; retorno dependía de URL limpia o BFCache. | Se enviaba `zoom`; retorno podía ser sobrescrito por inicialización. | Se enviaba `zoom`; retorno podía ser sobrescrito por inicialización. | Se enviaba `zoom`; retorno podía ser sobrescrito por inicialización. | `mapZoom` y `zoom`, validado y restaurado con igualdad exacta. |
| Basemap guardado     | Se enviaba a GeoQuery pero no siempre quedaba en el index de retorno. | Igual. | Igual. | Igual. | `basemap=osm|sat`, normalización y `switchBaseMap` antes de `setView`. |
| Punto consultado     | Se guardaba como `lat/lon`. | Se guardaba como `lat/lon`. | Se guardaba como `lat/lon`. | Se guardaba como `lat/lon`. | `queryLat/queryLon` más compatibilidad `lat/lon`; se restaura `selectedPoint`. |
| BBOX guardado        | No estaba en URL de GeoQuery desde index. | No estaba en la URL construida en index. | Sí se enviaba a GeoQuery, no al index histórico. | Sí se enviaba a GeoQuery, no al index histórico. | `viewWest/viewSouth/viewEast/viewNorth` en GeoQuery URL, index URL, history y storage. |
| history.state        | No guardaba `geoQueryOrigin`. | No guardaba `geoQueryOrigin`. | No guardaba `geoQueryOrigin`. | No guardaba `geoQueryOrigin`. | `history.replaceState({ geoQueryOrigin })` antes de navegar. |
| URL index            | No quedaba enriquecida antes de salir. | No quedaba enriquecida antes de salir. | No quedaba enriquecida antes de salir. | No quedaba enriquecida antes de salir. | URL actual del index contiene viewport y `restoreViewport=1`. |
| sessionStorage       | No existía respaldo por sitio. | No existía respaldo por sitio. | No existía respaldo por sitio. | No existía respaldo por sitio. | Claves `geox:<site>:geoquery-origin`. |
| pageshow BFCache     | Sin revalidación específica. | Sin revalidación específica. | Sin revalidación específica. | Sin revalidación específica. | `pageshow.persisted` re-aplica viewport e invalida tamaño. |
| popstate             | Sin restauración del estado GeoQuery. | Sin restauración del estado GeoQuery. | Sin restauración del estado GeoQuery. | Sin restauración del estado GeoQuery. | Listener lee `event.state.geoQueryOrigin` o fuentes estándar. |
| sobrescritura tardía | `initGeoXInitialLocation` podía aplicar otra vista. | `initGeoXInitialLocation` podía aplicar otra vista. | `initGeoXInitialLocation` podía aplicar otra vista. | `initGeoXInitialLocation` podía aplicar otra vista. | Si hay estado de restauración se omite ubicación inicial automática y se marca `viewportRestoreApplied`. |
| botón Volver         | GeoQuery inline ahora prefiere `history.back()` y conserva fallback URL completa. | GeoQuery inline ahora prefiere `history.back()` y conserva fallback URL completa. | Construía URL parcial. | Construía URL parcial. | GeoNEMO/GeoNOXA prefieren `history.back()` con fallback URL completa. |
| Atrás navegador      | Podía volver a default/fallback según BFCache o recarga. | Podía volver a default/fallback según BFCache o recarga. | Podía volver a default/fallback según BFCache o recarga. | Podía volver a default/fallback según BFCache o recarga. | Atrás regresa a entrada del index ya reemplazada con viewport exacto. |
| mobile               | Dependía del mismo flujo histórico. | Dependía del mismo flujo histórico. | Dependía del mismo flujo histórico. | Dependía del mismo flujo histórico. | El gesto Atrás usa la misma entrada histórica, `pageshow` y `popstate`. |

## Causas encontradas por sitio

- **GeoIPT:** la navegación a GeoQuery solo enviaba `lat/lon/zoom/basemap/from` y no guardaba BBOX ni centro explícito en la entrada actual del index. Al recargar o no usar BFCache se podía volver a la vista inicial o a una vista automática.
- **GeoEVA:** el index enviaba centro en `viewLat/viewLon`, pero no actualizaba la URL ni `history.state` del propio index; `initGeoXInitialLocation` podía imponerse durante reconstrucción.
- **GeoNEMO:** el index enviaba BBOX a GeoQuery, pero el retorno dependía de enlaces y de inicialización; el botón volver de GeoQuery reconstruía una URL parcial sin todos los aliases.
- **GeoNOXA:** igual que GeoNEMO: se enviaba BBOX a GeoQuery, pero no quedaba persistido en la entrada histórica del index y el botón volver no llevaba todos los parámetros estándar.

## Estructura estándar usada

```javascript
{
  version: 1,
  site: "geoipt|geoeva|geonemo|geonoxa",
  source: "geoquery",
  savedAt: Number,
  queryPoint: { lat: Number, lon: Number },
  map: {
    centerLat: Number,
    centerLon: Number,
    zoom: Number,
    basemap: "osm|sat",
    bounds: { west: Number, south: Number, east: Number, north: Number }
  },
  navigation: { from: "index|crossaccess", crossAccess: Boolean }
}
```

## Parámetros incorporados al index

`mapCenterLat`, `mapCenterLon`, `mapZoom`, `basemap`, `queryLat`, `queryLon`, `viewWest`, `viewSouth`, `viewEast`, `viewNorth`, `restoreViewport`, `from`. Se mantiene compatibilidad con `viewLat`, `viewLon`, `zoom`, `lat` y `lon`.

## Claves de sessionStorage

- `geox:geoipt:geoquery-origin`
- `geox:geoeva:geoquery-origin`
- `geox:geonemo:geoquery-origin`
- `geox:geonoxa:geoquery-origin`

## Validación técnica

Se implementó validación de latitud, longitud, zoom, BBOX y antigüedad máxima de 12 horas. La restauración usa `map.setView([centerLat, centerLon], zoom, { animate: false })`; los bounds no se usan para recalcular el centro si ya hay centro y zoom exactos.

## Pruebas realizadas

En esta ejecución no se dispuso de un navegador interactivo para validar visualmente OSM/SAT, BFCache real, gesto móvil ni diferencias numéricas en Leaflet. Se ejecutaron validaciones estáticas con `node --check` sobre los JavaScript modificados. Las pruebas manuales obligatorias deben confirmar que la diferencia de centro es menor o igual a `1e-7`, el zoom es exactamente igual y el basemap coincide.
