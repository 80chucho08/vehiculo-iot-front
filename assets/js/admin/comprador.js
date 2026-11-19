// Vista del comprador: sus unidades (GET /api/mis-vehiculos, el id sale del token) y el consentimiento
// de soporte. El control de su unidad desde CONTROL/MONITOREO llega en la Etapa 6.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { abrirFormulario, avisar, crearTabla, el, etiqueta, fechaHora, textoError } from './ui.js';

export function crearMisVehiculos(contenedor) {
  const tabla = crearTabla({
    titulo: 'Mis vehículos',
    columnas: [
      { titulo: 'Unidad', celda: (v) => el('span', { class: 'celda-doble' }, el('strong', {}, v.nombre), el('small', {}, `${v.modelo || 'Modelo sin registrar'} · ${v.numero_serie || `ID ${v.id_vehiculo}`}`)) },
      { titulo: 'Dispositivo', celda: (v) => (v.dispositivo_conectado ? etiqueta('En línea', 'ok') : etiqueta('Sin conexión', 'neutro')) },
      // comando NULL con historial = DETENER; sin historial la unidad todavía no se ha movido.
      { titulo: 'Último comando', celda: (v) => (!v.con_historial ? el('span', { class: 'texto-tenue' }, 'Sin movimientos') : (v.ultimo_comando || 'DETENER')) },
      { titulo: 'Soporte de la empresa', celda: (v) => (v.soporte_hasta
        ? el('span', { class: 'celda-doble' }, etiqueta('Autorizado', 'aviso'), el('small', {}, 'hasta ', fechaHora(v.soporte_hasta)))
        : etiqueta('No autorizado', 'neutro')) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (v) => (v.soporte_hasta
        ? el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => revocar(v) }, 'Revocar soporte')
        : el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => autorizar(v) }, 'Autorizar soporte')) }
    ]
  });
  contenedor.append(
    el('p', { class: 'admin-sub' }, 'Solo tú controlas y monitoreas tus unidades. La empresa necesita tu autorización temporal para operarlas.'),
    tabla.nodo);

  async function cargar() {
    tabla.cargando();
    try {
      const r = await request(ADMIN_ROUTES.misVehiculos, { auth: true });
      tabla.filas(r.vehiculos || [], 'Aún no tienes unidades asignadas. La empresa te las asigna al registrar tu compra.');
    } catch (error) {
      tabla.error(`No se pudieron cargar tus vehículos: ${textoError(error)}`, cargar);
    }
  }

  function autorizar(v) {
    abrirFormulario({
      titulo: `Autorizar soporte · ${v.nombre}`,
      descripcion: 'Permite que la empresa monitoree y opere esta unidad durante el tiempo indicado. Puedes revocarlo cuando quieras.',
      campos: [
        { nombre: 'minutos', etiqueta: 'Duración', tipo: 'select', opciones: [[15, '15 minutos'], [60, '1 hora'], [240, '4 horas'], [1440, '24 horas']], valor: 60 },
        { nombre: 'motivo', etiqueta: 'Motivo', requerido: true, minlength: 3, maxlength: 255 }
      ],
      textoEnviar: 'Autorizar',
      enviar: async (d) => {
        await request(ADMIN_ROUTES.soporte(v.id_vehiculo), { method: 'POST', auth: true, body: { minutos: Number(d.minutos), motivo: d.motivo } });
        avisar('Soporte autorizado.');
        await cargar();
      }
    });
  }

  async function revocar(v) {
    try {
      await request(ADMIN_ROUTES.soporte(v.id_vehiculo), { method: 'DELETE', auth: true });
      avisar('Soporte revocado: la empresa ya no puede operar la unidad.');
      await cargar();
    } catch (error) { avisar(textoError(error), 'error'); }
  }
  return { cargar };
}
