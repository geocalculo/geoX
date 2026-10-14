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

  try {
    JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    console.warn(
      `[advertencia] ${entry.name}: metadata.json no es JSON válido (${error.message}); no se incluirá.`,
    );
    continue;
  }

  const timestamp = fs.statSync(path.join(estudiosDir, entry.name)).birthtimeMs;

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
fs.writeFileSync(catalogoPath, `${JSON.stringify(slugs, null, 2)}\n`);

console.log(`Estudios encontrados: ${slugs.length}`);
console.log('Estudios agregados al catálogo:');
for (const slug of slugs) {
  console.log(`- ${slug}`);
}
