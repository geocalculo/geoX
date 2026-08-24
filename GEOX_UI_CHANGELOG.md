# GeoX UI v1 · Changelog de mejora

Rama: `improve/geox-ui-v1`
Base: `standard/geox-ui-v1`
Fecha de inicio: 2026-08-24

## Objetivo

Retirar deuda visual y estructural residual sin alterar lógica GIS, cálculos territoriales, KML ni PDF.

## Intervenciones

### 10 · GeoIPT GeoQuery
- [x] Crear migración reproducible para extraer CSS inline.
- [x] Conectar al stack `shared/geoquery/*`.
- [x] Incorporar puente de clases `gq-*` manteniendo clases legacy.
- [x] Confirmar ausencia de `<style>` inline mediante auditoría estática.
- [ ] Validar cálculo, mapa, KML y PDF en navegador antes del cierre de rama.

Resultado estructural: presentación extraída a `geoipt/geoquery/geoquery.css`; lógica analítica permanece sin extracción para evitar cambios funcionales prematuros.

### 11 · GeoIPT Index
- [x] Inventariar reglas duplicadas contra `shared/`.
- [x] Retirar reglas estructurales, controles y responsive ya cubiertos por `shared/`.
- [x] Mantener tema GeoIPT y componentes funcionales propios.
- [x] Reducir `geoipt/css/index.css` a 421 líneas según auditoría automática.
- [ ] Validar visualmente desktop/mobile antes de considerar definitiva la limpieza.

Se conservan localmente: identidad de color, escala Leaflet, resultados de búsqueda, etiquetas territoriales, icono de etiquetas mobile, posición específica del toast, summary mobile e introducción GeoIPT.

### 12 · CSS residual
- [x] Clasificar referencias preliminares mediante auditoría automática.
- [x] Confirmar que `geo-card.css`, `geonoxa.css`, `mapago.css` y `report_html2pdf.css` presentan referencias detectadas.
- [ ] Determinar para cada referencia si es funcional, histórica o sólo documental.
- [ ] No eliminar archivos sin confirmar referencias HTML/JS/PDF y cargas dinámicas.

### 13 · Diccionario UI GeoX
- [ ] Normalizar nomenclatura de acciones y estados.
- [ ] Mantener contenido temático específico por sitio.

### 14 · Anatomía transversal
- [ ] Comparar hero, contenedores, cards, KPI, listas, mapas, tablas y footer.

### 15 · Responsive
- [ ] Revisar 1440 / 1024 / 768 / 430 / 390 px.
- [ ] Resolver reglas generales en `shared/`; excepciones justificadas en local.

### 16 · Regresión funcional
- [ ] Index: carga, región, búsqueda, OSM/SAT, etiquetas, ubicación, GeoQuery y footer.
- [ ] GeoQuery: coordenadas, cálculos, lista, mapa, KPI, gráficos, KML, PDF, volver y mobile.

### 17 · Cierre documental
- [x] Crear este changelog.
- [x] Incorporar auditoría automática de rama de mejora.
- [ ] Actualizar auditoría tras validación visual/funcional final.
- [ ] Declarar excepciones finales y cerrar UI v1.

## Estado estático actual

La auditoría de la rama informa que los cinco sitios cumplen el contrato estructural de carga shared en index y GeoQuery, temas GeoQuery, navegación transversal y ausencia de bloques `<style>` inline en GeoQuery.

## Regla de seguridad

Una mejora visual no puede cambiar un resultado analítico.
