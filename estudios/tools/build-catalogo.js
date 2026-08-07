#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const estudiosDir = path.resolve(__dirname, '..');
const catalogoPath = path.join(estudiosDir, 'catalogo.json');

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

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    console.warn(
      `[advertencia] ${entry.name}: metadata.json no es JSON válido (${error.message}); no se incluirá.`,
    );
    continue;
  }

  const parsedDate =
    typeof metadata.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(metadata.fecha)
      ? new Date(`${metadata.fecha}T00:00:00Z`)
      : null;
  const timestamp =
    parsedDate &&
    !Number.isNaN(parsedDate.getTime()) &&
    parsedDate.toISOString().slice(0, 10) === metadata.fecha
      ? parsedDate.getTime()
      : null;

  estudios.push({
    slug: entry.name,
    timestamp,
  });
}

estudios.sort((a, b) => {
  if (a.timestamp === null && b.timestamp !== null) return 1;
  if (a.timestamp !== null && b.timestamp === null) return -1;
  if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
  return a.slug.localeCompare(b.slug);
});

const slugs = [...new Set(estudios.map(({ slug }) => slug))];
fs.writeFileSync(catalogoPath, `${JSON.stringify(slugs, null, 2)}\n`);

console.log(`Estudios encontrados: ${slugs.length}`);
console.log('Estudios agregados al catálogo:');
for (const slug of slugs) {
  console.log(`- ${slug}`);
}
