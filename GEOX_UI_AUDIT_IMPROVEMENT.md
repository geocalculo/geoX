# GeoX UI · Auditoría de rama de mejora

Fecha: 2026-08-24
Rama: `improve/geox-ui-v1`
Base: `standard/geox-ui-v1`

## Resultado ejecutivo

La rama de mejora parte correctamente desde el estándar UI v1 y mantiene `main` sin intervención. La primera deuda arquitectónica prioritaria, GeoIPT GeoQuery, ya fue migrada físicamente en su capa de presentación: el CSS inline fue extraído a `geoipt/geoquery/geoquery.css`, el HTML carga el stack `shared/geoquery/*`, mantiene `geoipt-theme.css` y agrega clases `gq-*` como puente compatible con las clases legacy.

La lógica analítica de GeoIPT continúa dentro de `geoquery.html`. Esto es intencional: la intervención actual separa presentación sin alterar GIS, consultas, cálculos, KML ni PDF.

## Estado por sitio

| Sitio | Index shared | Footer transversal | GeoQuery shared | Tema GeoQuery | CSS inline GeoQuery | Estado |
|---|---|---|---|---|---|---|
| GeoIPT | Sí | Sí | Sí | `geoipt-theme.css` | No | Migración visual completada; JS monolítico pendiente de intervención específica |
| GeoEVA | Sí | Sí | Sí | `geoeva-theme.css` | No | Referencia estructural |
| GeoNEMO | Sí | Sí | Sí | `geonemo-theme.css` | No | Normalizado |
| GeoNOXA | Sí | Sí | Sí | `geonoxa-theme.css` | No | Normalizado |
| GeoMA | Sí | Sí | Sí | `geoma-theme.css` | No | Normalizado |

## Intervención 10 · GeoIPT GeoQuery

Completado en esta rama:

- extracción íntegra del bloque `<style>` a `geoipt/geoquery/geoquery.css`;
- carga de `geoquery-tokens.css`;
- carga de `geoquery-base.css`;
- carga de `geoquery-components.css`;
- carga de `geoquery-layouts.css`;
- carga de `geoquery-responsive.css`;
- carga posterior de `geoipt-theme.css` y `geoquery.css`;
- incorporación progresiva de `gq-hero`, `gq-actions`, `gq-button`, `gq-container`, `gq-kpi-grid`, `gq-kpi`, `gq-list-map`, `gq-card` y `gq-map-panel`;
- conservación de clases legacy para no modificar el motor visual existente de golpe.

La comparación con la rama base muestra una reducción de 725 líneas en `geoquery.html` y la creación de un CSS externo de aproximadamente 700 líneas.

## Intervención 11 · GeoIPT Index

`geoipt/css/index.css` continúa siendo el CSS local más grande y conserva reglas históricas que se superponen al sistema shared. No se eliminan todavía porque la limpieza debe hacerse después de comparación visual desktop/mobile.

Criterio aplicado: una regla sólo se retira cuando existe equivalencia comprobada en `shared/` y no participa en un comportamiento específico de GeoIPT.

## Intervención 12 · CSS residual GeoIPT

Archivos que requieren clasificación final:

| Archivo | Estado preliminar |
|---|---|
| `geo-card.css` | candidato legacy / revisar referencias |
| `geonoxa.css` | candidato huérfano por nombre y ausencia de referencias detectadas |
| `mapago.css` | candidato legacy / revisar cargas históricas |
| `report_html2pdf.css` | no eliminar sin revisar motor PDF |

Las búsquedas de referencias por nombre no detectaron usos directos de estos archivos. Esto no autoriza todavía su eliminación: pueden existir cargas dinámicas o dependencias históricas.

## Intervención 13 · Diccionario UI

Quedan variantes semánticas entre sitios, principalmente:

- `Exportar KML` / `Descargar KML`;
- `GeoQuery 2.0` / `GeoQuery`;
- `Volver` / `Volver a <sitio>`.

La normalización textual debe ejecutarse después de comprobar que botones y títulos no son usados como selectores o referencias por scripts/PDF.

## Intervenciones 14–16 · Validación pendiente

Antes de retirar CSS legacy se requiere validación comparativa de:

- 1440 px;
- 1024 px;
- 768 px;
- 430 px;
- 390 px;
- carga de index;
- selector de región;
- búsqueda;
- OSM/SAT;
- etiquetas;
- ubicación;
- recepción de coordenadas en GeoQuery;
- cálculos;
- mapas y listas;
- KPI y gráficos;
- KML;
- PDF;
- navegación de regreso y footer transversal.

## Regla de cierre

**Una mejora visual no puede cambiar un resultado analítico.**

La rama no debe fusionarse a la rama de estandarización ni a `main` hasta completar la validación visual y funcional de los cinco sitios.
