const galeria = document.querySelector('#galeria');
const estado = document.querySelector('#estado');
const buscar = document.querySelector('#buscar');
const dialogo = document.querySelector('#detalle');
let estudios = [];
let estudioAbierto = null;

const CLAVE_SESSION = 'geocalculo_estudios_session_id';
const CLAVE_VISITA_REGISTRADA = 'geocalculo_estudios_visita_registrada';

function obtenerSessionId() {
  try {
    const guardado = sessionStorage.getItem(CLAVE_SESSION);
    if (guardado) return guardado;
    const nuevo = (globalThis.crypto?.randomUUID?.() || `sesion-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    sessionStorage.setItem(CLAVE_SESSION, nuevo);
    return nuevo;
  } catch (_) {
    return `sesion-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

const sessionId = obtenerSessionId();

function registrarEvento(evento, recurso) {
  const datos = { evento, session_id: sessionId };
  if (recurso) datos.recurso = recurso;

  return fetch('https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/visita', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(datos),
    keepalive: true
  }).catch(() => {});
}

async function registrarVisita() {
  try {
    if (sessionStorage.getItem(CLAVE_VISITA_REGISTRADA) === sessionId) return;
  } catch (_) { /* La galería debe funcionar aunque el navegador bloquee el almacenamiento. */ }

  // Se marca antes del POST para impedir envíos duplicados si la inicialización
  // se ejecuta más de una vez durante la misma sesión de la pestaña.
  try { sessionStorage.setItem(CLAVE_VISITA_REGISTRADA, sessionId); } catch (_) {}
  const respuesta = await registrarEvento('visita');
  if (!respuesta?.ok) {
    try { sessionStorage.removeItem(CLAVE_VISITA_REGISTRADA); } catch (_) {}
  }
}

async function iniciarMetricas() {
  await Promise.allSettled([registrarVisita(), cargarContador()]);
}

async function cargarContador() {
  try {
    const respuesta = await fetch('https://hidden-mud-ce7a.geocalculo.workers.dev/api/estudios/contador');
    if (!respuesta.ok) return;
    const datos = await respuesta.json();
    document.querySelector('#contador-visitas').textContent = datos.visitas ?? 0;
    document.querySelector('#contador-laminas').textContent = datos.laminas ?? 0;
    document.querySelector('#contador-linkedin').textContent = datos.linkedin ?? 0;
    document.querySelector('#contador').hidden = false;
  } catch (_) {
    // Las métricas son complementarias y no deben afectar a la galería.
  }
}

const fechaLarga = (fecha) => {
  if (!fecha) return 'Sin fecha';
  const valor = new Date(`${fecha}T12:00:00`);
  return Number.isNaN(valor.valueOf())
    ? fecha
    : new Intl.DateTimeFormat('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }).format(valor);
};

function tarjeta(estudio) {
  const articulo = document.createElement('article');
  articulo.className = 'estudio';
  const boton = document.createElement('button');
  const miniatura = document.createElement('div');
  const imagen = document.createElement('img');
  const ficha = document.createElement('div');
  boton.type = 'button';
  boton.className = 'estudio-boton';
  boton.setAttribute('aria-label', `Abrir ${estudio.titulo}`);
  miniatura.className = 'miniatura';
  imagen.src = `${estudio.ruta}/lamina.png`;
  imagen.alt = '';
  imagen.loading = 'lazy';
  imagen.addEventListener('error', () => { miniatura.classList.add('imagen-no-disponible'); imagen.hidden = true; });
  miniatura.append(imagen);
  ficha.className = 'ficha';
  [['p', 'tema', estudio.tema || 'Estudio territorial'], ['h2', '', estudio.titulo],
    ['p', 'territorio', estudio.territorio], ['p', 'fuente', estudio.fuente]].forEach(([tag, clase, texto]) => {
    const elemento = document.createElement(tag);
    elemento.className = clase;
    elemento.textContent = texto;
    ficha.append(elemento);
  });
  boton.append(miniatura, ficha);
  boton.addEventListener('click', () => abrirDetalle(estudio));
  articulo.append(boton);
  return articulo;
}

function pintar(filtro = '') {
  const consulta = filtro.trim().toLocaleLowerCase('es');
  const visibles = estudios.filter((estudio) =>
    [estudio.titulo, estudio.territorio, estudio.fuente, estudio.tema]
      .some((valor) => String(valor || '').toLocaleLowerCase('es').includes(consulta))
  );
  galeria.replaceChildren(...visibles.map(tarjeta));
  estado.hidden = true;
  if (!visibles.length) {
    const vacio = document.createElement('p');
    vacio.className = 'vacio';
    vacio.textContent = 'No encontramos estudios para esta búsqueda.';
    galeria.append(vacio);
  }
}

function abrirDetalle(estudio) {
  estudioAbierto = estudio;
  document.querySelector('#detalle-tema').textContent = estudio.tema || 'Estudio territorial';
  document.querySelector('#detalle-titulo').textContent = estudio.titulo;
  const lamina = document.querySelector('#detalle-lamina');
  lamina.src = `${estudio.ruta}/lamina.png`;
  lamina.alt = `Lámina del estudio ${estudio.titulo}`;
  document.querySelector('#detalle-descripcion').textContent = estudio.descripcion;
  document.querySelector('#detalle-fuente').textContent = estudio.fuente;
  document.querySelector('#detalle-territorio').textContent = estudio.territorio;
  document.querySelector('#detalle-fecha').textContent = fechaLarga(estudio.fecha);
  const linkedin = document.querySelector('#detalle-linkedin');
  linkedin.hidden = !estudio.linkedin;
  linkedin.href = estudio.linkedin || '#';
  if (!dialogo.open) dialogo.showModal();
  registrarEvento('lamina', estudio.id);
}

async function cargar() {
  try {
    const rutas = await fetch('./catalogo.json').then((respuesta) => {
      if (!respuesta.ok) throw new Error('No fue posible leer el catálogo');
      return respuesta.json();
    });
    if (!Array.isArray(rutas)) throw new Error('El catálogo no es una lista');
    const rutasValidas = rutas.filter((ruta) => typeof ruta === 'string' && /^[\p{L}\p{N}_ .-]+$/u.test(ruta) && ruta !== '.' && ruta !== '..');
    const resultados = await Promise.allSettled(rutasValidas.map(async (ruta) => {
      const respuesta = await fetch(`./${ruta}/metadata.json`);
      if (!respuesta.ok) throw new Error(`No fue posible leer ${ruta}`);
      return { ...await respuesta.json(), id: ruta, ruta: `./${ruta}` };
    }));
    const fallidos = resultados.filter(({ status }) => status === 'rejected').length;
    estudios = resultados.filter(({ status }) => status === 'fulfilled').map(({ value }) => value)
      .filter((estudio) => typeof estudio.titulo === 'string' && estudio.titulo.trim())
      .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    pintar();
    if (fallidos || rutasValidas.length !== rutas.length) {
      console.warn(`Estudios omitidos: ${fallidos + rutas.length - rutasValidas.length}`);
    }
    if (!estudios.length) {
      estado.hidden = false;
      estado.textContent = 'No hay estudios disponibles en este momento.';
    }
  } catch (error) {
    estado.textContent = 'No fue posible cargar los estudios. Intenta nuevamente más tarde.';
    console.error(error);
  }
}

buscar.addEventListener('input', (evento) => pintar(evento.target.value));
document.querySelector('.cerrar').addEventListener('click', () => dialogo.close());
document.querySelector('#detalle-linkedin').addEventListener('click', () => {
  if (estudioAbierto) registrarEvento('linkedin', estudioAbierto.id);
});
dialogo.addEventListener('click', (evento) => {
  if (evento.target === dialogo) dialogo.close();
});
iniciarMetricas();
cargar();
