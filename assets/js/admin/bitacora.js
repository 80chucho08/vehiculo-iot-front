// Bitácora: auditoría de altas, asignaciones, roles, soporte, sesiones y accesos denegados (solo lectura).
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { crearPaginacion, crearTabla, el, etiqueta, fechaHora, textoError } from './ui.js';

const POR_PAGINA = 50;
const RESULTADO = { ok: ['Correcto', 'ok'], denegado: ['Denegado', 'aviso'], error: ['Error', 'error'] };

function resumenDetalle(detalle) {
  if (!detalle || typeof detalle !== 'object') return '';
  return Object.entries(detalle).filter(([k]) => k !== 'ruta').map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
}

export function crearBitacora(contenedor) {
  let cargado = false;
  let pagina = 1;
  const accion = el('input', { type: 'search', id: 'bit-accion', maxlength: 60, placeholder: 'p. ej. asignacion.crear', autocomplete: 'off' });
  const resultado = el('select', { id: 'bit-resultado' }, el('option', { value: '' }, 'Todos'),
    Object.entries(RESULTADO).map(([v, [t]]) => el('option', { value: v }, t)));
  const filtros = el('form', { class: 'filtros', role: 'search', 'aria-label': 'Filtrar bitácora' },
    el('label', { for: 'bit-accion' }, 'Acción exacta', accion),
    el('label', { for: 'bit-resultado' }, 'Resultado', resultado),
    el('button', { type: 'submit', class: 'tecla tecla-chica' }, 'Filtrar'));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); cargar(true, 1); });

  const tabla = crearTabla({
    titulo: 'Bitácora de auditoría, de la más reciente a la más antigua',
    columnas: [
      { titulo: 'Fecha', celda: (a) => fechaHora(a.fecha) },
      { titulo: 'Actor', celda: (a) => el('span', { class: 'celda-doble' }, el('strong', {}, a.actor || '—'), el('small', {}, a.rol_actor)) },
      { titulo: 'Acción', celda: (a) => el('code', {}, a.accion) },
      { titulo: 'Recurso', celda: (a) => `${a.recurso}${a.id_recurso ? ` ${a.id_recurso}` : ''}` },
      { titulo: 'Resultado', celda: (a) => etiqueta(...(RESULTADO[a.resultado] || [a.resultado, 'neutro'])) },
      { titulo: 'Detalle', clase: 'col-detalle', celda: (a) => el('small', {}, resumenDetalle(a.detalle)) }
    ]
  });
  const paginacion = crearPaginacion((p) => cargar(true, p));
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Bitácora de auditoría'),
      el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => cargar(true, 1) }, 'Actualizar')),
    el('p', { class: 'admin-sub' }, 'Registro de solo inserción: la API no permite editar ni borrar entradas. No guarda contraseñas ni tokens.'),
    filtros, tabla.nodo, paginacion.nodo);

  async function cargar(forzar = false, nuevaPagina = pagina) {
    if (cargado && !forzar) return;
    pagina = nuevaPagina;
    tabla.cargando();
    const query = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA) });
    if (accion.value.trim()) query.set('accion', accion.value.trim());
    if (resultado.value) query.set('resultado', resultado.value);
    try {
      const r = await request(`${ADMIN_ROUTES.auditoria}?${query}`, { auth: true });
      tabla.filas(r.items || [], 'Sin registros con esos filtros.');
      paginacion.actualizar(r.total, r.pagina, r.por_pagina);
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudo cargar la bitácora: ${textoError(error)}`, () => cargar(true));
    }
  }
  return { cargar };
}
