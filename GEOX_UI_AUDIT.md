# GeoX UI v1 · Auditoría transversal

Fecha: 2026-08-21
Rama de trabajo: `standard/geox-ui-v1`

## Alcance

Auditoría visual y estructural de GeoIPT, GeoEVA, GeoNEMO, GeoNOXA y GeoMA, incluyendo `index` y GeoQuery.

La regla de arquitectura es 80/20:

- 80% estructura, tipografía, controles, responsive y componentes compartidos.
- 20% tema, color y visualizaciones específicas de cada subsitio.

## Matriz de estado

| Sitio | Index shared | Navegación común | Responsive index | GeoQuery shared | Tema GeoQuery | Estado |
|---|---|---|---|---|---|---|
| GeoIPT | Sí | Sí | Sí | Sí, puente seguro | `geoipt-theme.css` | Normalizado con deuda monolítica |
| GeoEVA | Sí | Sí | Sí | Sí, referencia | `geoeva-theme.css` | Referencia oficial |
| GeoNEMO | Sí | Sí | Sí | Sí | `geonemo-theme.css` | Normalizado |
| GeoNOXA | Sí | Sí | Sí | Sí | `geonoxa-theme.css` | Normalizado |
| GeoMA | Sí | Sí | Sí | Sí | `geoma-theme.css` | Normalizado |

## Index

Todos los subsitios comparten:

1. `shared/geox-tokens.css`
2. `shared/geox-index-base.css`
3. `shared/geox-map-controls.css`
4. CSS local del sitio
5. `shared/geox-label-controls.css`

`geox-label-controls.css` importa `geox-index-responsive.css`, que constituye la autoridad responsive final.

### Responsive común

En <= 768 px se normalizan:

- header compacto;
- KPI en grilla adaptable;
- barra de controles horizontal y táctil;
- panel territorial oculto;
- buscador a ancho disponible;
- controles OSM/SAT, ubicación y etiquetas con posiciones comunes;
- mapa ocupando el espacio vertical restante;
- footer de acceso cruzado adaptable y compatible con safe areas.

## GeoQuery

Stack oficial:

1. `shared/geoquery/geoquery-tokens.css`
2. `shared/geoquery/geoquery-base.css`
3. `shared/geoquery/geoquery-components.css`
4. `shared/geoquery/geoquery-layouts.css`
5. `shared/geoquery/geoquery-responsive.css`
6. tema del sitio
7. CSS local específico cuando corresponda

GeoEVA es la referencia estructural oficial.

El responsive GeoQuery protege:

- layouts lista/mapa;
- KPI y estadísticas;
- paneles comparativos;
- acciones y botones;
- pasos de carga;
- tablas anchas mediante scroll horizontal;
- reducción de movimiento por accesibilidad.

## Limpieza realizada

- Eliminados bloques CSS inline de los index GeoEVA, GeoNEMO y GeoNOXA.
- GeoNOXA GeoQuery dejó de contener más de mil líneas de CSS inline.
- Separados temas GeoQuery por sitio.
- `geox-label-controls.css` dejó de duplicar reglas generales responsive.
- La lógica responsive de index queda centralizada en `geox-index-responsive.css`.
- Navegación cruzada de cinco sitios unificada y sitio activo marcado con `aria-current="page"`.

## Deuda residual conocida

### GeoIPT GeoQuery

Sigue siendo el principal bloque monolítico: CSS y lógica analítica viven dentro de `geoquery.html`.

La migración actual usa un puente seguro que carga el sistema shared y aplica clases `gq-*` sin reescribir el motor analítico. La extracción física de CSS/JS debe hacerse en una intervención dedicada con pruebas funcionales y PDF.

### CSS locales de index

GeoIPT, GeoEVA, GeoNEMO y GeoNOXA conservan reglas históricas repetidas. Ya no son la autoridad responsive porque el shared final las sobreescribe. Se recomienda eliminarlas gradualmente sólo después de una validación visual comparativa desktop/mobile.

### PDF

Los motores PDF permanecen fuera de esta normalización salvo las capas visuales ya existentes. No deben mezclarse con la limpieza CSS general sin pruebas específicas de paginación, mapa y gráficos.

## Criterio para nuevas páginas

Una nueva página GeoX no debe copiar bloques globales de CSS. Debe consumir primero el sistema shared y agregar únicamente:

- variables de tema;
- estilos propios del fenómeno;
- visualizaciones específicas;
- excepciones justificadas y documentadas.

## Resultado

La familia GeoX tiene ahora un núcleo visual común para index y GeoQuery, navegación transversal uniforme y una capa responsive centralizada. La deuda restante es principalmente histórica y puede retirarse por etapas sin bloquear el estándar UI v1.
