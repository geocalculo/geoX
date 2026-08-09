'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { argumentsFrom, VIEWPORT, PDF_OPTIONS } = require('./run-poc');

test('usa una configuración reproducible por defecto', () => {
  const options = argumentsFrom([]);
  assert.deepEqual(VIEWPORT, { width: 1440, height: 1100 });
  assert.match(options.query, /queryLat=/);
  assert.equal(PDF_OPTIONS.preferCSSPageSize, true);
});

test('acepta salida, consulta y modo visible', () => {
  const options = argumentsFrom(['--output', 'tmp/poc', '--query', 'lat=1&lon=2', '--headed']);
  assert.equal(options.output, path.resolve('tmp/poc'));
  assert.equal(options.query, 'lat=1&lon=2');
  assert.equal(options.headed, true);
});

test('rechaza argumentos desconocidos', () => {
  assert.throws(() => argumentsFrom(['--no-existe']), /Argumento desconocido/);
});

test('la variante de paginación queda aislada a impresión y usa una fila estable', () => {
  const css = fs.readFileSync(path.join(__dirname, 'pagination-test.css'), 'utf8');
  assert.match(css, /@media print/);
  assert.match(css, /\.tailings-related-layout[\s\S]*display: table !important/);
  assert.match(css, /\.relaves-list-column,[\s\S]*display: table-cell !important/);
  assert.match(css, /break-inside: avoid !important/);
});
