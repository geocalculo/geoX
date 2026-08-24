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

| Archivo | Líneas | Consumidores de ejecución | Clasificación |
|---|---:|---|---|
| `geo-card.css` | 12 | `geoipt/geo-card.html` | Legacy activo |
| `mapago.css` | 207 | `geoipt/mapago.html` | Legacy activo |
| `report_html2pdf.css` | 27 | `geoipt/report_html2pdf.html` | Legacy activo |

> La clasificación considera sólo referencias de ejecución en HTML/CSS/JS. Menciones en documentación, auditorías o herramientas no cuentan como uso funcional.

## Variantes semánticas GeoQuery

| Sitio | Exportar KML | Descargar KML | GeoQuery 2.0 |
|---|---:|---:|---:|
| GeoIPT | 0 | 2 | 0 |
| GeoEVA | 0 | 1 | 0 |
| GeoNEMO | 0 | 2 | 0 |
| GeoNOXA | 0 | 2 | 0 |
| GeoMA | 0 | 1 | 0 |

## Incidencias estáticas

- Sin incumplimientos estructurales detectados por el auditor estático.

## Criterio de cierre

La rama sólo puede cerrarse después de validar desktop/mobile y regresión funcional de GIS, cálculos, KML y PDF.

