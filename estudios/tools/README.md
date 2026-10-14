# Generar el catálogo

Ejecuta `node estudios/tools/build-catalogo.js` en el equipo donde creaste las
láminas, antes de subir una publicación nueva.

El generador captura la fecha de creación local de cada `lamina.png` nueva en
`estudios/fechas-creacion-laminas.json` y ordena el catálogo de más reciente a
más antigua. Las fechas ya registradas se conservan en ejecuciones posteriores.
Incluye ese archivo junto con `estudios/catalogo.json` al subir los cambios.

Git no conserva las fechas de creación de los archivos. GitHub Actions reutiliza
las fechas registradas y detiene la generación si falta alguna, para evitar
ordenar por la fecha de descarga del repositorio.
