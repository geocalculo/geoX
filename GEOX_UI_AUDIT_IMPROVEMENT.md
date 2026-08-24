# GeoX UI · Auditoría automática de rama de mejora

Generado por `tools/audit_geox_ui.py`. Este informe es estático: no reemplaza la validación visual ni funcional.

## Contrato transversal

| Sitio | Index shared | Footer | GeoQuery shared | Tema | Sin style inline | Clases gq (de 4) | Líneas index.css |
|---|---|---|---|---|---|---:|---:|
| GeoIPT | Sí | Sí | Sí | Sí | Sí | 4 | 421 |
| GeoEVA | Sí | Sí | Sí | Sí | Sí | 4 | 846 |
| GeoNEMO | Sí | Sí | Sí | Sí | Sí | 4 | 714 |
| GeoNOXA | Sí | Sí | Sí | Sí | Sí | 4 | 852 |
| GeoMA | Sí | Sí | Sí | Sí | Sí | 4 | 10 |

## CSS legacy GeoIPT

| Archivo | Líneas | Referencias detectadas | Clasificación preliminar |
|---|---:|---:|---|
| `geo-card.css` | 12 | 2 | Referenciado |
| `geonoxa.css` | 184 | 1 | Referenciado |
| `mapago.css` | 207 | 3 | Referenciado |
| `report_html2pdf.css` | 27 | 2 | Referenciado |

> Un archivo marcado como huérfano candidato no se elimina automáticamente. Debe revisarse también su relación con PDF, cargas dinámicas y rutas históricas.

## Variantes semánticas GeoQuery

| Sitio | Exportar KML | Descargar KML | GeoQuery 2.0 |
|---|---:|---:|---:|
| GeoIPT | 0 | 2 | 0 |
| GeoEVA | 0 | 1 | 2 |
| GeoNEMO | 2 | 0 | 2 |
| GeoNOXA | 0 | 2 | 0 |
| GeoMA | 0 | 1 | 0 |

## Incidencias estáticas

- Sin incumplimientos estructurales detectados por el auditor estático.

## Criterio de cierre

La rama sólo puede cerrarse después de validar desktop/mobile y regresión funcional de GIS, cálculos, KML y PDF.

