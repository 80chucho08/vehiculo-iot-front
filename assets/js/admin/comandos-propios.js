// Comandos propios del comprador (V009). Un comando propio es un nombre tuyo para un movimiento físico
// que la unidad YA tiene registrado: la lista de movimientos sale de la API y el servidor rechaza (422)
// cualquier código que no sea un movimiento de fábrica activo. Los de fábrica no se pueden modificar ni
// eliminar; aquí solo se muestran como base.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { conParametros } from '../core/layout.js';
import { abrirFormulario, abrirPanel, avisar, el, etiqueta, textoError } from './ui.js';

export async function abrirComandosDeUnidad(unidad) {
  const propios = el('div', { class: 'comandos-lista' }, el('p', { class: 'admin-estado', 'data-estado': 'cargando' }, 'Cargando comandos…'));
  const base = el('div', { class: 'acciones', role: 'list', 'aria-label': 'Movimientos de fábrica' });
  const nuevo = el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', disabled: true }, 'Nuevo comando');
  abrirPanel({
    titulo: `Comandos · ${unidad.nombre}`,
    contenido: el('div', {},
      el('p', { class: 'admin-sub' }, 'Crea comandos con tu propio nombre a partir de los movimientos que tu carrito ya tiene registrados. Aparecen en CONTROL («Mis comandos») y en el editor de demos. Solo puedes eliminar los que creaste tú.'),
      el('div', { class: 'seccion-cabecera' }, nuevo,
        el('a', { class: 'tecla tecla-chica', href: conParametros('index.html', { vehiculo: unidad.id_vehiculo }) }, 'Usar en CONTROL')),
      el('h3', { class: 'editor-subtitulo' }, 'Mis comandos'), propios,
      el('h3', { class: 'editor-subtitulo' }, 'Movimientos de fábrica (no se modifican)'), base)
  });

  let movimientos = [];
  async function cargar() {
    let r;
    try {
      r = await request(ADMIN_ROUTES.misComandos(unidad.id_vehiculo), { auth: true });
    } catch (error) {
      propios.replaceChildren(el('p', { class: 'admin-estado', 'data-estado': 'error' }, textoError(error)));
      return;
    }
    movimientos = r.movimientos || [];
    nuevo.disabled = !movimientos.length;
    base.replaceChildren(...movimientos.map((m) => el('span', { role: 'listitem' }, etiqueta(`${m.codigo} · ${m.nombre}`, 'neutro'))));
    const filas = (r.comandos || []).map((c) => el('article', { class: 'demo-tarjeta' },
      el('div', { class: 'demo-tarjeta-titulo' }, el('h3', {}, c.nombre), etiqueta('Propio', 'acento')),
      el('p', { class: 'admin-sub' }, `Movimiento ${c.codigo}${c.movimiento_base ? ` · ${c.movimiento_base}` : ''}${c.duracion_max_ms ? ` · tope ${c.duracion_max_ms} ms por paso` : ''}${c.descripcion ? ` · ${c.descripcion}` : ''}`),
      el('div', { class: 'acciones' }, el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => eliminar(c) }, 'Eliminar'))));
    propios.replaceChildren(...(filas.length ? filas : [el('p', { class: 'admin-estado', 'data-estado': 'vacio' }, 'Todavía no creas comandos propios.')]));
  }

  async function eliminar(c) {
    if (!window.confirm(`¿Eliminar el comando «${c.nombre}»?`)) return;
    try {
      await request(ADMIN_ROUTES.miComando(unidad.id_vehiculo, c.id_comando), { method: 'DELETE', auth: true });
      avisar(`Comando «${c.nombre}» eliminado.`);
      await cargar();
    } catch (error) { avisar(textoError(error), 'error'); }
  }

  nuevo.addEventListener('click', () => abrirFormulario({
    titulo: `Nuevo comando · ${unidad.nombre}`,
    descripcion: 'Elige un movimiento registrado del carrito y dale tu nombre. No se pueden crear movimientos que el carrito no tenga.',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 60, ayuda: 'Ejemplo: Subir garra suave' },
      { nombre: 'codigo', etiqueta: 'Movimiento', tipo: 'select', requerido: true, opciones: movimientos.map((m) => [m.codigo, `${m.codigo} · ${m.nombre}`]) },
      { nombre: 'duracion_max_ms', etiqueta: 'Tope por paso en demos (ms, opcional)', tipo: 'number', min: 100, max: 10000, ayuda: 'Vacío = el del movimiento de fábrica.' },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255 }
    ],
    textoEnviar: 'Crear',
    enviar: async (d) => {
      await request(ADMIN_ROUTES.misComandos(unidad.id_vehiculo), { method: 'POST', auth: true,
        body: { nombre: d.nombre, codigo: Number(d.codigo), duracion_max_ms: d.duracion_max_ms, descripcion: d.descripcion } });
      avisar(`Comando «${d.nombre}» creado.`);
      await cargar();
    }
  }));
  await cargar();
}

/** Reportar una falla y, opcionalmente, autorizar en el mismo paso el acceso temporal de la empresa. */
export function reportarFalla(unidad, alTerminar) {
  abrirFormulario({
    titulo: `Reportar falla · ${unidad.nombre}`,
    descripcion: 'La empresa no puede operar tu carrito sin tu permiso. Si la autorizas, podrá probarlo durante el tiempo indicado; el acceso se revoca cuando resuelva el reporte o cuando tú lo retires.',
    campos: [
      { nombre: 'descripcion', etiqueta: '¿Qué falla?', tipo: 'textarea', requerido: true, maxlength: 500, ayuda: 'Ejemplo: la garra no baja al usar el joystick.' },
      { nombre: 'autorizar_soporte', etiqueta: 'Autorizar a la empresa a probar mi carrito', tipo: 'checkbox', valor: true },
      { nombre: 'minutos', etiqueta: 'Duración del acceso temporal', tipo: 'select', opciones: [[15, '15 minutos'], [60, '1 hora'], [240, '4 horas'], [1440, '24 horas']], valor: 60 }
    ],
    textoEnviar: 'Enviar reporte',
    enviar: async (d) => {
      if ((d.descripcion || '').length < 5) throw new Error('Describe la falla con al menos 5 caracteres.');
      const r = await request(ADMIN_ROUTES.misReportes(unidad.id_vehiculo), { method: 'POST', auth: true,
        body: { descripcion: d.descripcion, autorizar_soporte: d.autorizar_soporte, minutos: Number(d.minutos) } });
      avisar(`Reporte #${r.id_reporte} enviado${r.soporte ? ' · acceso temporal autorizado' : ''}.`);
      await alTerminar?.();
    }
  });
}

/** Historial de reportes del comprador para una unidad. */
export async function verReportes(unidad) {
  const lista = el('div', { class: 'comandos-lista' }, el('p', { class: 'admin-estado', 'data-estado': 'cargando' }, 'Cargando reportes…'));
  abrirPanel({ titulo: `Reportes · ${unidad.nombre}`, contenido: lista });
  const NOMBRES = { abierto: ['Abierto', 'aviso'], en_revision: ['En revisión', 'acento'], resuelto: ['Resuelto', 'ok'] };
  try {
    const r = await request(ADMIN_ROUTES.misReportes(unidad.id_vehiculo), { auth: true });
    const filas = (r.reportes || []).map((x) => el('article', { class: 'demo-tarjeta' },
      el('div', { class: 'demo-tarjeta-titulo' }, el('h3', {}, `#${x.id_reporte}`), etiqueta(...(NOMBRES[x.estado] || [x.estado, 'neutro']))),
      el('p', {}, x.descripcion),
      x.respuesta ? el('p', { class: 'admin-sub' }, `Respuesta: ${x.respuesta}`) : null));
    lista.replaceChildren(...(filas.length ? filas : [el('p', { class: 'admin-estado', 'data-estado': 'vacio' }, 'No has reportado fallas en esta unidad.')]));
  } catch (error) {
    lista.replaceChildren(el('p', { class: 'admin-estado', 'data-estado': 'error' }, textoError(error)));
  }
}
