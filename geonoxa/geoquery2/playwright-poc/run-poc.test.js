'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { argumentsFrom, VIEWPORT } = require('./run-poc');

test('usa una configuración reproducible por defecto', () => {
  const options = argumentsFrom([]);
  assert.deepEqual(VIEWPORT, { width: 1440, height: 1100 });
  assert.equal(options.current, true);
  assert.match(options.query, /queryLat=/);
});

test('acepta salida, consulta y omisión del exportador actual', () => {
  const options = argumentsFrom(['--output', 'tmp/poc', '--query', 'lat=1&lon=2', '--skip-current']);
  assert.equal(options.output, path.resolve('tmp/poc'));
  assert.equal(options.query, 'lat=1&lon=2');
  assert.equal(options.current, false);
});

test('rechaza argumentos desconocidos', () => {
  assert.throws(() => argumentsFrom(['--no-existe']), /Argumento desconocido/);
});
