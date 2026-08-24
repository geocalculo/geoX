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
- [x] Corregir auditoría para distinguir referencias de ejecución de menciones documentales.
- [x] Clasificar `geo-card.css` como **Legacy activo**, consumido por `geoipt/geo-card.html`.
- [x] Clasificar `mapago.css` como **Legacy activo**, consumido por `geoipt/mapago.html`.
- [x] Clasificar `report_html2pdf.css` como **Legacy activo / PDF**, consumido por `geoipt/report_html2pdf.html`.
- [x] Clasificar `geonoxa.css` como **Huérfano**: sin consumidor HTML/CSS/JS dentro de GeoIPT.
- [x] Eliminar `geoipt/css/geonoxa.css` de la rama de mejora.

Resultado: no quedan CSS residuales sin clasificación en `geoipt/css`. Los tres archivos legacy conservados pertenecen a páginas independientes que quedan fuera de la limpieza del `index` hasta una intervención específica de esos módulos.

### 13 · Diccionario UI GeoX
- [x] Crear `GEOX_UI_DICTIONARY.md` como contrato de copy visible.
- [x] Normalizar título del documento como `GeoQuery | [Sitio]`.
- [x] Normalizar acción KML como `Descargar KML`.
- [x] Normalizar acción de retorno como `Volver a [Sitio]`.
- [x] Retirar `GeoQuery 2.0` como denominación visible del producto.
- [x] Mantener nombres técnicos históricos (`geoquery2.css/js`) sin renombrar.
- [x] Incorporar estas reglas a `tools/audit_geox_ui.py`.
- [x] Confirmar cumplimiento semántico de GeoIPT, GeoEVA, GeoNEMO, GeoNOXA y GeoMA.

Resultado: los cinco GeoQuery comparten vocabulario de producto y acciones sin perder títulos, análisis ni contenidos propios de cada sitio.

### 14 · Anatomía transversal
- [x] Crear `GEOX_UI_ANATOMY.md` y definir anatomía obligatoria versus componentes temáticos.
- [x] Confirmar `gq-hero`, `gq-actions`, `gq-button` y `gq-card` en los cinco GeoQuery.
- [x] Fijar ancho efectivo común en 1240 px mediante `--gq-content-max-width`.
- [x] Alinear GeoIPT y GeoNOXA al eje común mediante adaptador shared de shell/acciones.
- [x] Alinear hero y acciones de GeoNEMO al mismo eje sin modificar sus microinformes dinámicos.
- [x] Mantener GeoNEMO como excepción válida al patrón estático `lista + mapa`.
- [x] Normalizar desde shared la presentación de footers existentes sin insertar nuevos footers en reportes que no los tenían.
- [x] Incorporar auditoría anatómica a `tools/audit_geox_ui.py`.
- [x] Confirmar cumplimiento anatómico de GeoIPT, GeoEVA, GeoNEMO, GeoNOXA y GeoMA.

Resultado: los cinco GeoQuery comparten eje, shell y lenguaje de componentes, mientras mapas, gráficos, tablas y microinformes permanecen específicos del fenómeno. No se modificó lógica GIS, KML ni PDF.

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

La auditoría de la rama informa que los cinco sitios cumplen el contrato estructural de carga shared en index y GeoQuery, temas GeoQuery, navegación transversal, ausencia de bloques `<style>` inline, diccionario UI común y anatomía transversal GeoQuery.

## Regla de seguridad

Una mejora visual no puede cambiar un resultado analítico.
