// Reportes de falla (V009): el comprador reporta y puede autorizar soporte temporal; el admin lo revisa,
// prueba la unidad (solo con la autorización vigente) y lo resuelve. Al resolver, la API REVOCA el soporte.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { conParametros } from '../core/layout.js';
import { abrirFormulario, avisar, crearPaginacion, crearTabla, el, etiqueta, fechaHora, textoError } from './ui.js';

const POR_PAGINA = 20;
const ESTADOS = { abierto: ['Abierto', 'aviso'], en_revision: ['En revisión', 'acento'], resuelto: ['Resuelto', 'ok'] };

export function crearReportes(contenedor) {
  let cargado = false;
  let pagina = 1;
  const filtro = el('select', { id: 'reportes-estado' },
    el('option', { value: '' }, 'Todos'), el('option', { value: 'abierto' }, 'Abiertos'),
    el('option', { value: 'en_revision' }, 'En revisión'), el('option', { value: 'resuelto' }, 'Resueltos'));
  filtro.addEventListener('change', () => cargar(true, 1));

  const tabla = crearTabla({
    titulo: 'Reportes de falla de los compradores',
    columnas: [
      { titulo: 'Reporte', celda: (r) => el('span', { class: 'celda-doble' }, el('strong', {}, `#${r.id_reporte} · ${r.descripcion}`), el('small', {}, fechaHora(r.creado_en))) },
      { titulo: 'Unidad', celda: (r) => el('span', { class: 'celda-doble' }, el('strong', {}, r.vehiculo), el('small', {}, `ID ${r.id_vehiculo} · ${r.comprador} (${r.email})`)) },
      { titulo: 'Estado', celda: (r) => { const [t, tipo] = ESTADOS[r.estado] || [r.estado, 'neutro']; return el('span', { class: 'celda-doble' }, etiqueta(t, tipo), r.respuesta ? el('small', {}, r.respuesta) : null); } },
      { titulo: 'Acceso temporal', celda: (r) => (r.soporte_hasta
        ? el('span', { class: 'celda-doble' }, etiqueta('Autorizado', 'ok'), el('small', {}, 'hasta ', fechaHora(r.soporte_hasta)))
        : etiqueta(r.estado === 'resuelto' ? 'Revocado' : 'Sin autorización', 'neutro')) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (r) => (r.estado === 'resuelto' ? fechaHora(r.resuelto_en) : el('span', { class: 'acciones' },
        r.soporte_hasta ? el('a', { class: 'tecla tecla-chica tecla-acento', href: conParametros('index.html', { vehiculo: r.id_vehiculo }) }, 'Probar unidad') : null,
        r.estado === 'abierto' ? el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => atender(r, 'en_revision') }, 'En revisión') : null,
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => atender(r, 'resuelto') }, 'Resolver'))) }
    ]
  });
  const paginacion = crearPaginacion((p) => cargar(true, p));
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Reportes de falla')),
    el('p', { class: 'admin-sub' }, 'Una unidad vendida solo se opera con la autorización temporal de su comprador. Al resolver el reporte, esa autorización se revoca.'),
    el('div', { class: 'filtros' }, el('label', { for: 'reportes-estado' }, 'Mostrar', filtro)),
    tabla.nodo, paginacion.nodo);

  async function cargar(forzar = false, nuevaPagina = pagina) {
    if (cargado && !forzar) return;
    pagina = nuevaPagina;
    tabla.cargando();
    const query = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA) });
    if (filtro.value) query.set('estado', filtro.value);
    try {
      const r = await request(`${ADMIN_ROUTES.reportes}?${query}`, { auth: true });
      tabla.filas(r.items || [], 'No hay reportes con ese filtro.');
      paginacion.actualizar(r.total, r.pagina, r.por_pagina);
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudieron cargar los reportes: ${textoError(error)}`, () => cargar(true));
    }
  }

  function atender(r, estado) {
    const resolver = estado === 'resuelto';
    abrirFormulario({
      titulo: `${resolver ? 'Resolver' : 'Revisar'} reporte #${r.id_reporte}`,
      descripcion: resolver ? 'Al resolverlo se revoca el acceso temporal a la unidad: dejarás de poder operarla.' : 'El comprador verá que su reporte está en revisión.',
      campos: [{ nombre: 'respuesta', etiqueta: 'Respuesta al comprador', tipo: 'textarea', maxlength: 500, requerido: resolver }],
      textoEnviar: resolver ? 'Resolver y revocar acceso' : 'Marcar en revisión',
      enviar: async (d) => {
        const res = await request(ADMIN_ROUTES.reporte(r.id_reporte), { method: 'PUT', auth: true, body: { estado, respuesta: d.respuesta || null } });
        avisar(resolver ? `Reporte resuelto${res.soportes_revocados ? ' · acceso temporal revocado' : ''}.` : 'Reporte en revisión.');
        await cargar(true);
      }
    });
  }
  return { cargar };
}
