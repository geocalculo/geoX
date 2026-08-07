/**
 * Rutas independientes de analítica para geocalculo.cl/estudios.
 *
 * Este módulo no crea ni modifica el esquema D1 y mantiene sus consultas
 * completamente separadas de la telemetría de GeoX.
 */

const EVENTOS_ESTUDIOS_VALIDOS = new Set(["visita", "lamina", "linkedin"]);

function json(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=UTF-8", ...headers },
  });
}

function textoObligatorio(valor, nombre, maximo) {
  if (typeof valor !== "string") {
    throw new Error(`${nombre} es obligatorio y debe ser un string`);
  }

  const texto = valor.trim();
  if (!texto) throw new Error(`${nombre} es obligatorio`);
  if (texto.length > maximo) throw new Error(`${nombre} no puede superar ${maximo} caracteres`);
  return texto;
}

function validarAccesoEstudios(datos) {
  if (!datos || typeof datos !== "object" || Array.isArray(datos)) {
    throw new Error("El cuerpo debe ser un objeto JSON");
  }

  const evento = textoObligatorio(datos.evento, "evento", 20);
  if (!EVENTOS_ESTUDIOS_VALIDOS.has(evento)) {
    throw new Error("evento debe ser visita, lamina o linkedin");
  }

  const sessionId = textoObligatorio(datos.session_id, "session_id", 100);
  let recurso = null;

  if (evento === "visita") {
    if (datos.recurso !== null && datos.recurso !== undefined) {
      throw new Error("recurso debe ser null para visita");
    }
  } else {
    recurso = textoObligatorio(datos.recurso, "recurso", 200);
  }

  return { evento, recurso, sessionId };
}

export async function registrarAccesoEstudios(request, env, headers = {}) {
  let datos;
  try {
    datos = validarAccesoEstudios(await request.json());
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "JSON inválido" }, 400, headers);
  }

  try {
    const { evento, recurso, sessionId } = datos;
    const consultaDuplicado = evento === "visita"
      ? "SELECT 1 FROM accesos_estudios WHERE evento = ? AND session_id = ? LIMIT 1"
      : "SELECT 1 FROM accesos_estudios WHERE evento = ? AND recurso = ? AND session_id = ? LIMIT 1";
    const parametros = evento === "visita" ? [evento, sessionId] : [evento, recurso, sessionId];
    const duplicado = await env.DB.prepare(consultaDuplicado).bind(...parametros).first();

    if (duplicado) {
      return json({ ok: true, registrado: false, duplicado: true }, 200, headers);
    }

    await env.DB.prepare(
      "INSERT INTO accesos_estudios (evento, recurso, session_id) VALUES (?, ?, ?)",
    ).bind(evento, recurso, sessionId).run();
    return json({ ok: true, registrado: true }, 201, headers);
  } catch (error) {
    console.error("No fue posible registrar el acceso a Estudios", error);
    return json({ ok: false, error: "No fue posible registrar el acceso" }, 500, headers);
  }
}

export async function obtenerContadorEstudios(env, headers = {}) {
  try {
    const totales = await env.DB.prepare(`
      SELECT
        SUM(CASE WHEN evento = 'visita' THEN 1 ELSE 0 END) AS visitas,
        SUM(CASE WHEN evento = 'lamina' THEN 1 ELSE 0 END) AS laminas,
        SUM(CASE WHEN evento = 'linkedin' THEN 1 ELSE 0 END) AS linkedin
      FROM accesos_estudios
    `).first();

    return json({
      ok: true,
      visitas: Number(totales?.visitas ?? 0),
      laminas: Number(totales?.laminas ?? 0),
      linkedin: Number(totales?.linkedin ?? 0),
      updated_at: new Date().toISOString(),
    }, 200, headers);
  } catch (error) {
    console.error("No fue posible obtener el contador de Estudios", error);
    return json({ ok: false, error: "No fue posible obtener el contador" }, 500, headers);
  }
}

/**
 * Debe invocarse desde fetch antes de la respuesta "RUTA NO ENCONTRADA".
 * Retorna null para cualquier ruta existente, de modo que el Worker continúe
 * exactamente con su enrutamiento actual.
 */
export async function manejarRutaEstudios(request, env, headers = {}) {
  const { pathname } = new URL(request.url);

  if (request.method === "POST" && pathname === "/api/estudios/visita") {
    return registrarAccesoEstudios(request, env, headers);
  }
  if (request.method === "GET" && pathname === "/api/estudios/contador") {
    return obtenerContadorEstudios(env, headers);
  }
  return null;
}
