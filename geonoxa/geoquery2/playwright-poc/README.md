# POC Playwright/Chromium — GeoNOXA GeoQuery2

Experimento aislado que imprime el DOM actual de `geonoxa/geoquery2/geoquery.html` con Chromium. No importa ni modifica el motor `geoquery-pdf`, no usa `html2canvas` en el camino Playwright y no crea una vista alternativa.

## Arquitectura y aislamiento

- `run-poc.js` inicia un servidor HTTP efímero sobre el repositorio, abre la URL existente con `?pdf=1`, y controla Chromium.
- `pdf-mode.css` es la única capa de impresión del POC y activa una sola clase: `playwright-pdf-mode`.
- La instrumentación de Leaflet se inyecta antes de cargar la página y existe solamente dentro del proceso de prueba. El HTML de producción no carga ningún archivo del POC.
- Los artefactos se escriben en `artifacts/`, ignorado localmente. El exportador actual continúa siendo el botón y código existentes.

## Dependencias y ejecución

Requiere Node.js 20+, Playwright 1.54.2, las bibliotecas remotas que ya consume la vista (Leaflet, Turf y `html2pdf`) y acceso a los tiles OSM/Esri.

```bash
cd geonoxa/geoquery2/playwright-poc
npm install
npm run install:chromium
npm test
npm run run
```

Por defecto se producen `screenshot-html.png`, `pdf-actual.pdf`, `screenshot-playwright-pre-pdf.png`, `pdf-playwright.pdf` y `result.json`. Para probar solamente Chromium:

```bash
npm run run -- --skip-current
```

Se puede fijar otro reporte reproducible mediante `--query 'queryLat=...&queryLon=...&basemap=osm'` y otro directorio mediante `--output ruta`.

## Contrato de captura

- Viewport: **1440 × 1100 CSS px**; `deviceScaleFactor: 1`.
- PDF: **A4 vertical**, fondos activos; márgenes superior/derecho/inferior/izquierdo de **12/10/14/10 mm**.
- Readiness: `DOMContentLoaded`, fin de red, contenido analizado, fuentes, imágenes, tiles Leaflet y cuatro frames de layout estable. Los 30–60 s son límites de error, no sincronización principal.
- Leaflet: primero se aplica el layout final, después dos frames de reflow y una sola llamada `invalidateSize({animate:false})`. No se ejecuta un segundo `fitBounds`/`setView`, por lo que se conserva el encuadre territorial decidido por la vista.

## Evaluación

Compare el HTML, la captura inmediatamente anterior al PDF y ambos PDF. `result.json` registra centro, zoom y tamaño de cada mapa, duración y errores de consola. Revise mapa (centro, zoom, círculo, marcadores y overlays), listas, SVG/gráficos, KPI, fuentes, márgenes, cortes y páginas antes de clasificar el resultado como exitoso, parcial o descartado.
