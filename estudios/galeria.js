const galeria = document.querySelector('#galeria');
const estado = document.querySelector('#estado');
const buscar = document.querySelector('#buscar');
const dialogo = document.querySelector('#detalle');
let estudios = [];

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
  boton.setAttribute('aria-label', `Abrir ${estudio.titulo}`);
  miniatura.className = 'miniatura';
  imagen.src = `${estudio.ruta}/lamina.png`;
  imagen.alt = '';
  imagen.loading = 'lazy';
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
  dialogo.showModal();
}

async function cargar() {
  try {
    const rutas = await fetch('./catalogo.json').then((respuesta) => {
      if (!respuesta.ok) throw new Error('No fue posible leer el catálogo');
      return respuesta.json();
    });
    const resultados = await Promise.allSettled(rutas.map(async (ruta) => {
      const respuesta = await fetch(`./${ruta}/metadata.json`);
      if (!respuesta.ok) throw new Error(`No fue posible leer ${ruta}`);
      return { ...await respuesta.json(), ruta: `./${ruta}` };
    }));
    estudios = resultados.filter(({ status }) => status === 'fulfilled').map(({ value }) => value)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    pintar();
  } catch (error) {
    estado.textContent = 'No fue posible cargar los estudios. Intenta nuevamente más tarde.';
    console.error(error);
  }
}

buscar.addEventListener('input', (evento) => pintar(evento.target.value));
document.querySelector('.cerrar').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('click', (evento) => {
  if (evento.target === dialogo) dialogo.close();
});
cargar();
