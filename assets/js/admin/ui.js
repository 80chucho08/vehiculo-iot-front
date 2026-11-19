// Utilidades de interfaz de ADMINISTRACIÓN. Todo el contenido del servidor se inserta con textContent
// (nunca innerHTML), así la Content-Security-Policy puede prohibir scripts en línea y el token de
// sessionStorage queda protegido de inyecciones.
import { parseFechaBackend, formatearFecha, formatearHora } from '../core/fecha.js';

/** Crea un elemento: el('button', { class: 'tecla', type: 'button', onclick: fn }, 'Texto', otroNodo) */
export function el(tag, atributos = {}, ...hijos) {
  const nodo = document.createElement(tag);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave.startsWith('on') && typeof valor === 'function') nodo.addEventListener(clave.slice(2), valor);
    else if (clave === 'class') nodo.className = valor;
    else if (clave === 'dataset') Object.assign(nodo.dataset, valor);
    else if (valor === true) nodo.setAttribute(clave, '');
    else nodo.setAttribute(clave, String(valor));
  }
  for (const hijo of hijos.flat()) {
    if (hijo === null || hijo === undefined || hijo === false) continue;
    nodo.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return nodo;
}

export function fechaHora(valor) {
  const fecha = parseFechaBackend(typeof valor === 'string' ? valor.split('.')[0] : valor);
  if (!fecha) return el('span', { class: 'texto-tenue' }, '—');
  return el('time', { datetime: fecha.toISOString() }, `${formatearFecha(fecha)} ${formatearHora(fecha)}`);
}

export function etiqueta(texto, tipo = 'neutro') {
  return el('span', { class: 'etiqueta', 'data-tipo': tipo }, texto);
}

export function textoError(error) {
  if (error?.status === 401) return 'Tu sesión terminó. Inicia sesión de nuevo.';
  if (error?.status === 403) return error.message || 'No tienes permiso para esta acción.';
  return error?.message || String(error);
}

/**
 * Tabla accesible con estados. columnas: [{ titulo, celda: (fila) => Node|string, clase? }]
 * Devuelve { nodo, cargando(), error(msg, reintentar), filas(datos, vacioTexto) }.
 */
export function crearTabla({ titulo, columnas }) {
  const cuerpo = el('tbody');
  const estado = el('p', { class: 'admin-estado', role: 'status', 'aria-live': 'polite' });
  const tabla = el('table', { class: 'admin-tabla' },
    el('caption', { class: 'sr-only' }, titulo),
    el('thead', {}, el('tr', {}, columnas.map((c) => el('th', { scope: 'col', class: c.clase }, c.titulo)))),
    cuerpo);
  const nodo = el('div', { class: 'admin-tabla-bloque' }, estado, el('div', { class: 'tabla-marco tabla-desplazable', tabindex: '0', 'aria-label': titulo }, tabla));

  function pintarEstado(tipo, texto, accion) {
    estado.dataset.estado = tipo;
    estado.replaceChildren(texto);
    if (accion) estado.append(' ', el('button', { type: 'button', class: 'tecla tecla-chica', onclick: accion.fn }, accion.texto));
    estado.hidden = !texto;
  }
  return {
    nodo,
    cargando() { tabla.setAttribute('aria-busy', 'true'); pintarEstado('cargando', 'Cargando…'); },
    error(mensaje, reintentar) {
      tabla.removeAttribute('aria-busy'); cuerpo.replaceChildren();
      pintarEstado('error', mensaje, reintentar ? { texto: 'Reintentar', fn: reintentar } : null);
    },
    filas(datos, vacio = 'No hay registros.') {
      tabla.removeAttribute('aria-busy');
      cuerpo.replaceChildren(...datos.map((fila) => el('tr', {}, columnas.map((c) => {
        const valor = c.celda(fila);
        return el('td', { class: c.clase, 'data-titulo': c.titulo }, valor ?? '—');
      }))));
      pintarEstado(datos.length ? 'ok' : 'vacio', datos.length ? '' : vacio);
    }
  };
}

/** Paginación: { nodo, actualizar(total, pagina, porPagina) }; llama alCambiar(pagina). */
export function crearPaginacion(alCambiar) {
  const info = el('span', { class: 'paginacion-info', 'aria-live': 'polite' });
  const anterior = el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => alCambiar(pagina - 1) }, 'Anterior');
  const siguiente = el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => alCambiar(pagina + 1) }, 'Siguiente');
  let pagina = 1;
  return {
    nodo: el('nav', { class: 'paginacion', 'aria-label': 'Paginación' }, anterior, info, siguiente),
    actualizar(total, actual, porPagina) {
      pagina = actual;
      const paginas = Math.max(1, Math.ceil(total / porPagina));
      info.textContent = `Página ${actual} de ${paginas} · ${total} registros`;
      anterior.disabled = actual <= 1;
      siguiente.disabled = actual >= paginas;
    }
  };
}

/** Mensaje temporal accesible en la región #admin-aviso. */
export function avisar(texto, tipo = 'ok') {
  const region = document.getElementById('admin-aviso');
  if (!region) return;
  region.dataset.tipo = tipo;
  region.textContent = texto;
  region.hidden = false;
  clearTimeout(avisar.t);
  avisar.t = setTimeout(() => { region.hidden = true; }, tipo === 'error' ? 9000 : 5000);
}

/**
 * Diálogo modal nativo (<dialog>) con un formulario. campos: [{ nombre, etiqueta, tipo?, requerido?,
 * opciones?: [[valor, texto]], valor?, min?, max?, patron?, ayuda?, maxlength?, autocomplete? }]
 * enviar(datos) → Promise; si lanza error, se muestra dentro del diálogo y no se cierra.
 */
export function abrirFormulario({ titulo, descripcion, campos, textoEnviar = 'Guardar', peligro = false, enviar }) {
  const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
  const controles = {};
  const filas = campos.map((c) => {
    const id = `campo-${c.nombre}-${Math.random().toString(36).slice(2, 7)}`;
    let control;
    if (c.tipo === 'select') {
      control = el('select', { id, name: c.nombre, required: c.requerido }, (c.opciones || []).map(([v, t]) => el('option', { value: v }, t)));
      if (c.valor !== undefined && c.valor !== null) control.value = String(c.valor);
    } else if (c.tipo === 'checkbox') {
      control = el('input', { id, name: c.nombre, type: 'checkbox' });
      control.checked = Boolean(c.valor);
    } else if (c.tipo === 'textarea') {
      control = el('textarea', { id, name: c.nombre, required: c.requerido, maxlength: c.maxlength, rows: 3 });
      control.value = c.valor ?? '';
    } else {
      control = el('input', {
        id, name: c.nombre, type: c.tipo || 'text', required: c.requerido, min: c.min, max: c.max,
        pattern: c.patron, maxlength: c.maxlength, minlength: c.minlength, autocomplete: c.autocomplete || 'off',
        inputmode: c.tipo === 'number' ? 'numeric' : undefined, 'aria-describedby': c.ayuda ? `${id}-ayuda` : undefined
      });
      if (c.valor !== undefined && c.valor !== null) control.value = String(c.valor);
    }
    controles[c.nombre] = control;
    const ayuda = c.ayuda ? el('small', { id: `${id}-ayuda`, class: 'form-ayuda' }, c.ayuda) : null;
    return c.tipo === 'checkbox'
      ? el('div', { class: 'form-fila form-fila-check' }, control, el('label', { for: id }, c.etiqueta), ayuda)
      : el('div', { class: 'form-fila' }, el('label', { for: id }, c.etiqueta), control, ayuda);
  });
  const botonEnviar = el('button', { type: 'submit', class: peligro ? 'tecla tecla-peligro' : 'tecla tecla-acento' }, textoEnviar);
  const cancelar = el('button', { type: 'button', class: 'tecla', onclick: () => dialogo.close() }, 'Cancelar');
  const formulario = el('form', { class: 'admin-form', novalidate: true },
    descripcion ? el('p', { class: 'form-descripcion' }, descripcion) : null,
    filas, error, el('div', { class: 'form-acciones' }, cancelar, botonEnviar));
  const idTitulo = `dlg-${Math.random().toString(36).slice(2, 7)}`;
  const dialogo = el('dialog', { class: 'sheet admin-dialogo', 'aria-labelledby': idTitulo },
    el('h2', { id: idTitulo }, titulo), formulario);

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.hidden = true;
    if (!formulario.checkValidity()) {
      const invalido = formulario.querySelector(':invalid');
      error.textContent = invalido ? `Revisa «${invalido.labels?.[0]?.textContent || invalido.name}»: ${invalido.validationMessage}` : 'Revisa el formulario.';
      error.hidden = false;
      invalido?.focus();
      return;
    }
    const datos = {};
    for (const c of campos) {
      const control = controles[c.nombre];
      if (c.tipo === 'checkbox') datos[c.nombre] = control.checked;
      else if (c.tipo === 'number') datos[c.nombre] = control.value === '' ? null : Number(control.value);
      else datos[c.nombre] = control.value.trim() === '' ? null : control.value.trim();
    }
    botonEnviar.disabled = true;
    botonEnviar.setAttribute('aria-busy', 'true');
    try {
      await enviar(datos);
      dialogo.close();
    } catch (e) {
      error.textContent = textoError(e);
      error.hidden = false;
    } finally {
      botonEnviar.disabled = false;
      botonEnviar.removeAttribute('aria-busy');
    }
  });
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
  (filas[0]?.querySelector('input,select,textarea') || botonEnviar).focus();
  return dialogo;
}

/** Diálogo con contenido libre (p. ej. lista de comandos). */
export function abrirPanel({ titulo, contenido }) {
  const idTitulo = `dlg-${Math.random().toString(36).slice(2, 7)}`;
  const cerrar = el('button', { type: 'button', class: 'tecla', onclick: () => dialogo.close() }, 'Cerrar');
  const dialogo = el('dialog', { class: 'sheet admin-dialogo admin-dialogo-ancho', 'aria-labelledby': idTitulo },
    el('h2', { id: idTitulo }, titulo), contenido, el('div', { class: 'form-acciones' }, cerrar));
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
  cerrar.focus();
  return dialogo;
}

/**
 * Pestañas accesibles (patrón WAI-ARIA): flechas, Inicio y Fin mueven el foco; la pestaña activa se
 * recuerda en la URL (#seccion) para poder enlazarla y recargar.
 */
export function montarPestanas(lista, alActivar) {
  const pestanas = [...lista.querySelectorAll('[role=tab]')];
  function activar(pestana, enfocar = false) {
    for (const p of pestanas) {
      const activa = p === pestana;
      p.setAttribute('aria-selected', String(activa));
      p.tabIndex = activa ? 0 : -1;
      document.getElementById(p.getAttribute('aria-controls')).hidden = !activa;
    }
    if (enfocar) pestana.focus();
    history.replaceState(null, '', `#${pestana.dataset.seccion}`);
    alActivar(pestana.dataset.seccion);
  }
  lista.addEventListener('click', (e) => { const p = e.target.closest('[role=tab]'); if (p) activar(p); });
  lista.addEventListener('keydown', (e) => {
    const i = pestanas.indexOf(document.activeElement);
    if (i < 0) return;
    const destino = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: pestanas.length - 1 }[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    activar(pestanas[(destino + pestanas.length) % pestanas.length], true);
  });
  const inicial = pestanas.find((p) => `#${p.dataset.seccion}` === location.hash) || pestanas[0];
  return { activar: (seccion) => activar(pestanas.find((p) => p.dataset.seccion === seccion) || inicial), inicial };
}
