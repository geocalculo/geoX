# GeoX UI · Diccionario de interfaz

Rama de definición: `improve/geox-ui-v1`

## Objetivo

Fijar un vocabulario visible común para los sitios GeoX sin homogeneizar el contenido analítico ni la identidad temática de cada sitio.

## Contrato GeoQuery

| Elemento | Forma estándar | Ejemplo |
|---|---|---|
| Título del documento | `GeoQuery | [Sitio]` | `GeoQuery | GeoEVA` |
| Nombre de producto visible | `GeoQuery` | `GeoQuery` |
| Acción KML | `Descargar KML` | `Descargar KML` |
| Acción de retorno | `Volver a [Sitio]` | `Volver a GeoMA` |
| Resumen inicial | `Resumen de consulta` | `Resumen de consulta` |
| Punto de referencia | `Punto consultado` | `Punto consultado` |
| Mapa principal | `Mapa territorial` o título temático equivalente | `Mapa territorial` |
| Síntesis | `Síntesis territorial` / `Síntesis ejecutiva` según contenido | contenido temático permitido |
| Footer | `GeoQuery · [Sitio] · ...` cuando exista | `GeoQuery · GeoNEMO · Resultados territoriales referenciales` |

## Reglas

1. `GeoQuery 2.0` deja de ser una denominación visible del producto. La evolución técnica no se expone como versión en la interfaz.
2. Se usa `Descargar KML`, no `Exportar KML`.
3. El retorno identifica siempre el sitio de destino: `Volver a GeoIPT`, `Volver a GeoEVA`, `Volver a GeoNEMO`, `Volver a GeoNOXA` o `Volver a GeoMA`.
4. Flechas, emojis o iconos no forman parte del texto contractual del botón. Si se requieren, deben implementarse visualmente mediante CSS/iconografía, no incrustarse en la etiqueta.
5. Los títulos analíticos internos permanecen libres: proyectos, relaves, áreas protegidas, masas de agua, normativa urbana, gráficos, KPI y descriptores conservan su lenguaje temático.
6. Nombres técnicos históricos como `geoquery2.css`, `geoquery2.js` o rutas existentes no se renombran dentro de esta intervención; no son copy visible y cambiarlos agregaría riesgo funcional sin beneficio de interfaz.
7. El diccionario se aplica al texto visible. No modifica lógica GIS, cálculos, KML, PDF ni fuentes de datos.

## Sitios cubiertos

- GeoIPT
- GeoEVA
- GeoNEMO
- GeoNOXA
- GeoMA

## Criterio de aceptación

Los cinco `geoquery.html` deben cumplir simultáneamente:

- `<title>GeoQuery | [Sitio]</title>`;
- al menos una acción `Volver a [Sitio]`;
- ninguna aparición visible de `GeoQuery 2.0`;
- ninguna acción visible `Exportar KML`;
- acciones KML visibles bajo `Descargar KML` cuando correspondan.
