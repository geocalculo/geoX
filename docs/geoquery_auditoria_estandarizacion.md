# Auditoría comparativa y estandarización GeoQuery GeoX

Fecha: 2026-07-13. Alcance inspeccionado: `geoipt/geoquery/geoquery.html`, `geoeva/geoquery/geoquery.html`, `geonemo/geoquery/geoquery.html`, `geonemo/geoquery/geoquery.js`, `geonoxa/geoquery/geoquery.html`, `geonoxa/geoquery/geoquery.js`, configuraciones `capas_geoquery`, y construcción/retorno GeoQuery en los cuatro `index.html`/`js/index.js`.

## Matriz comparativa inicial

| Dimensión | GeoIPT | GeoEVA | GeoNEMO | GeoNOXA | Estándar esperado | Acción requerida |
|---|---|---|---|---|---|---|
| Parámetros URL | Lee `lat`, `lon`, `site`, `zoom`, `basemap`; no normaliza `viewLat/viewLon`, `mapCenter*` ni BBOX en `geoQueryState`. | Lee `lat`, `lon`, `site`, `zoom`, `basemap`, `viewLat/viewLon`; falta alias `mapCenter*` y BBOX normalizado. | Lee alias principales y BBOX; estado conserva campos legacy. | Lee alias principales y BBOX; estado inicial más compacto. | Contexto `{site, queryPoint, originalViewport, from}` con compatibilidad legacy. | Agregar estructura normalizada sin romper campos previos. |
| Viewport original | Retorno no preserva centro original del index. | Retorno preserva `viewLat/viewLon`, no BBOX. | Preserva centro y BBOX. | Preserva centro y BBOX para análisis, retorno parcial. | Centro, zoom, BBOX, basemap y `from`. | Completar retorno GeoIPT/GeoNOXA y estado común. |
| Estado | Usa textos `Válida`, `preparado`; resultado PRC no queda siempre en estado estándar. | Usa textos de carga y métricas, sin `status` estándar consolidado. | Grupos con `resolved/empty/error`, UI con textos. | Grupos con `resolved/empty/error`, overall puede ser `partial`. | Estados analíticos `loading/resolved/empty/error`; overall puede exponer `partial`. | Incorporar `status` estándar en `geoQueryState`; mantener etiquetas UI. |
| Punto consultado | Se dibuja marcador y panel coordenadas. | Se dibuja marcador y panel coordenadas. | Se dibuja marcador y panel coordenadas. | Se dibuja marcador y panel coordenadas. | Punto siempre inicializado antes del análisis. | Sin cambio mayor. |
| Mapa | Leaflet 1.9.4, OSM/SAT, escala; sin gesto táctil estándar. | Leaflet 1.9.4, OSM/SAT, escala, gesto táctil. | Leaflet 1.9.4, OSM/SAT, escala, gesto táctil. | Leaflet 1.9.4, OSM/SAT, escala; faltaba gesto táctil y toggle local. | OSM/SAT, escala, dos dedos en touch, único encuadre final. | Añadir gesto táctil GeoNOXA y asegurar encuadre final único. |
| Basemap | Hereda `basemap`, retorno actualiza basemap pero no viewport. | Hereda y actualiza retorno. | Hereda y actualiza retorno. | Hereda; no tiene toggle OSM/SAT en JS aunque HTML incluye acciones de descarga. | Heredado y con toggle OSM/SAT. | Mantener herencia; no introducir rediseño amplio. |
| Mobile | No detecta puntero táctil para bloquear pan de un dedo. | Correcto por `matchMedia`/touch points. | Correcto por `matchMedia`/touch points. | Faltaba helper. | Un dedo desplaza página; dos dedos mueven mapa; mensaje estándar. | Añadir helper local en GeoNOXA. |
| Resumen ejecutivo | Se genera por paneles PRC, pero `geoQueryState` no expone `executiveSummary`. | Se genera desde clúster, no siempre persistido normalizado. | Se genera después del análisis. | Se genera después del análisis. | Construir al final desde resultados normalizados. | Persistir resumen final en `geoQueryState`. |
| Renderizado condicional | Panel relacionado muestra mensaje si no hay feature. | Paneles se actualizan desde resultado de clúster. | Empty/error renderizan panel mínimo de grupo; puede mostrar conteos debug en carga. | Empty omite paneles; errores no cambian resultado. | Resolved muestra paneles; empty/error omiten paneles temáticos. | Ocultar metadata/carga técnica salvo debug. |
| Feature relacionada | Zona PRC intersects/nearest. | Proyectos relacionados. | Por grupo SNASPE/Ramsar. | Relaves relacionados y zona relacionada. | Concepto común, contenido específico. | Sin cambio de indicador. |
| Descriptores geométricos | Área/perímetro PRC. | Distancias entre pares. | Área/perímetro grupo. | Relaves pares/radio y zona. | Separados de indicadores desde el punto. | Mantener separación. |
| Indicadores espaciales | Distancia al perímetro/intersects-nearest. | Distancias desde punto. | Distancia mínima al perímetro. | Distancias desde punto/perímetro. | No mezclar estadísticas internas con relación punto-elementos. | Mantener. |
| Metadata | Normativa PRC; debug existente. | Proyectos compactos; logs en consola. | Metadata visible territorial, loadStatus técnico. | Metadata técnica oculta con `GEOQUERY_DEBUG`. | Metadata técnica solo debug. | Ajustar loadStatus GeoNEMO y logs GeoNOXA. |
| PDF | Botones deshabilitados. | Botones según implementación HTML. | Panel descargas oculto/deshabilitado. | Panel descargas condicionado a resultados. | Deshabilitados hasta resultados exportables. | No habilitar export sin implementación segura. |
| KML | Botón deshabilitado. | Botón según implementación HTML. | Panel descargas oculto/deshabilitado. | Panel descargas condicionado a resultados. | Igual PDF. | No exportar universo nacional. |
| Retorno | No incluye `viewLat/viewLon`. | Incluye `viewLat/viewLon`. | Incluye `viewLat/viewLon`. | Incluye `viewLat/viewLon`; no alias `mapZoom`. | Restaurar centro, zoom, basemap, coordenada y `from=geoquery`. | Completar compatibilidad GeoIPT/GeoNOXA. |
| Errores | Catch de análisis PRC no debe invalidar mapa/punto. | Catch carga proyectos escribe panel. | PromiseSettled por grupo. | Safe por grupo, pero logs visibles excesivos. | Separar carga/análisis/render/export; contexto en console.error. | Normalizar errores y eliminar ruido debug. |
| Debug | Estado debug explícito. | Logs de consola. | `GEOQUERY_DEBUG`, pero carga visible siempre. | `GEOQUERY_DEBUG=false`, pero logs de consola abundantes. | Técnica visible solo con debug. | Silenciar loadStatus/logs con debug. |

## Principales inconsistencias detectadas

1. GeoIPT no preservaba el viewport original de retorno aunque el index lo envía para otros sitios.
2. GeoEVA y GeoIPT mantenían estados legacy de UI sin persistir un `geoQueryState.status` estándar.
3. GeoNEMO mostraba metadata de carga por grupo en producción, incluyendo conteos técnicos del viewport.
4. GeoNOXA registraba múltiples `console.log/console.table` aun con `GEOQUERY_DEBUG=false` y carecía de gesto táctil estándar de dos dedos.
5. GeoNOXA y GeoNEMO ya operaban con grupos independientes, pero la estructura global no exponía de forma uniforme `queryContext`, `mapState` y `exportState`.

## Estándar final aplicado

- Estados temáticos: `loading`, `resolved`, `empty`, `error`.
- Estado general expuesto en `geoQueryState.status`; la UI puede mostrar `Resuelto parcialmente` cuando hay resultados y errores.
- Contexto común: `geoQueryState.queryContext = { site, queryPoint, originalViewport, from }`.
- Mapa común: punto consultado, basemap heredado, escala, capas de resultados y encuadre analítico final.
- Renderizado: los grupos `empty` y `error` no generan paneles temáticos completos con `N/D`; la metadata técnica queda tras `GEOQUERY_DEBUG`.

## Singularidades conservadas

- GeoIPT conserva zona PRC con `intersects/nearest`, distancia mínima al perímetro y línea solo para `nearest`.
- GeoEVA conserva clúster de hasta 10 proyectos aprobados, radio por décimo/último aprobado, sector dominante y métricas separadas.
- GeoNEMO conserva grupos independientes SNASPE y Ramsar, leyendo `listado.json`, `grupo_config.json` y `listado_query.json`.
- GeoNOXA conserva relaves (máximo 10, ranking y círculo punteado) y zonas saturadas/latentes como grupo independiente.
