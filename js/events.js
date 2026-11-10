import { VEHICLE_ID } from './config.js';
import { updateState } from './state.js';
import { consumirSolicitud } from './commands.js';

const handlers = Object.create(null);

handlers.estado_inicial = (message, context) => {
  const vehicle = Array.isArray(message.estado) ? message.estado[0] : null;
  if (vehicle?.vehiculo) context.setVehicleName(vehicle.vehiculo);
  if (vehicle && Object.hasOwn(vehicle, 'conectado')) context.setBackendConnectivity(vehicle.conectado);
  updateState({ initialStatus: vehicle, initialDemos: message.demos || [] });
  if (context.consumeReconnection?.()) context.notifyDemoStateUnknown?.();
  context.logAction('Estado inicial recibido del backend.', 'ok');
};

handlers.comando_individual_completado = (message, context) => {
  const codigo = consumirSolicitud(message.id_solicitud, message);
  if (codigo !== undefined) context.logAction(`Evento recibido para el comando ${codigo}: ${message.comando || message.id_comando} completado (${message.estado || 'estado no indicado'}).`, 'ok', message.id_solicitud);
};

handlers.demo_completada = (message, context) => context.demoCompleted(message);

export function registerMessageHandler(type, handler) {
  if (typeof handler !== 'function') throw new TypeError('El manejador de mensajes debe ser una funcion.');
  handlers[type] = handler;
}

export function dispatchMessage(message, context) {
  if (message && Object.hasOwn(message, 'id_vehiculo') && Number(message.id_vehiculo) !== VEHICLE_ID) {
    context.logUnknownEvent({
      tipo: 'evento_ignorado',
      motivo: 'id_vehiculo distinto al vehiculo configurado',
      id_vehiculo: message.id_vehiculo,
      mensaje: message
    });
    return;
  }

  const handler = message && typeof message.tipo === 'string' ? handlers[message.tipo] : undefined;
  if (typeof handler === 'function') {
    context.logEvent(message);
    handler(message, context);
  } else {
    context.logUnknownEvent(message);
  }
}
