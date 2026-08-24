# GeoX UI v1 · Anatomía transversal GeoQuery

Rama: `improve/geox-ui-v1`
Referencia estructural: GeoEVA

## Objetivo

Definir qué partes de la anatomía GeoQuery deben ser comunes a toda la familia GeoX y qué diferencias permanecen justificadas por la naturaleza del fenómeno analizado.

La regla sigue siendo 80/20: estructura compartida, contenido temático específico.

## Anatomía obligatoria

1. **Hero**: todo GeoQuery usa `gq-hero` y conserva identidad de color mediante su archivo de tema.
2. **Ancho de contenido**: la referencia común es `--gq-content-max-width` de `shared/geoquery/geoquery-tokens.css` (1240 px por defecto).
3. **Acciones**: navegación y exportación usan `gq-actions` + `gq-button`.
4. **Cards/paneles**: las unidades visuales principales usan `gq-card`.
5. **KPI**: cuando existe una grilla de indicadores, se usan `gq-kpi-grid` y `gq-kpi`.
6. **Lista + mapa**: cuando existe una relación estática de dos paneles, se usa `gq-list-map` con proporción 50/50 o 40/60.
7. **Mapa**: los paneles cartográficos estáticos usan `gq-map-panel` cuando corresponde.
8. **Gráficos**: los bloques analíticos con gráficos usan `gq-chart-panel` y los patrones compartidos disponibles.
9. **Tablas**: las tablas de reporte usan `gq-table`; en mobile el contenedor permite scroll horizontal controlado.
10. **Footer**: todo GeoQuery termina con `gq-footer` y el texto `GeoQuery · [Sitio] · Resultados territoriales referenciales`.

## Geometría común

El ancho máximo transversal es 1240 px y debe provenir del token `--gq-content-max-width`; no se deben mantener anchos paralelos 1120/1320 px en los shells principales.

La separación interna, radios, sombras y breakpoints generales deben provenir de `shared/geoquery/*`. El CSS local puede ajustar densidad de información sólo cuando el fenómeno lo requiere.

## Excepciones justificadas por sitio

### GeoEVA
Referencia oficial. Mantiene lista de proyectos + mapa 50/50 y paneles comparativos propios de evaluación ambiental.

### GeoIPT
Mantiene paneles de metadata normativa y descriptores geométricos propios. La estructura base de hero, acciones, KPI, cards y mapa sigue el contrato shared.

### GeoNEMO
Excepción estructural válida: los resultados se generan como **microinformes cartográficos dinámicos por grupo ambiental**. No se fuerza un único `gq-list-map` estático porque cada grupo construye su propia relación indicador/mapa. El shell, acciones, cards, tabla y footer sí pertenecen al estándar común.

### GeoNOXA
Mantiene subpaneles diferentes para relaves y zonas saturadas, además de reglas específicas de exportación PDF. No se altera el staging de PDF ni la composición interna de esos reportes.

### GeoMA
Mantiene selector 5/10/20, indicadores geométricos y panel comparativo de gráficos. Estos componentes son temáticos; el shell, lista/mapa, KPI y footer siguen el estándar.

## Regla de seguridad

La normalización anatómica no puede cambiar cálculos, consultas GIS, selección de entidades, distancias, geometrías, KML ni PDF. Las pruebas de regresión funcional permanecen como condición de cierre de la rama.
