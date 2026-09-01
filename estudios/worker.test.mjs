import assert from "node:assert/strict";
import test from "node:test";
import { manejarRutaEstudios } from "./worker.js";

function d1({ duplicate = null, totals = null, fail = false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql: sql.replace(/\s+/g, " ").trim(), params: [] };
      calls.push(call);
      return {
        bind(...params) { call.params = params; return this; },
        async first() { if (fail) throw new Error("D1"); return totals ?? duplicate; },
        async run() { if (fail) throw new Error("D1"); return { success: true }; },
      };
    },
  };
}

const request = (method, path, body) => new Request(`https://geocalculo.cl${path}`, {
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
  headers: body === undefined ? undefined : { "content-type": "application/json" },
});

test("registra una visita nueva sin fecha, IP ni coordenadas", async () => {
  const DB = d1();
  const response = await manejarRutaEstudios(request("POST", "/api/estudios/visita", {
    evento: "visita", recurso: null, session_id: " sesion-1 ", latitud: -33,
  }), { DB });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, registrado: true });
  assert.deepEqual(DB.calls[1].params, ["visita", null, "sesion-1"]);
  assert.doesNotMatch(DB.calls[1].sql, /fecha|latitud|ip/i);
});

test("una visita duplicada no se inserta", async () => {
  const DB = d1({ duplicate: { 1: 1 } });
  const response = await manejarRutaEstudios(request("POST", "/api/estudios/visita", {
    evento: "visita", recurso: null, session_id: "sesion-1",
  }), { DB });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, registrado: false, duplicado: true });
  assert.equal(DB.calls.length, 1);
});

test("deduplica laminas por evento, recurso y sesion", async () => {
  const DB = d1({ duplicate: { 1: 1 } });
  await manejarRutaEstudios(request("POST", "/api/estudios/visita", {
    evento: "lamina", recurso: " lamina-1 ", session_id: "s1",
  }), { DB });
  assert.deepEqual(DB.calls[0].params, ["lamina", "lamina-1", "s1"]);
});

test("valida evento, recurso y session_id", async () => {
  for (const body of [
    { evento: "otro", recurso: null, session_id: "s" },
    { evento: "lamina", recurso: null, session_id: "s" },
    { evento: "visita", recurso: "x", session_id: "s" },
    { evento: "visita", recurso: null, session_id: " ".repeat(101) },
  ]) {
    const response = await manejarRutaEstudios(request("POST", "/api/estudios/visita", body), { DB: d1() });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).ok, false);
  }
});

test("devuelve totales historicos y ceros para valores nulos", async () => {
  const response = await manejarRutaEstudios(request("GET", "/api/estudios/contador"), {
    DB: d1({ totals: { visitas: 100, laminas: 250, linkedin: 54 } }),
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual({ ...body, updated_at: "fecha" }, {
    ok: true, visitas: 100, laminas: 250, linkedin: 54, updated_at: "fecha",
  });
  assert.match(body.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("encapsula fallas D1 y no captura las rutas existentes", async () => {
  const response = await manejarRutaEstudios(request("POST", "/api/estudios/visita", {
    evento: "linkedin", recurso: "lamina-1", session_id: "s1",
  }), { DB: d1({ fail: true }) });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "No fue posible registrar el acceso" });
  assert.equal(await manejarRutaEstudios(request("POST", "/api/registro"), { DB: d1() }), null);
});
