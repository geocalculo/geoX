# GeoX UI Standard v1

Fecha de formalización: 2026-08-21
Rama de implementación: `standard/geox-ui-v1`

## 1. Propósito

Este documento define el estándar visual y estructural obligatorio para la familia GeoX:

- GeoIPT
- GeoEVA
- GeoNEMO
- GeoNOXA
- GeoMA

El objetivo es mantener una experiencia reconocible y consistente sin eliminar la identidad temática de cada geositio.

La regla central es **80/20**:

- **80% compartido**: estructura, tipografía, espaciado, controles, tarjetas, paneles, navegación, responsive y anatomía GeoQuery.
- **20% específico**: color, semántica temática, símbolos, visualizaciones, tablas analíticas y componentes propios del fenómeno.

---

## 2. Principios obligatorios

1. **Shared primero.** Ningún nuevo subsitio debe copiar bloques globales de CSS ya resueltos en `shared/`.
2. **Tema después.** La identidad del sitio se expresa mediante variables y CSS local cargado después del shared.
3. **Lógica separada de presentación.** No modificar GIS, cálculos, filtros, consultas, KML o PDF durante una intervención puramente visual.
4. **Compatibilidad progresiva.** Durante migraciones pueden coexistir clases legacy y clases estándar.
5. **Responsive centralizado.** Las reglas mobile generales viven en shared; las excepciones locales deben ser mínimas y justificadas.
6. **GeoEVA es referencia estructural GeoQuery.** Se replica su anatomía, no su contenido temático.
7. **Accesibilidad básica obligatoria.** Mantener `aria-label`, `aria-current`, estados `aria-pressed`, foco visible y `prefers-reduced-motion` cuando corresponda.

---

## 3. Estándar de `index`

### 3.1 Orden de carga CSS

Todo `index.html` GeoX debe cargar, en este orden:

```html
<link rel="stylesheet" href="../shared/geox-tokens.css">
<link rel="stylesheet" href="../shared/geox-index-base.css">
<link rel="stylesheet" href="../shared/geox-map-controls.css">
<link rel="stylesheet" href="css/index.css">
<link rel="stylesheet" href="../shared/geox-label-controls.css">
```

`geox-label-controls.css` importa `geox-index-responsive.css`, que constituye la autoridad responsive final del `index`.

### 3.2 Anatomía común

Los `index` deben utilizar, cuando corresponda:

- `#app`
- `#main-header`
- `.brand-block`
- `#site-title`
- `#site-subtitle`
- `#site-description`
- `#summary-bar`
- `.summary-item`
- `.summary-value`
- `.summary-label`
- `#control-bar`
- `#main-layout`
- `#territorial-panel`
- `.panel-section`
- `#map-container`
- `#map`
- `#search-box-wrapper`
- `#search-box`
- `.map-toggle`
- `.map-toggle-btn`
- `#btn-my-location`
- `.mobile-layer-toggle`
- `#main-footer`

Las clases adicionales del sitio pueden coexistir, pero no deben reemplazar innecesariamente esta anatomía.

### 3.3 Navegación transversal

El footer debe mostrar siempre los cinco subsitios en este orden:

**GeoIPT · GeoEVA · GeoNEMO · GeoNOXA · GeoMA**

El sitio activo debe marcarse con:

```html
aria-current="page"
```

El acceso superior `GeoX` debe llevar al portal raíz.

---

## 4. Tokens y dimensiones base

Los valores comunes deben provenir de `shared/geox-tokens.css`.

Referencias principales:

- fuente: Arial / Helvetica / sans-serif;
- título de sitio: 26 px desktop;
- subtítulo: 14 px;
- descripción: 13 px;
- valor KPI: 20 px;
- etiqueta KPI: 11 px;
- control estándar: 14 px;
- texto pequeño: 12 px;
- header mínimo: 86 px;
- barra de control mínima: 52 px;
- panel territorial de referencia: 320 px;
- footer desktop: 28 px;
- radios comunes: control 8 px, card 10 px, panel 20 px, pill 999 px.

Un sitio puede alterar color y semántica, pero no debe crear una escala tipográfica paralela sin una razón funcional.

---

## 5. Responsive `index`

Breakpoint principal: **768 px**.

La autoridad responsive es `shared/geox-index-responsive.css`.

En mobile se normalizan:

- header compacto;
- KPI en grilla adaptable;
- barra superior con controles táctiles;
- panel territorial desktop oculto;
- buscador ocupando el ancho disponible;
- zoom Leaflet reducido cuando corresponde;
- ubicación y control de etiquetas en posiciones comunes;
- OSM/SAT en posición común;
- mapa ocupando el espacio vertical restante;
- footer transversal visible y compatible con `safe-area-inset`;
- prevención de overflow horizontal.

Las reglas locales mobile no deben contradecir este comportamiento. Si existe una excepción, debe documentarse en el CSS del sitio.

---

## 6. Panel territorial y etiquetas

`shared/geox-label-controls.css` es responsable de:

- geometría del panel territorial;
- tipografía de controles de etiquetas;
- checkboxes/toggles;
- etiquetas cartográficas comunes;
- botón mobile de etiquetas.

El CSS local sólo debe definir:

- color semántico;
- símbolo específico;
- comportamiento visual que dependa del fenómeno.

No duplicar reglas generales de panel o responsive.

---

## 7. Estándar GeoQuery

### 7.1 Orden de carga CSS

Todo GeoQuery migrado debe cargar:

```html
<link rel="stylesheet" href="../../shared/geoquery/geoquery-tokens.css">
<link rel="stylesheet" href="../../shared/geoquery/geoquery-base.css">
<link rel="stylesheet" href="../../shared/geoquery/geoquery-components.css">
<link rel="stylesheet" href="../../shared/geoquery/geoquery-layouts.css">
<link rel="stylesheet" href="../../shared/geoquery/geoquery-responsive.css">
<link rel="stylesheet" href="<sitio>-theme.css">
<link rel="stylesheet" href="geoquery.css">
```

Las rutas pueden variar según la ubicación del archivo, pero el orden conceptual no cambia.

### 7.2 Contrato de clases `gq-*`

Las clases estándar constituyen la API visual estable de GeoQuery:

- `gq-hero`
- `gq-container`
- `gq-kicker`
- `gq-card`
- `gq-actions`
- `gq-button`
- `gq-query-summary`
- `gq-executive-summary`
- `gq-kpi-grid`
- `gq-kpi`
- `gq-list-map`
- `gq-list-map--50-50`
- `gq-list-map--40-60`
- `gq-map-panel`
- `gq-chart-panel`
- `gq-chart-legend`
- `gq-comparison-grid`
- `gq-comparison-column`
- `gq-stats-grid`
- `gq-status-view`
- `gq-spinner`
- `gq-loading-steps`
- `gq-table`

Durante una migración, estas clases pueden añadirse en paralelo a las clases legacy.

### 7.3 Referencia oficial

`geoeva/geoquery/geoquery.html` es la implementación de referencia de GeoQuery UI v1.

GeoEVA define la anatomía visual, no la lógica temática.

---

## 8. Tema de cada GeoQuery

Cada sitio debe disponer de un archivo de tema:

- `geoeva-theme.css`
- `geoma-theme.css`
- `geonoxa-theme.css`
- `geonemo-theme.css`
- `geoipt-theme.css`

El tema debe contener principalmente:

- colores primarios y secundarios;
- acentos;
- estados semánticos;
- ajustes de identidad del hero/header;
- variables propias del sitio.

No debe duplicar layouts, resets o responsive generales.

---

## 9. Responsive GeoQuery

La autoridad común es `shared/geoquery/geoquery-responsive.css`.

Debe resolver de manera compartida:

- lista/mapa a una columna en pantallas estrechas;
- KPI y estadísticas adaptables;
- comparaciones verticales;
- acciones y botones sin desborde;
- pasos de carga;
- tablas con scroll horizontal controlado;
- reducción de movimiento cuando el usuario lo solicita.

Las visualizaciones específicas —por ejemplo mapas, gráficos o microinformes— pueden incorporar media queries locales únicamente cuando el componente lo requiera.

---

## 10. Qué pertenece al shared y qué pertenece al sitio

### Shared

- reset;
- tipografía general;
- escalas de espaciado;
- cards;
- botones;
- KPI;
- layouts principales;
- panel territorial;
- controles de mapa comunes;
- footer/navegación;
- responsive;
- anatomía GeoQuery.

### Sitio

- paleta temática;
- marcadores y simbología;
- etiquetas propias del fenómeno;
- gráficos específicos;
- tablas analíticas específicas;
- indicadores propios;
- comportamiento visual ligado a una lógica temática.

---

## 11. Regla de intervención segura

Una intervención de normalización UI debe cumplir:

1. trabajar en rama dedicada;
2. inspeccionar HTML y CSS actual antes de editar;
3. conectar shared antes de eliminar duplicaciones;
4. mantener CSS local cargado después del shared;
5. no modificar JS/GIS salvo que sea imprescindible para añadir clases visuales;
6. no alterar cálculo, selección espacial, fuentes, KML ni PDF;
7. comparar rama contra `main` al terminar;
8. validar desktop y mobile antes de eliminar reglas legacy;
9. no hacer merge a producción sin revisión explícita.

---

## 12. Checklist para un nuevo geositio

Antes de publicar un nuevo subsitio GeoX:

- [ ] usa el stack shared de `index`;
- [ ] conserva la anatomía común de header/KPI/control/map/footer;
- [ ] define sólo variables/tema local;
- [ ] incluye navegación a los cinco sitios vigentes;
- [ ] marca el sitio activo con `aria-current`;
- [ ] prueba <= 768 px;
- [ ] no agrega un segundo sistema responsive;
- [ ] usa `shared/geox-label-controls.css` para etiquetas;
- [ ] si posee GeoQuery, carga `shared/geoquery/*`;
- [ ] adopta clases `gq-*`;
- [ ] separa tema GeoQuery del CSS analítico;
- [ ] mantiene JS/GIS separado de presentación siempre que sea posible.

---

## 13. Checklist de revisión visual

Validar como mínimo:

### Desktop

- título/subtítulo/descripción alineados;
- KPI legibles y homogéneos;
- controles sin saltos;
- panel territorial consistente;
- buscador sin solapamientos;
- mapa ocupa correctamente el espacio;
- footer visible y navegable.

### Mobile

- no existe scroll horizontal accidental;
- KPI no desbordan;
- buscador no invade controles;
- OSM/SAT, ubicación y etiquetas no se superponen;
- footer no tapa controles críticos;
- safe areas respetadas;
- tabla GeoQuery desplazable horizontalmente cuando corresponda.

---

## 14. Estado de implementación v1

| Sitio | Index shared | Navegación | Responsive | GeoQuery shared | Estado |
|---|---|---|---|---|---|
| GeoIPT | Sí | Sí | Sí | Sí, puente seguro | Normalizado con deuda monolítica |
| GeoEVA | Sí | Sí | Sí | Sí | Referencia oficial |
| GeoNEMO | Sí | Sí | Sí | Sí | Normalizado |
| GeoNOXA | Sí | Sí | Sí | Sí | Normalizado |
| GeoMA | Sí | Sí | Sí | Sí | Normalizado |

---

## 15. Deuda técnica conocida

### GeoIPT GeoQuery

Es el principal bloque pendiente: mantiene CSS y gran parte de la lógica analítica dentro de `geoquery.html`.

La solución v1 utiliza un puente seguro para consumir shared y adoptar `gq-*` sin reescribir el motor existente.

La extracción física de CSS y JS debe realizarse en una intervención específica, con pruebas de:

- pertenencia/cercanía PRC;
- mapa;
- metadata;
- KML;
- PDF.

### CSS históricos de `index`

Los CSS locales aún contienen reglas heredadas. Al estar el responsive final centralizado, pueden retirarse gradualmente sólo después de validación visual comparativa.

### PDF

Los motores PDF no forman parte de la limpieza UI general. Cualquier modificación debe probar paginación, mapas, gráficos, tablas y exportación independientemente.

---

## 16. Documentos complementarios

- `GEOX_UI_AUDIT.md`: estado y deuda transversal.
- `shared/geoquery/README.md`: contrato específico GeoQuery.
- `shared/geox-tokens.css`: tokens del index.
- `shared/geox-index-base.css`: estructura index.
- `shared/geox-map-controls.css`: controles cartográficos.
- `shared/geox-index-responsive.css`: responsive index.
- `shared/geox-label-controls.css`: panel y etiquetas.
- `shared/geoquery/*`: sistema visual GeoQuery.

---

## 17. Criterio de cierre

GeoX UI v1 se considera implementado cuando los cinco subsitios:

- consumen el núcleo shared;
- conservan identidad temática propia;
- comparten navegación transversal;
- responden bajo una única lógica mobile;
- usan el contrato GeoQuery común cuando corresponde;
- mantienen la lógica GIS desacoplada de la normalización visual.

Este estándar debe ser la base de cualquier nueva evolución visual del ecosistema GeoX.
