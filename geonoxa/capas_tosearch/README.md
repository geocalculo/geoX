# geonoxa/capas_tosearch

Índice liviano para el buscador nacional de GeoNOXA.

## Archivos

- `geonoxa_tosearch_objetos.geojson`: índice combinado de relaves + zonas saturadas/latentes.
- `geonoxa_tosearch_relaves.geojson`: índice solo relaves.
- `geonoxa_tosearch_zonas.geojson`: índice solo zonas saturadas/latentes.

## Resumen

- Relaves: 836
- Zonas saturadas/latentes: 24
- Total índice combinado: 860

## Uso recomendado

El buscador debe cargar preferentemente:

`./capas_tosearch/geonoxa_tosearch_objetos.geojson`

Cada feature es un `Point` liviano.  
Para zonas poligonales, el `Point` corresponde a un punto representativo y el campo `bbox` permite hacer `fitBounds` al área completa.  
Para relaves, el punto corresponde a la coordenada del depósito.

## Campos principales

- `familia`: `relaves` o `zonas`
- `tipo_objeto`
- `id_objeto`
- `nombre_objeto`
- `nombre_busq`
- `lat`
- `lon`
- `bbox`

## Campos relaves

- `id_relave`
- `faena`
- `titular` / `empresa`
- `recurso`
- `comuna`
- `tipo_deposito`
- `metodo_constructivo`

## Campos zonas

- `nombre_zona`
- `zona_dec`
- `contaminante`
- `saturado`
- `latentes`
- `decreto`
- `cut_reg`
- `superficie`

## Regla de navegación

- Relaves: al seleccionar, usar `map.setView([lat, lon], 14)` o zoom similar.
- Zonas: al seleccionar, usar `bbox` con `map.fitBounds(...)`.
- No abrir popup en index.
- Solo navegar y capturar coordenada silenciosamente para GeoQuery futuro.
