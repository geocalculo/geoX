# Auditoría de duplicados KML GeoQuery

Regla aplicada: **un concepto territorial → un ID semántico → un objeto en el registro → un Placemark principal en el KML**. Las únicas composiciones permitidas son objetos técnicos con roles diferentes y sin duplicar etiqueta ni metadata principal.

| Elemento | GeoIPT | GeoEVA | GeoNEMO | GeoNOXA | Corrección |
| --- | --- | --- | --- | --- | --- |
| Punto consultado | Existía como Placemark único, con ID genérico. | Existía como Placemark único, con ID genérico. | Ya estaba consolidado. | Estaba duplicado como punto y etiqueta independiente. | IDs semánticos por sitio; GeoNOXA elimina la etiqueta separada y conserva nombre/metadata en el punto. |
| Feature relacionada | Zona PRC exportada como geometría y etiqueta interior. | No aplica a polígonos relacionados. | Geometría con etiqueta interior separada controlada. | Zona ambiental exportada como geometría y etiqueta interior. | La geometría principal oculta su etiqueta cuando existe etiqueta interior; IDs/roles semánticos evitan copias. |
| Círculo | No aplica. | Círculo más etiqueta de radio en el punto consultado. | No aplica. | Círculo único de relaves. | GeoEVA elimina la etiqueta extra del círculo; el radio queda en ExtendedData del círculo. |
| Línea nearest | Nombre visible de distancia podía duplicar la etiqueta. | No aplica. | Ya usa nombre interno. | La línea usaba nombre visible de distancia. | Líneas nearest usan `Relación espacial` y `labelScale: 0`; la distancia vive solo en su etiqueta. |
| Distancia | Etiqueta única, pero con icono auxiliar reducido. | No aplica. | Etiqueta única por grupo. | Etiqueta única para zona nearest. | Etiquetas de distancia usan icono invisible y no se duplican con el nombre de la línea. |
| Punto contacto | Punto único. | No aplica. | Punto único por grupo. | Punto único para zona nearest. | Registro único por ID semántico y rol `contact-point`. |
| Etiquetas | Zona con etiqueta interior controlada; sin halo doble. | Proyectos tenían punto + etiqueta separada y halo KML doble. | Sin halo doble en el constructor local. | Relaves tenían punto + etiqueta separada; punto consultado duplicado. | Se elimina el expansor de halo compartido; proyectos/relaves usan el nombre del Placemark principal. |
| Metadata | Completa en zona PRC. | Completa en proyecto y círculo. | Completa en features y auxiliares. | Completa en relaves, zona y auxiliares. | La metadata se mantiene en el Placemark principal que permanece. |
| Listener KML | Instalador compartido con protección por dataset. | Igual. | Igual. | Igual. | El instalador usa `onclick` para reemplazar cualquier handler previo y evitar listeners acumulados. |
| Registro persistente | Se reconstruía array por exportación. | Se reconstruía array por exportación. | Ya usaba `Map`. | Se reconstruía array por exportación con duplicados. | Registro `Map` nuevo por construcción de exportación y validación antes del XML. |

## Causas encontradas por sitio

- **GeoIPT:** IDs no semánticos y línea nearest con nombre visible de distancia; la etiqueta de distancia tenía un icono auxiliar no completamente invisible.
- **GeoEVA:** proyectos base generaban un punto y una etiqueta independiente con el mismo nombre; además el exportador compartido expandía halos en dos Placemarks (`halo` y `front`) cuando recibía `kmlHaloColor`.
- **GeoNEMO:** ya estaba mayormente normalizado con `Map`; se confirma que no depende de capas Leaflet y que usa etiqueta interior separada solo cuando la geometría oculta su etiqueta.
- **GeoNOXA:** punto consultado duplicado como punto + etiqueta; relaves duplicados como punto + etiqueta; línea nearest con nombre visible de distancia; IDs/roles no completamente semánticos.

## Estrategia final

- **IDs:** prefijos estables por sitio (`geoipt-*`, `geoeva-*`, `geonemo-*`, `geonoxa-*`).
- **Roles:** `query-point`, `related-feature`, `cluster-circle`, `related-point`, `nearest-line`, `distance-label`, `contact-point`, `feature-label`.
- **Etiquetas:** sin simulación de halo mediante dos Placemarks; una sola etiqueta textual cuando es necesaria. Puntos de proyectos, relaves y punto consultado usan el nombre del Placemark principal.
- **Fuente de verdad:** los constructores KML leen `window.geoQueryState.mapExport` generado desde resultados normalizados; no recorren capas Leaflet para duplicar objetos.
- **Validación:** el módulo compartido valida IDs, roles, firmas de puntos por rol/grupo y total de objetos antes de emitir XML.

## Cantidades esperadas tras la corrección

- **GeoIPT intersects:** 1 punto consultado, 1 zona PRC, 1 etiqueta de zona si se requiere etiqueta interior, 0 línea nearest, 0 etiqueta distancia, 0 contacto.
- **GeoIPT nearest:** 1 punto consultado, 1 zona PRC, 1 etiqueta de zona si se requiere etiqueta interior, 1 línea nearest, 1 etiqueta distancia, 1 contacto.
- **GeoEVA con N proyectos base:** 1 punto consultado, 1 círculo, N proyectos base y 0 copias por etiqueta o sector dominante.
- **GeoNEMO SNASPE/Ramsar nearest:** 1 punto consultado y, por grupo resuelto, 1 feature, 1 línea, 1 etiqueta de distancia y 1 contacto.
- **GeoNOXA con N relaves y zona nearest:** 1 punto consultado, 1 círculo, N relaves, 1 zona, 1 etiqueta de zona si se requiere etiqueta interior, 1 línea, 1 etiqueta distancia y 1 contacto.

## Limitación de validación visual

No se pudo abrir Google Earth Pro desde este entorno no interactivo. La validación realizada fue estática y programática sobre el ensamblaje KML, los IDs semánticos y la eliminación de fuentes de duplicación conocidas.
