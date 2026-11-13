// Validación de payloads REST y WSS según los contratos REALES observados el 2026-11-13.
// Todo lo que no cumple se descarta (nunca se rellena con valores inventados).
import { VEHICLE_ID } from './config.js';
import { parseFechaBackend } from './fecha.js';

const esEntero = (valor) => Number.isInteger(valor);
const esTextoONulo = (valor) => valor === null || typeof valor === 'string';
const esEnteroONulo = (valor) => valor === null || esEntero(valor);
const esDelVehiculo = (valor) => esEntero(valor) && valor === VEHICLE_ID;

/** GET /estado → { total, estado:[{ id_vehiculo, vehiculo, id_comando, comando, codigo, conectado, fecha_actualizacion }], conectado_websocket } */
export function validarEstado(respuesta) {
  const item = Array.isArray(respuesta?.estado) ? respuesta.estado.find((fila) => fila?.id_vehiculo === VEHICLE_ID) : null;
  return item ? validarItemEstado(item) : null;
}

/** Elemento de estado (REST o WSS estado_inicial). */
export function validarItemEstado(item) {
  if (!item || !esDelVehiculo(item.id_vehiculo)) return null;
  if (!esTextoONulo(item.comando) || !esEnteroONulo(item.codigo) || !esEnteroONulo(item.id_comando)) return null;
  const fecha = parseFechaBackend(item.fecha_actualizacion);
  if (!fecha) return null;
  return {
    vehiculo: typeof item.vehiculo === 'string' ? item.vehiculo : null,
    comando: item.comando,
    codigo: item.codigo,
    idComando: item.id_comando,
    fecha,
    fechaTexto: item.fecha_actualizacion
  };
}

/** GET /historial → { total, historial:[{ id_historial, id_vehiculo, comando, codigo, fecha_hora, origen }] } */
export function validarHistorial(respuesta) {
  if (!Array.isArray(respuesta?.historial)) return null;
  const filas = [];
  let descartadas = 0;
  for (const fila of respuesta.historial) {
    const valida = validarFilaHistorial(fila);
    if (valida) filas.push(valida); else descartadas += 1;
  }
  return { filas, descartadas };
}

export function validarFilaHistorial(fila) {
  if (!fila || !esEntero(fila.id_historial) || fila.id_historial <= 0) return null;
  if (!esDelVehiculo(fila.id_vehiculo)) return null;
  if (!esTextoONulo(fila.comando) || !esEnteroONulo(fila.codigo) || typeof fila.origen !== 'string') return null;
  const fecha = parseFechaBackend(fila.fecha_hora);
  if (!fecha) return null;
  return { id: fila.id_historial, comando: fila.comando, codigo: fila.codigo, origen: fila.origen, fecha, fechaTexto: fila.fecha_hora };
}

/** WSS comando_individual → { id_vehiculo, id_solicitud, id_comando, comando, codigo } (DETENER: comando "APAGAR_TODO", codigo 0, id_comando null) */
export function validarComandoWss(mensaje) {
  if (!mensaje || !esDelVehiculo(mensaje.id_vehiculo)) return null;
  if (typeof mensaje.id_solicitud !== 'string' || !mensaje.id_solicitud) return null;
  if (typeof mensaje.comando !== 'string' || !esEnteroONulo(mensaje.id_comando)) return null;
  if (mensaje.codigo !== undefined && !esEnteroONulo(mensaje.codigo)) return null;
  return { idSolicitud: mensaje.id_solicitud, comando: mensaje.comando, codigo: mensaje.codigo ?? null, idComando: mensaje.id_comando };
}

/** WSS comando_individual_completado → { id_vehiculo, id_solicitud, id_comando, comando, estado, mensaje } (sin codigo) */
export function validarCompletadoWss(mensaje) {
  if (!mensaje || !esDelVehiculo(mensaje.id_vehiculo)) return null;
  if (typeof mensaje.id_solicitud !== 'string' || !mensaje.id_solicitud || typeof mensaje.comando !== 'string') return null;
  return {
    idSolicitud: mensaje.id_solicitud,
    comando: mensaje.comando,
    estado: typeof mensaje.estado === 'string' ? mensaje.estado : null,
    mensaje: typeof mensaje.mensaje === 'string' ? mensaje.mensaje : null
  };
}

/** WSS demo_iniciada { id_demo, nombre, total_movimientos } y demo_completada { id_demo, total_movimientos } */
export function validarDemoWss(mensaje) {
  if (!mensaje || !esDelVehiculo(mensaje.id_vehiculo) || !esEntero(mensaje.id_demo)) return null;
  return {
    idDemo: mensaje.id_demo,
    nombre: typeof mensaje.nombre === 'string' ? mensaje.nombre : null,
    total: esEntero(mensaje.total_movimientos) ? mensaje.total_movimientos : null
  };
}

/** DETENER se publica como APAGAR_TODO/codigo 0 y se persiste con comando y codigo null. */
export const esDetenerWss = (comando) => comando?.comando === 'APAGAR_TODO' && (comando.codigo === 0 || comando.codigo === null);
export const esDetenerHistorial = (fila) => fila.comando === null && fila.codigo === null;
