# GeoX UI v1 · Changelog de mejora

Rama: `improve/geox-ui-v1`
Base: `standard/geox-ui-v1`
Fecha de inicio: 2026-08-24

## Objetivo

Retirar deuda visual y estructural residual sin alterar lógica GIS, cálculos territoriales, KML ni PDF.

## Intervenciones

### 10 · GeoIPT GeoQuery
- [x] Crear migración reproducible para extraer CSS inline.
- [x] Preparar conexión al stack `shared/geoquery/*`.
- [x] Preparar puente de clases `gq-*` manteniendo clases legacy.
- [ ] Confirmar ejecución automática de la migración y ausencia de `<style>` inline.
- [ ] Validar cálculo, mapa, KML y PDF.

### 11 · GeoIPT Index
- [ ] Inventariar reglas duplicadas contra `shared/`.
- [ ] Retirar únicamente reglas con equivalencia comprobada.
- [ ] Mantener tema, normativa urbana y excepciones funcionales.

### 12 · CSS residual
- [ ] Clasificar archivos como Activo / Compartible / Legacy requerido / Huérfano.
- [ ] No eliminar archivos sin confirmar referencias HTML/JS/PDF.

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
- [ ] Actualizar auditoría tras validación.
- [ ] Declarar excepciones finales y cerrar UI v1.

## Regla de seguridad

Una mejora visual no puede cambiar un resultado analítico.
