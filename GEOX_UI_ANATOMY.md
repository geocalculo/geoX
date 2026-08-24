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
10. **Footer**: cuando el GeoQuery ya dispone de footer, su presentación se resuelve desde `shared/` y utiliza el patrón de resultados territoriales referenciales. No se inserta un footer nuevo en páginas que no lo tenían durante una intervención puramente visual, para no alterar capturas PDF ni flujos de reporte.

## Geometría común

El ancho máximo efectivo transversal es 1240 px y proviene del token `--gq-content-max-width`.

GeoEVA y GeoMA ya utilizaban el eje común. GeoIPT y GeoNOXA conservan valores legacy de 1120 px en CSS local, pero `shared/geoquery/geoquery-layouts.css` los neutraliza mediante un adaptador de compatibilidad aplicado al shell analítico y a la barra de acciones. GeoNEMO conserva fórmulas históricas de 1320 px en su CSS local; el shared alinea hero y acciones al eje común de 1240 px sin modificar su microinforme cartográfico.

Estos adaptadores permiten validar la nueva geometría antes de retirar físicamente las reglas legacy en una limpieza posterior. La separación interna, radios, sombras y breakpoints generales deben provenir de `shared/geoquery/*`; el CSS local puede ajustar densidad sólo cuando el fenómeno lo requiere.

## Excepciones justificadas por sitio

### GeoEVA
Referencia oficial. Mantiene lista de proyectos + mapa 50/50 y paneles comparativos propios de evaluación ambiental.

### GeoIPT
Mantiene paneles de metadata normativa y descriptores geométricos propios. La estructura base de hero, acciones, KPI, cards y mapa sigue el contrato shared.

### GeoNEMO
Excepción estructural válida: los resultados se generan como **microinformes cartográficos dinámicos por grupo ambiental**. No se fuerza un único `gq-list-map` estático porque cada grupo construye su propia relación indicador/mapa. El shell, acciones, cards y tabla sí pertenecen al estándar común.

### GeoNOXA
Mantiene subpaneles diferentes para relaves y zonas saturadas, además de reglas específicas de exportación PDF. No se altera el staging de PDF ni la composición interna de esos reportes.

### GeoMA
Mantiene selector 5/10/20, indicadores geométricos y panel comparativo de gráficos. Estos componentes son temáticos; el shell, lista/mapa y KPI siguen el estándar.

## Resultado de la Intervención 14

- Eje de contenido común: 1240 px efectivo.
- GeoIPT/GeoNOXA: shell analítico y acciones alineados desde shared.
- GeoNEMO: hero y acciones alineados al mismo eje sin tocar su microinforme.
- Footer existente: estilo compartido desde `geoquery-components.css`.
- Excepciones temáticas documentadas, no tratadas como desviaciones.
- Sin cambios en lógica GIS, cálculos, KML ni PDF.

## Regla de seguridad

La normalización anatómica no puede cambiar cálculos, consultas GIS, selección de entidades, distancias, geometrías, KML ni PDF. Las pruebas de regresión funcional permanecen como condición de cierre de la rama.
