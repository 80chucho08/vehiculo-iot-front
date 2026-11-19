// Inventario: unidades físicas (vehiculos) con modelo, serie, tipo y comprador vigente.
// Alta y edición comercial, y comandos permitidos por unidad (activo, invitados, tope de duración).
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { abrirFormulario, abrirPanel, avisar, crearTabla, el, etiqueta, textoError } from './ui.js';

const TIPOS = [['venta', 'Venta'], ['exhibicion', 'Exhibición'], ['simulada', 'Simulada']];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const PATRON_SERIE = '[A-Z0-9][A-Z0-9\\-]{2,39}';

export function crearInventario(contenedor) {
  let modelos = [];
  let cargado = false;

  const tabla = crearTabla({
    titulo: 'Unidades del inventario',
    columnas: [
      { titulo: 'Unidad', celda: (u) => el('span', { class: 'celda-doble' }, el('strong', {}, u.nombre), el('small', {}, `ID ${u.id_vehiculo} · ${u.numero_serie || 'sin serie'}`)) },
      { titulo: 'Modelo', celda: (u) => u.modelo || '—' },
      { titulo: 'Tipo', celda: (u) => etiqueta(NOMBRE_TIPO[u.tipo_unidad] || u.tipo_unidad, u.tipo_unidad === 'exhibicion' ? 'acento' : 'neutro') },
      { titulo: 'Estado', celda: (u) => (u.activo ? etiqueta('Activa', 'ok') : etiqueta('De baja', 'error')) },
      { titulo: 'Comprador', celda: (u) => (u.propietario ? u.propietario : el('span', { class: 'texto-tenue' }, u.tipo_unidad === 'venta' ? 'Disponible' : 'No se vende')) },
      { titulo: 'Dispositivo', celda: (u) => (u.dispositivo_conectado ? etiqueta('En línea', 'ok') : etiqueta('Sin conexión', 'neutro')) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (u) => el('span', { class: 'acciones' },
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => editar(u), 'aria-label': `Editar ${u.nombre}` }, 'Editar'),
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => comandos(u), 'aria-label': `Comandos de ${u.nombre}` }, 'Comandos')) }
    ]
  });
  const nueva = el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', onclick: () => alta() }, 'Nueva unidad');
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Inventario de unidades'), nueva),
    el('p', { class: 'admin-sub' }, 'Una unidad vendida solo la opera su comprador; para operarla necesitas su autorización de soporte.'),
    tabla.nodo);

  async function cargar(forzar = false) {
    if (cargado && !forzar) return;
    tabla.cargando();
    try {
      const [inv, mods] = await Promise.all([request(ADMIN_ROUTES.inventario, { auth: true }), request(ADMIN_ROUTES.modelos, { auth: true })]);
      modelos = mods.modelos || [];
      tabla.filas(inv.unidades || [], 'Aún no hay unidades registradas.');
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudo cargar el inventario: ${textoError(error)}`, () => cargar(true));
    }
  }

  function alta() {
    const disponibles = modelos.filter((m) => m.activo);
    if (!disponibles.length) { avisar('Primero registra un modelo activo en la pestaña Modelos.', 'error'); return; }
    abrirFormulario({
      titulo: 'Nueva unidad',
      descripcion: 'Se copian los comandos y las demos de fábrica de otra unidad del mismo modelo.',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80 },
        { nombre: 'id_modelo', etiqueta: 'Modelo', tipo: 'select', requerido: true, opciones: disponibles.map((m) => [m.id_modelo, m.nombre]) },
        { nombre: 'numero_serie', etiqueta: 'Número de serie', requerido: true, patron: PATRON_SERIE, maxlength: 40, ayuda: 'Mayúsculas, dígitos y guiones. Ejemplo: CJ-2026-0002' },
        { nombre: 'tipo_unidad', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS, valor: 'venta' },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255 }
      ],
      textoEnviar: 'Registrar',
      enviar: async (d) => {
        const r = await request(ADMIN_ROUTES.unidades, { method: 'POST', auth: true, body: { ...d, id_modelo: Number(d.id_modelo), numero_serie: d.numero_serie.toUpperCase() } });
        const demos = `${r.demos_copiadas} demo${r.demos_copiadas === 1 ? '' : 's'}`;
        avisar(`Unidad ${r.id_vehiculo} registrada · ${r.comandos_copiados} comandos y ${demos} copiados${r.plantilla ? ` de la unidad ${r.plantilla}` : ' (sin plantilla: agrega comandos)'}.`);
        await cargar(true);
      }
    });
  }

  function editar(u) {
    abrirFormulario({
      titulo: `Editar ${u.nombre}`,
      descripcion: u.propietario ? 'Vendida: no puede cambiar de tipo ni darse de baja hasta finalizar la asignación.' : null,
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80, valor: u.nombre },
        { nombre: 'numero_serie', etiqueta: 'Número de serie', requerido: true, patron: PATRON_SERIE, maxlength: 40, valor: u.numero_serie },
        { nombre: 'tipo_unidad', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS, valor: u.tipo_unidad },
        { nombre: 'microcontrolador', etiqueta: 'Microcontrolador', maxlength: 50, valor: u.microcontrolador },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255, valor: u.descripcion },
        { nombre: 'activo', etiqueta: 'Unidad activa (desmarcar = baja lógica, conserva el historial)', tipo: 'checkbox', valor: Boolean(u.activo) }
      ],
      enviar: async (d) => {
        await request(ADMIN_ROUTES.unidad(u.id_vehiculo), { method: 'PUT', auth: true, body: { ...d, numero_serie: d.numero_serie.toUpperCase() } });
        avisar(`Unidad ${u.id_vehiculo} actualizada.`);
        await cargar(true);
      }
    });
  }

  async function comandos(u) {
    const lista = el('div', { class: 'comandos-lista' }, el('p', { class: 'admin-estado', 'data-estado': 'cargando' }, 'Cargando comandos…'));
    abrirPanel({ titulo: `Comandos de ${u.nombre}`, contenido: el('div', {},
      el('p', { class: 'admin-sub' }, 'Activo: disponible en CONTROL. Invitados: permitido en la prueba temporal (solo movimientos 1-12). Tope: duración máxima por paso de demo.'),
      lista) });
    try {
      const r = await request(ADMIN_ROUTES.comandosUnidad(u.id_vehiculo), { auth: true });
      const filas = (r.comandos || []).map((c) => filaComando(c));
      lista.replaceChildren(...(filas.length ? filas : [el('p', { class: 'admin-estado', 'data-estado': 'vacio' }, 'Esta unidad no tiene comandos.')]));
    } catch (error) {
      lista.replaceChildren(el('p', { class: 'admin-estado', 'data-estado': 'error' }, textoError(error)));
    }
  }

  function filaComando(c) {
    const id = `cmd-${c.id_comando}`;
    const activo = el('input', { type: 'checkbox', id: `${id}-a` }); activo.checked = Boolean(c.activo);
    const invitado = el('input', { type: 'checkbox', id: `${id}-i`, disabled: !(c.codigo >= 1 && c.codigo <= 12) }); invitado.checked = Boolean(c.permitido_invitado);
    const tope = el('input', { type: 'number', id: `${id}-t`, min: 100, max: 10000, step: 100, inputmode: 'numeric', placeholder: 'modelo' });
    if (c.duracion_max_ms) tope.value = String(c.duracion_max_ms);
    const estado = el('span', { class: 'comando-estado', role: 'status' });
    const guardar = el('button', { type: 'button', class: 'tecla tecla-chica' }, 'Guardar');
    guardar.addEventListener('click', async () => {
      if (!tope.checkValidity()) { estado.textContent = 'Tope entre 100 y 10 000 ms'; return; }
      guardar.disabled = true; estado.textContent = 'Guardando…';
      try {
        await request(ADMIN_ROUTES.permisosComando(c.id_comando), { method: 'PUT', auth: true,
          body: { activo: activo.checked, permitido_invitado: invitado.checked, duracion_max_ms: tope.value ? Number(tope.value) : null } });
        estado.textContent = 'Guardado ✓';
      } catch (error) { estado.textContent = textoError(error); }
      finally { guardar.disabled = false; }
    });
    return el('fieldset', { class: 'comando-fila' },
      el('legend', {}, `${c.codigo} · ${c.nombre}`),
      el('label', { for: `${id}-a` }, activo, ' Activo'),
      el('label', { for: `${id}-i` }, invitado, ' Invitados'),
      el('label', { for: `${id}-t`, class: 'comando-tope' }, 'Tope ms', tope),
      guardar, estado);
  }

  return { cargar };
}
