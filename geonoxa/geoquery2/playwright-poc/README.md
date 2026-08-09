# POC Playwright/Chromium — GeoNOXA GeoQuery2

Experimento A/B aislado que imprime el DOM actual de `geonoxa/geoquery2/geoquery.html` con Chromium. No importa ni modifica el motor `geoquery-pdf`, no usa `html2canvas` y no crea una vista alternativa.

## Arquitectura y aislamiento

- `run-poc.js` inicia un servidor HTTP efímero sobre el repositorio, abre la URL existente con `?pdf=1`, y controla Chromium.
- `pdf-mode.css` es la única capa de impresión del POC y activa una sola clase: `playwright-pdf-mode`.
- La instrumentación de Leaflet se inyecta antes de cargar la página y existe solamente dentro del proceso de prueba. Registra las llamadas reales a `fitBounds`/`setView`; el HTML de producción no carga ningún archivo del POC.
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

Se producen `01_html_normal.png`, `02_playwright_A_before_pdf.png`, `03_playwright_B_before_pdf.png`, `GeoNOXA_Playwright_A.pdf`, `GeoNOXA_Playwright_B.pdf` y `leaflet-ab-states.json`.

Se puede fijar otro reporte reproducible mediante `--query 'queryLat=...&queryLon=...&basemap=osm'` y otro directorio mediante `--output ruta`.

## Contrato de captura

- Viewport: **1440 × 1100 CSS px**; `deviceScaleFactor: 1`.
- PDF: **A4 vertical**, fondos activos; márgenes superior/derecho/inferior/izquierdo de **12/10/14/10 mm**.
- Readiness: `DOMContentLoaded`, fin de red, contenido analizado, fuentes, imágenes, tiles Leaflet y cuatro frames de layout estable. Los 30–60 s son límites de error, no sincronización principal.
- **A:** layout final, dos frames de reflow y una sola llamada `invalidateSize({animate:false})`. Después no se modifica el viewport.
- **B:** repite la misma secuencia y luego reproduce, para cada mapa, su última operación real de encuadre (`fitBounds` o `setView`) con los mismos argumentos que utilizó GeoQuery2. De esta forma no se inventan bounds, centro, zoom ni dimensiones para el experimento.
- Cada variante parte de una navegación limpia. En ambas se registran cuatro estados: HTML normal, layout PDF, después de `invalidateSize` e inmediatamente antes de captura. Cada estado incluye dimensiones del contenedor, centro, zoom, bounds geográficos, pixel bounds y pixel origin.

## Evaluación

Compare el HTML, ambas capturas inmediatamente anteriores al PDF y ambos PDF. `leaflet-ab-states.json` conserva la evidencia numérica y enumera qué operación fue reproducida en B. La variante no intenta corregir visualmente el mapa: no añade offsets ni fija sus dimensiones.
