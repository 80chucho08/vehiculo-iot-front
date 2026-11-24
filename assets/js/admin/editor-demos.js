// Editor de demos. Comprador: las de fábrica se ven en solo lectura; las privadas se crean, editan
// (agregar, quitar, editar y reordenar pasos) y eliminan. Administrador (V009): gestiona TODAS las demos
// de cualquier unidad, también las privadas de un comprador; crea demos de fábrica. La validación del navegador repite la del
// servidor solo para avisar antes: la que manda es la API (y luego el ejecutor y el firmware).
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { conParametros } from '../core/layout.js';
import { abrirPanel, avisar, el, etiqueta, textoError } from './ui.js';

const rutaDemos = (idVehiculo) => `${ADMIN_ROUTES.misVehiculos}/${encodeURIComponent(idVehiculo)}/demos`;
const rutaDemo = (idVehiculo, idDemo) => `${rutaDemos(idVehiculo)}/${encodeURIComponent(idDemo)}`;
const RUTAS = {
  comprador: { lista: rutaDemos, crear: rutaDemos, demo: rutaDemo },
  admin: { lista: ADMIN_ROUTES.demosAdmin, crear: ADMIN_ROUTES.demosAdmin, demo: (_idVehiculo, idDemo) => ADMIN_ROUTES.demoAdmin(idDemo) }
};
const segundos = (ms) => `${(ms / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 })} s`;
const totalMs = (pasos) => pasos.reduce((s, p) => s + Number(p.duracion_ms || 0) + Number(p.pausa_ms || 0), 0);

function topePaso(comando, limites) {
  return Math.min(limites.duracion_max_paso_ms, comando?.duracion_max_ms || 10000);
}

/** Mismas reglas que app/services/validacion_demos.py. Devuelve una lista de mensajes. */
export function validarPasos(pasos, contexto) {
  const { limites, comandos } = contexto;
  const porId = new Map(comandos.map((c) => [c.id_comando, c]));
  const errores = [];
  if (!pasos.length) return ['La demo necesita al menos un paso.'];
  if (pasos.length > limites.pasos_max_demo) errores.push(`El modelo permite como máximo ${limites.pasos_max_demo} pasos.`);
  pasos.forEach((p, i) => {
    const comando = porId.get(Number(p.id_comando));
    if (!comando) { errores.push(`Paso ${i + 1}: elige un movimiento.`); return; }
    const tope = topePaso(comando, limites);
    if (!(p.duracion_ms >= limites.paso_min_ms && p.duracion_ms <= tope)) errores.push(`Paso ${i + 1}: la duración debe estar entre ${limites.paso_min_ms} y ${tope} ms.`);
    if (!(p.pausa_ms >= 0 && p.pausa_ms <= limites.pausa_max_ms)) errores.push(`Paso ${i + 1}: la pausa debe estar entre 0 y ${limites.pausa_max_ms} ms.`);
  });
  if (totalMs(pasos) > limites.total_max_ms) errores.push(`La demo dura ${segundos(totalMs(pasos))}; el máximo es ${segundos(limites.total_max_ms)}.`);
  return errores;
}

export async function abrirDemosDeUnidad(unidad, { admin = false } = {}) {
  const rutas = admin ? RUTAS.admin : RUTAS.comprador;
  const lista = el('div', { class: 'demos-lista' }, el('p', { class: 'admin-estado', 'data-estado': 'cargando' }, 'Cargando demos…'));
  const nueva = el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', disabled: true }, 'Nueva demo');
  const enlaceControl = el('a', { class: 'tecla tecla-chica', href: conParametros('index.html', { vehiculo: unidad.id_vehiculo }) }, 'Ejecutar en CONTROL');
  const panel = abrirPanel({
    titulo: `Demos · ${unidad.nombre}`,
    contenido: el('div', {},
      el('p', { class: 'admin-sub' }, admin
        ? 'Gestionas todas las demos de la unidad, también las privadas de su comprador. Las nuevas son de fábrica: el comprador las ve y ejecuta, pero no puede modificarlas. Ejecutarlas en una unidad vendida requiere su autorización de soporte.'
        : 'Las demos de fábrica no se pueden modificar. Las tuyas (privadas) sí. Se ejecutan desde CONTROL, donde DETENER siempre tiene prioridad y la cancela.'),
      el('div', { class: 'seccion-cabecera' }, nueva, enlaceControl), lista)
  });

  let contexto = null;
  async function cargar() {
    try {
      contexto = await request(rutas.lista(unidad.id_vehiculo), { auth: true });
    } catch (error) {
      lista.replaceChildren(el('p', { class: 'admin-estado', 'data-estado': 'error' }, textoError(error)));
      return;
    }
    nueva.disabled = !contexto.comandos.length;
    const tarjetas = contexto.demos.map((d) => el('article', { class: 'demo-tarjeta' },
      el('div', { class: 'demo-tarjeta-titulo' }, el('h3', {}, d.nombre),
        d.tipo === 'privada' ? etiqueta(admin && d.propietario ? `Privada · ${d.propietario}` : 'Privada', 'acento') : etiqueta('De fábrica', 'neutro'),
        d.activo ? null : etiqueta('Inactiva', 'error')),
      el('p', { class: 'admin-sub' }, `${d.pasos.length} paso${d.pasos.length === 1 ? '' : 's'} · ${segundos(totalMs(d.pasos))}${d.descripcion ? ` · ${d.descripcion}` : ''}`),
      el('ol', { class: 'demo-pasos-resumen' }, d.pasos.map((p) => el('li', {}, `${p.comando} · ${p.duracion_ms} ms${p.pausa_ms ? ` + pausa ${p.pausa_ms} ms` : ''}`))),
      d.editable ? el('div', { class: 'acciones' },
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => editar(d) }, 'Editar'),
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => eliminar(d) }, 'Eliminar')) : null));
    lista.replaceChildren(...(tarjetas.length ? tarjetas : [el('p', { class: 'admin-estado', 'data-estado': 'vacio' }, 'Esta unidad no tiene demos.')]));
  }

  async function eliminar(d) {
    if (!window.confirm(`¿Eliminar la demo «${d.nombre}»? No se puede deshacer.`)) return;
    try {
      await request(rutas.demo(unidad.id_vehiculo, d.id_demo), { method: 'DELETE', auth: true });
      avisar(`Demo «${d.nombre}» eliminada.`);
      await cargar();
    } catch (error) { avisar(textoError(error), 'error'); }
  }

  function editar(demo) {
    abrirEditor({ unidad, contexto, demo, rutas, alGuardar: cargar });
  }
  nueva.addEventListener('click', () => editar(null));
  await cargar();
  return panel;
}

function abrirEditor({ unidad, contexto, demo, rutas, alGuardar }) {
  const { limites, comandos } = contexto;
  const porId = new Map(comandos.map((c) => [c.id_comando, c]));
  // Copia de trabajo: nada se guarda hasta pulsar "Guardar".
  const pasos = (demo?.pasos || []).filter((p) => porId.has(p.id_comando))
    .map((p) => ({ id_comando: p.id_comando, duracion_ms: p.duracion_ms, pausa_ms: p.pausa_ms }));
  if (!pasos.length) pasos.push({ id_comando: comandos[0].id_comando, duracion_ms: 1000, pausa_ms: 0 });

  const nombre = el('input', { id: 'demo-nombre', required: true, maxlength: 80, autocomplete: 'off' });
  nombre.value = demo?.nombre || '';
  const descripcion = el('input', { id: 'demo-descripcion', maxlength: 255, autocomplete: 'off' });
  descripcion.value = demo?.descripcion || '';
  const activo = el('input', { id: 'demo-activo', type: 'checkbox' });
  activo.checked = demo ? Boolean(demo.activo) : true;
  const listaPasos = el('ol', { class: 'editor-pasos', 'aria-label': 'Pasos de la demo, en orden de ejecución' });
  const resumen = el('p', { class: 'editor-resumen', 'aria-live': 'polite' });
  const errores = el('div', { class: 'form-error', role: 'alert', hidden: true });
  const agregar = el('button', { type: 'button', class: 'tecla tecla-chica' }, 'Agregar paso');
  const guardar = el('button', { type: 'submit', class: 'tecla tecla-acento' }, 'Guardar');
  const cancelar = el('button', { type: 'button', class: 'tecla' }, 'Cancelar');

  function pintar(enfocar) {
    listaPasos.replaceChildren(...pasos.map((p, i) => {
      const id = `paso-${i}`;
      const select = el('select', { id: `${id}-cmd`, 'aria-label': `Paso ${i + 1}: movimiento` },
        comandos.map((c) => el('option', { value: c.id_comando }, `${c.codigo} · ${c.nombre}${c.tipo === 'usuario' ? ' (propio)' : ''}`)));
      select.value = String(p.id_comando);
      const tope = topePaso(porId.get(Number(p.id_comando)), limites);
      const duracion = el('input', { id: `${id}-dur`, type: 'number', min: limites.paso_min_ms, max: tope, step: 100, inputmode: 'numeric', 'aria-label': `Paso ${i + 1}: duración en milisegundos (máximo ${tope})` });
      duracion.value = String(p.duracion_ms);
      const pausa = el('input', { id: `${id}-pau`, type: 'number', min: 0, max: limites.pausa_max_ms, step: 100, inputmode: 'numeric', 'aria-label': `Paso ${i + 1}: pausa en milisegundos` });
      pausa.value = String(p.pausa_ms);
      select.addEventListener('change', () => { p.id_comando = Number(select.value); pintar(`${id}-cmd`); });
      duracion.addEventListener('input', () => { p.duracion_ms = Number(duracion.value); actualizarResumen(); });
      pausa.addEventListener('input', () => { p.pausa_ms = Number(pausa.value); actualizarResumen(); });
      const mover = (delta, sufijo) => {
        const destino = i + delta;
        [pasos[i], pasos[destino]] = [pasos[destino], pasos[i]];
        pintar(`paso-${destino}-${sufijo}`);
      };
      return el('li', { class: 'editor-paso' },
        el('span', { class: 'editor-paso-num', 'aria-hidden': 'true' }, String(i + 1)),
        el('label', { for: `${id}-cmd`, class: 'editor-campo editor-campo-cmd' }, el('span', {}, 'Movimiento'), select),
        el('label', { for: `${id}-dur`, class: 'editor-campo' }, el('span', {}, `Duración ms (≤ ${tope})`), duracion),
        el('label', { for: `${id}-pau`, class: 'editor-campo' }, el('span', {}, 'Pausa ms'), pausa),
        el('span', { class: 'editor-paso-acciones' },
          el('button', { type: 'button', id: `${id}-arr`, class: 'tecla tecla-chica', disabled: i === 0, 'aria-label': `Subir paso ${i + 1}`, onclick: () => mover(-1, 'arr') }, '↑'),
          el('button', { type: 'button', id: `${id}-aba`, class: 'tecla tecla-chica', disabled: i === pasos.length - 1, 'aria-label': `Bajar paso ${i + 1}`, onclick: () => mover(1, 'aba') }, '↓'),
          el('button', { type: 'button', class: 'tecla tecla-chica', disabled: pasos.length === 1, 'aria-label': `Quitar paso ${i + 1}`,
            onclick: () => { pasos.splice(i, 1); pintar(`paso-${Math.min(i, pasos.length - 1)}-cmd`); } }, '✕')));
    }));
    agregar.disabled = pasos.length >= limites.pasos_max_demo;
    actualizarResumen();
    if (enfocar) {
      // Si el botón destino quedó deshabilitado (p. ej. ↑ en el primer paso), el foco pasa al selector
      // de ese mismo paso: nunca se pierde al <body>.
      const objetivo = document.getElementById(enfocar);
      const paso = enfocar.match(/^paso-(\d+)/)?.[1];
      (objetivo && !objetivo.disabled ? objetivo : document.getElementById(`paso-${paso}-cmd`) || listaPasos.querySelector('select'))?.focus();
    }
  }

  function actualizarResumen() {
    const total = totalMs(pasos);
    resumen.dataset.estado = total > limites.total_max_ms ? 'error' : 'ok';
    resumen.textContent = `${pasos.length} de ${limites.pasos_max_demo} pasos · duración total ${segundos(total)} de ${segundos(limites.total_max_ms)} · máximo ${limites.duracion_max_paso_ms} ms por paso (modelo)`;
  }

  agregar.addEventListener('click', () => {
    const ultimo = pasos[pasos.length - 1];
    pasos.push({ id_comando: ultimo?.id_comando ?? comandos[0].id_comando, duracion_ms: 1000, pausa_ms: 0 });
    pintar(`paso-${pasos.length - 1}-cmd`);
  });

  const formulario = el('form', { class: 'admin-form editor-demo', novalidate: true },
    el('div', { class: 'form-fila' }, el('label', { for: 'demo-nombre' }, 'Nombre'), nombre),
    el('div', { class: 'form-fila' }, el('label', { for: 'demo-descripcion' }, 'Descripción'), descripcion),
    el('div', { class: 'form-fila form-fila-check' }, activo, el('label', { for: 'demo-activo' }, 'Activa (aparece en CONTROL)')),
    el('h3', { class: 'editor-subtitulo' }, 'Pasos'), listaPasos,
    el('div', { class: 'seccion-cabecera' }, agregar, resumen),
    errores, el('div', { class: 'form-acciones' }, cancelar, guardar));

  formulario.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const problemas = nombre.value.trim() ? validarPasos(pasos, contexto) : ['Escribe un nombre para la demo.', ...validarPasos(pasos, contexto)];
    if (problemas.length) {
      errores.replaceChildren(el('p', {}, 'Revisa la demo:'), el('ul', {}, problemas.map((m) => el('li', {}, m))));
      errores.hidden = false;
      return;
    }
    errores.hidden = true;
    guardar.disabled = true;
    const cuerpo = { nombre: nombre.value.trim(), descripcion: descripcion.value.trim() || null, activo: activo.checked, pasos };
    try {
      await request(demo ? rutas.demo(unidad.id_vehiculo, demo.id_demo) : rutas.crear(unidad.id_vehiculo),
        { method: demo ? 'PUT' : 'POST', auth: true, body: cuerpo });
      dialogo.close();
      avisar(demo ? 'Demo guardada.' : 'Demo creada. Ya aparece en CONTROL para esta unidad.');
      await alGuardar();
    } catch (error) {
      errores.replaceChildren(el('p', {}, textoError(error)));
      errores.hidden = false;
    } finally { guardar.disabled = false; }
  });

  const dialogo = el('dialog', { class: 'sheet admin-dialogo admin-dialogo-ancho', 'aria-labelledby': 'editor-titulo' },
    el('h2', { id: 'editor-titulo' }, demo ? `Editar «${demo.nombre}»` : `Nueva demo · ${unidad.nombre}`), formulario);
  cancelar.addEventListener('click', () => dialogo.close());
  dialogo.addEventListener('close', () => dialogo.remove());
  document.body.append(dialogo);
  dialogo.showModal();
  pintar();
  nombre.focus();
}
