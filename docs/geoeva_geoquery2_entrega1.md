# GeoEVA GeoQuery 2.0 — Entrega 1

## Alcance y reutilización

La maqueta vive exclusivamente en `geoeva/geoquery2/`. Antes de implementarla se auditó el HTML de GeoQuery 1.0 y se replicaron sin cambios conceptuales `normalizeStatus`, los predicados de estado, `normalizeSector`, la obtención de coordenadas, la distancia Turf, la selección ordenada de diez aprobados, el radio del último seleccionado, el filtro inclusivo del radio, la suma de inversión y los indicadores de distancias al punto y entre pares.

La carga conserva el GeoJSON nacional `geoeva/capas_geoquery/geoeva_geoquery_proyectos.geojson`. No fue necesario modificar GeoQuery 1.0, Index, módulos compartidos, telemetría, PDF/KML, Worker, D1, R2 ni otros sitios. El centroide mostrado es la media aritmética de latitudes y longitudes del grupo base y es **sólo visual**: no interviene en ningún indicador.

## Archivos

```text
geoeva/geoquery2/
├── geoquery.html
├── css/geoquery2.css
└── js/
    ├── analysis.js
    ├── geoquery2.js
    ├── map.js
    └── render.js
tests/geoeva-geoquery2-analysis.test.js
docs/geoeva_geoquery2_entrega1.md
```

## Casos comparados

El test automatizado ejecuta cuatro ubicaciones representativas con datos reales y compara el módulo 2.0 contra una referencia aislada que reproduce las funciones auditadas de 1.0. Comprueba IDs y orden, radio sin redondear, cantidad dentro del radio, sector, participación, inversión aprobada y distancia mínima. El quinto caso verifica coordenadas incompletas y fuera de rango; en UI no hace `fetch` ni crea el mapa.

| Caso / coordenadas | Radio 1.0 / 2.0 | Aprobados | Sector dominante | Inversión aprobada | Distancia mínima | Resultado |
|---|---:|---:|---|---:|---:|---|
| Santiago `-33.4489,-70.6693` | 1,395 / 1,395 km | 10 / 10 | Inmobiliarios (60 %) | 2.179,5454 / 2.179,5454 MMUSD | 0,437 / 0,437 km | Coincide |
| Antofagasta `-23.6509,-70.3975` | 4,540 / 4,540 km | 10 / 10 | Otros (40 %) | 395,806307 / 395,806307 MMUSD | 0,660 / 0,660 km | Coincide |
| Concepción `-36.8201,-73.0444` | 2,319 / 2,319 km | 10 / 10 | Inmobiliarios (90 %) | 538,442601 / 538,442601 MMUSD | 0,756 / 0,756 km | Coincide |
| Rapa Nui `-27.1127,-109.3497` | 3.211,785 / 3.211,785 km | 10 / 10 | Otros (30 %) | 356,388191 / 356,388191 MMUSD | 3.002,684 / 3.002,684 km | Coincide |
| Inválida `lat=abc&lon=-70` | No aplica | No aplica | No aplica | No aplica | No aplica | Bloqueada antes de cargar |

URLs: `geoquery.html?site=geoeva&lat=<lat>&lon=<lon>&basemap=osm&from=geoquery`. También se verifican los alias `queryLat/queryLon`, viewport y retorno compatibles.

## Evidencia visual

Se prepararon los estados `loading`, `resolved`, `empty`, `error` e `invalid coordinates` y los breakpoints de 1440, 1024, 768 y 390 px. La captura automatizada quedó bloqueada en este contenedor: no existe navegador instalado y la política del registro devolvió HTTP 403 al intentar obtener Playwright. Deben capturarse en el entorno de revisión abriendo las URLs anteriores; esta limitación no afecta la ejecución estática de la página.

## Riesgos y pendientes

* **Exportaciones:** PDF y KML están visibles pero deshabilitados con una explicación. Integrarlos ahora acoplaba la maqueta a módulos y registros críticos; se recomienda una conexión segura en Entrega 2 sin alterar 1.0.
* **Rendimiento:** se conserva deliberadamente la descarga nacional y el cálculo lineal. En equipos móviles el GeoJSON de gran tamaño puede tardar; partición e índices quedan fuera del alcance.
* **Compatibilidad:** Leaflet y Turf se sirven desde CDN, como recursos de ejecución estática; una caída o política CSP externa produce el estado de error controlado.
* **Deuda técnica:** la regla de desempate de sector continúa dependiendo del orden de inserción, exactamente como 1.0. No debe cambiarse sin una decisión de negocio y pruebas históricas.
* **Entrega 2:** conectar exportaciones, automatizar regresión visual multi-navegador y evaluar carga diferida sin cambiar los resultados.
