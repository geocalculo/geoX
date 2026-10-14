#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const estudiosDir = path.resolve(__dirname, '..');
const catalogoPath = path.join(estudiosDir, 'catalogo.json');
const fechasPath = path.join(estudiosDir, 'fechas-creacion-laminas.json');
// Git no conserva birthtime: reutilizar las fechas capturadas en el equipo local.
const fechas = fs.existsSync(fechasPath)
  ? JSON.parse(fs.readFileSync(fechasPath, 'utf8'))
  : {};

const estudios = [];

for (const entry of fs.readdirSync(estudiosDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name === 'tools') {
    continue;
  }

  const metadataPath = path.join(estudiosDir, entry.name, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    continue;
  }

  const laminaPath = path.join(estudiosDir, entry.name, 'lamina.png');
  if (!fs.existsSync(laminaPath)) {
    console.warn(`[advertencia] ${entry.name}: falta lamina.png; no se incluirá.`);
    continue;
  }

  try {
    JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    console.warn(
      `[advertencia] ${entry.name}: metadata.json no es JSON válido (${error.message}); no se incluirá.`,
    );
    continue;
  }

  if (!Object.hasOwn(fechas, entry.name)) {
    if (process.env.CI) {
      throw new Error(
        `${entry.name}: falta la fecha de creación de lamina.png. Ejecuta node estudios/tools/build-catalogo.js localmente y sube fechas-creacion-laminas.json.`,
      );
    }
    fechas[entry.name] = fs.statSync(laminaPath).birthtime.toISOString();
  }
  const timestamp = Date.parse(fechas[entry.name]);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`${entry.name}: fecha de creación de lamina.png inválida.`);
  }

  estudios.push({
    slug: entry.name,
    timestamp,
  });
}

estudios.sort((a, b) => {
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  return a.slug.localeCompare(b.slug);
});

const slugs = [...new Set(estudios.map(({ slug }) => slug))];
const fechasOrdenadas = Object.fromEntries(
  Object.keys(fechas).sort().map((slug) => [slug, fechas[slug]]),
);
fs.writeFileSync(fechasPath, `${JSON.stringify(fechasOrdenadas, null, 2)}\n`);
fs.writeFileSync(catalogoPath, `${JSON.stringify(slugs, null, 2)}\n`);

console.log(`Estudios encontrados: ${slugs.length}`);
console.log('Estudios agregados al catálogo:');
for (const slug of slugs) {
  console.log(`- ${slug}`);
}
