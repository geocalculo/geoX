const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const script = readFileSync('estudios/galeria.js', 'utf8');

function almacenamiento(datos = new Map()) {
  return {
    getItem: (clave) => datos.get(clave) ?? null,
    setItem: (clave, valor) => datos.set(clave, String(valor)),
    removeItem: (clave) => datos.delete(clave)
  };
}

async function cargarGaleria(sessionStorage, solicitudes) {
  const elemento = () => ({
    addEventListener() {},
    append() {},
    close() {},
    replaceChildren() {},
    setAttribute() {},
    showModal() {},
    style: {}
  });
  const elementos = new Map();
  const document = {
    createElement: elemento,
    querySelector(selector) {
      if (!elementos.has(selector)) elementos.set(selector, elemento());
      return elementos.get(selector);
    }
  };
  const fetch = async (url, opciones = {}) => {
    solicitudes.push({ url, method: opciones.method || 'GET', body: opciones.body });
    if (url === './catalogo.json') return { ok: true, json: async () => [] };
    if (url === 'https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/contador') {
      return { ok: true, json: async () => ({ visitas: 3, laminas: 0, linkedin: 0 }) };
    }
    return { ok: true };
  };

  vm.runInNewContext(script, {
    console,
    crypto: { randomUUID: () => 'sesion-prueba' },
    document,
    fetch,
    Intl,
    Promise,
    sessionStorage
  });
  await new Promise((resolve) => setImmediate(resolve));
}

test('registra una sola visita por sesión y luego consulta el contador', async () => {
  const storage = almacenamiento();
  const primeraCarga = [];
  await cargarGaleria(storage, primeraCarga);

  const metricasPrimeraCarga = primeraCarga.filter(({ url }) => url.startsWith('https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/'));
  assert.deepEqual(metricasPrimeraCarga.map(({ method, url }) => `${method} ${url}`), [
    'POST https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/visita',
    'GET https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/contador'
  ]);
  assert.deepEqual(JSON.parse(metricasPrimeraCarga[0].body), {
    evento: 'visita',
    session_id: 'sesion-prueba'
  });

  const recarga = [];
  await cargarGaleria(storage, recarga);
  assert.equal(recarga.filter(({ method, url }) => method === 'POST' && url === 'https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/visita').length, 0);
});
