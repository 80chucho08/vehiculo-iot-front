// Asignaciones: registrar la venta de una unidad a un comprador y finalizarla (historial de propiedad).
// La API impone una sola asignación vigente por unidad y rechaza unidades de exhibición o de baja.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { abrirFormulario, avisar, crearPaginacion, crearTabla, el, etiqueta, fechaHora, textoError } from './ui.js';

const POR_PAGINA = 20;

export function crearAsignaciones(contenedor) {
  let cargado = false;
  let pagina = 1;
  const vigentes = el('select', { id: 'asig-vigentes' },
    el('option', { value: 'true' }, 'Vigentes'), el('option', { value: 'false' }, 'Finalizadas'), el('option', { value: '' }, 'Todas'));
  vigentes.addEventListener('change', () => cargar(true, 1));

  const tabla = crearTabla({
    titulo: 'Asignaciones de unidades a compradores',
    columnas: [
      { titulo: 'Unidad', celda: (a) => el('span', { class: 'celda-doble' }, el('strong', {}, a.vehiculo), el('small', {}, `ID ${a.id_vehiculo} · ${a.numero_serie || 'sin serie'}`)) },
      { titulo: 'Comprador', celda: (a) => el('span', { class: 'celda-doble' }, el('strong', {}, a.comprador), el('small', {}, a.email)) },
      { titulo: 'Desde', celda: (a) => fechaHora(a.inicio) },
      { titulo: 'Estado', celda: (a) => (a.fin ? el('span', { class: 'celda-doble' }, etiqueta('Finalizada', 'neutro'), el('small', {}, a.motivo_fin || '')) : etiqueta('Vigente', 'ok')) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (a) => (a.fin ? fechaHora(a.fin)
        : el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => finalizar(a), 'aria-label': `Finalizar asignación de ${a.vehiculo}` }, 'Finalizar')) }
    ]
  });
  const paginacion = crearPaginacion((p) => cargar(true, p));
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Asignaciones'),
      el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', onclick: asignar }, 'Asignar unidad')),
    el('div', { class: 'filtros' }, el('label', { for: 'asig-vigentes' }, 'Mostrar', vigentes)),
    tabla.nodo, paginacion.nodo);

  async function cargar(forzar = false, nuevaPagina = pagina) {
    if (cargado && !forzar) return;
    pagina = nuevaPagina;
    tabla.cargando();
    const query = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA) });
    if (vigentes.value) query.set('vigentes', vigentes.value);
    try {
      const r = await request(`${ADMIN_ROUTES.asignaciones}?${query}`, { auth: true });
      tabla.filas(r.items || [], vigentes.value === 'true' ? 'No hay unidades vendidas.' : 'No hay asignaciones.');
      paginacion.actualizar(r.total, r.pagina, r.por_pagina);
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudieron cargar las asignaciones: ${textoError(error)}`, () => cargar(true));
    }
  }

  async function asignar() {
    let unidades, compradores;
    try {
      const [inv, us] = await Promise.all([
        request(ADMIN_ROUTES.inventario, { auth: true }),
        request(`${ADMIN_ROUTES.usuarios}?rol=usuario&activo=true&por_pagina=100`, { auth: true })
      ]);
      unidades = (inv.unidades || []).filter((u) => u.tipo_unidad === 'venta' && u.activo && !u.id_propietario);
      compradores = us.items || [];
    } catch (error) { avisar(textoError(error), 'error'); return; }
    if (!unidades.length) { avisar('No hay unidades de venta disponibles (activas y sin comprador).', 'error'); return; }
    if (!compradores.length) { avisar('No hay compradores activos. Crea uno en Clientes.', 'error'); return; }
    abrirFormulario({
      titulo: 'Asignar unidad a un comprador',
      descripcion: 'Solo aparecen unidades de venta activas sin comprador y cuentas de comprador activas.',
      campos: [
        { nombre: 'id_vehiculo', etiqueta: 'Unidad', tipo: 'select', requerido: true, opciones: unidades.map((u) => [u.id_vehiculo, `${u.nombre} · ${u.numero_serie || `ID ${u.id_vehiculo}`}`]) },
        { nombre: 'id_usuario', etiqueta: 'Comprador', tipo: 'select', requerido: true, opciones: compradores.map((c) => [c.id_usuario, `${c.nombre} · ${c.email}`]) }
      ],
      textoEnviar: 'Asignar',
      enviar: async (d) => {
        await request(ADMIN_ROUTES.asignaciones, { method: 'POST', auth: true, body: { id_vehiculo: Number(d.id_vehiculo), id_usuario: Number(d.id_usuario) } });
        avisar('Unidad asignada. El comprador ya la ve en Mis vehículos.');
        await cargar(true, 1);
      }
    });
  }

  function finalizar(a) {
    abrirFormulario({
      titulo: `Finalizar asignación de ${a.vehiculo}`,
      descripcion: `${a.comprador} dejará de ver y controlar la unidad y se revocará cualquier soporte autorizado. El historial se conserva.`,
      campos: [{ nombre: 'motivo', etiqueta: 'Motivo', requerido: true, minlength: 3, maxlength: 255 }],
      textoEnviar: 'Finalizar', peligro: true,
      enviar: async (d) => {
        await request(ADMIN_ROUTES.finalizarAsignacion(a.id_asignacion), { method: 'POST', auth: true, body: d });
        avisar('Asignación finalizada; la unidad volvió al inventario.');
        await cargar(true);
      }
    });
  }
  return { cargar };
}
