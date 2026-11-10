import { HTTP_METHODS, ROUTES, STOP_REQUEST_TIMEOUT_MS, TOGGLE_INTERRUPTS_MOVEMENT } from './config.js';
import { request } from './api.js';
import { getState } from './state.js';
import { GRUPOS } from '../data/grupos.js';

const pending = new Map();
const solicitudes = new Map();
const eventosTempranos = new Map();
const MAX_CORRELACIONES = 100;
let activeCode = null;
let generation = 0;
let movementInFlight = false;
let desiredCommand = null;
const toggleQueue = [];
const MAX_TOGGLE_QUEUE = 2;
let stopping = false;
let stopPromise = null;
let onAction = () => {};
let onChange = () => {};
let onCorrelatedEvent = () => {};

export function configureCommands(handler, stateHandler = () => {}, eventHandler = () => {}) {
  onAction = handler; onChange = stateHandler; onCorrelatedEvent = eventHandler;
}
export function getActiveCommand() { return activeCode; }
export function isMovementInFlight() { return movementInFlight; }
export function isSustainedMovementActive() { return activeCode !== null; }

function remember(map, id, value) {
  if (!id) return;
  if (map.has(id)) map.delete(id);
  map.set(id, value);
  while (map.size > MAX_CORRELACIONES) map.delete(map.keys().next().value);
}
export function registrarSolicitud(id, codigo) {
  if (!id) return;
  remember(solicitudes, id, codigo);
  if (eventosTempranos.has(id)) {
    const event = eventosTempranos.get(id); eventosTempranos.delete(id);
    solicitudes.delete(id); onCorrelatedEvent(event, codigo);
  }
}
export function consumirSolicitud(id, event = null) {
  if (!id) return undefined;
  if (solicitudes.has(id)) { const codigo = solicitudes.get(id); solicitudes.delete(id); return codigo; }
  if (event) remember(eventosTempranos, id, event);
  return undefined;
}

function commandInfo(codigo) {
  const group = GRUPOS.find((item) => item.codigos.includes(Number(codigo)));
  if (!group || !['sostenido', 'toggle'].includes(group.tipo)) {
    console.error(`El codigo de comando ${codigo} no tiene un tipo valido en data/grupos.js.`);
    return null;
  }
  const command = getState().commands.find((item) => Number(item.codigo) === Number(codigo) && item.activo);
  if (!command) return null;
  return { command, type: group.tipo };
}

export async function enviarComando(codigo, origen = 'joystick') {
  if (getState().demoRunning) { onAction('Los comandos estan bloqueados mientras se ejecuta una demo.', 'error'); return false; }
  const info = commandInfo(codigo);
  if (!info) { onAction(`El comando ${codigo} no esta disponible en el catalogo activo.`, 'error'); return false; }
  const item = { codigo: Number(codigo), origen, ...info };
  if (item.type === 'toggle' && (movementInFlight || stopping)) {
    if (toggleQueue.length >= MAX_TOGGLE_QUEUE) {
      onAction('La cola de toggles esta llena (maximo 2); espera a que termine el comando pendiente.', 'error');
      return false;
    }
    toggleQueue.push(item);
    return true;
  }
  if (movementInFlight || stopping) {
    // Conserva un solo comando deseado; cada entrada reemplaza a la anterior.
    desiredCommand = item;
    return true;
  }
  if (item.type === 'sostenido' && activeCode === item.codigo) return false;
  return send(item);
}

function sendNextQueued() {
  if (movementInFlight || stopping) return;
  const next = toggleQueue.shift() || desiredCommand;
  if (!next) return;
  if (next === desiredCommand) desiredCommand = null;
  if (next.type === 'sostenido' && next.codigo === activeCode) { sendNextQueued(); return; }
  send(next);
}

function send(item) {
  movementInFlight = true;
  if (item.type === 'sostenido') activeCode = item.codigo;
  else if (item.type === 'toggle' && TOGGLE_INTERRUPTS_MOVEMENT) activeCode = null;
  const requestGeneration = generation;
  const controller = new AbortController();
  onChange();
  onAction(`Comando "${item.command.nombre}" solicitado desde ${item.origen}.`, 'cargando');
  const task = (async () => {
    try {
      const response = await request(ROUTES.executeCommand(item.command.id_comando), { method: HTTP_METHODS.executeCommand, signal: controller.signal });
      if (requestGeneration !== generation) return false;
      onAction(`Comando "${item.command.nombre}" aceptado por API: ${response.estado || 'respuesta recibida'}.`, 'ok', response.id_solicitud);
      if (response.id_solicitud) registrarSolicitud(response.id_solicitud, item.codigo);
      return true;
    } catch (error) {
      if (requestGeneration === generation) {
        const message = String(error.message).includes('No hay un dispositivo WebSocket conectado.')
          ? 'El vehiculo no esta conectado al servidor en este momento.' : error.message;
        onAction(message, 'error');
        if (item.type === 'sostenido' && activeCode === item.codigo) activeCode = null;
      }
      return false;
    } finally {
      pending.delete(controller);
      if (requestGeneration === generation) {
        movementInFlight = false;
        onChange();
        sendNextQueued();
      }
    }
  })();
  pending.set(controller, { done: task });
  return task;
}

async function sendStopOnce() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new DOMException('Tiempo agotado', 'TimeoutError')), STOP_REQUEST_TIMEOUT_MS);
    try {
      const response = await request(ROUTES.stop, { method: HTTP_METHODS.stop, signal: controller.signal });
      onAction(`DETENER aceptado por API: ${response.estado || 'respuesta recibida'}.`, 'ok'); return true;
    } catch (error) {
      if (attempt === 0) onAction('No se confirmo DETENER; se reintentara una vez.', 'cargando');
      else { onAction(`No se pudo confirmar DETENER: ${error.message}`, 'error'); return false; }
    } finally { clearTimeout(timer); }
  }
  return false;
}

export function detener(origen = 'user') {
  desiredCommand = null;
  toggleQueue.length = 0;
  if (stopPromise) return stopPromise;
  const inFlight = [...pending.values()].map((entry) => entry.done);
  const hadPending = inFlight.length > 0;
  generation += 1; activeCode = null; desiredCommand = null; movementInFlight = false; stopping = true;
  for (const controller of pending.keys()) controller.abort();
  onChange(); onAction(`DETENER solicitado desde ${origen}.`, 'cargando');
  stopPromise = (async () => {
    try {
      const first = await sendStopOnce();
      let second = false;
      if (hadPending) {
        await Promise.allSettled(inFlight);
        second = await sendStopOnce();
      }
      return first || second;
    } finally {
      stopping = false; stopPromise = null; onChange();
      if (!getState().demoRunning) sendNextQueued();
    }
  })();
  return stopPromise;
}
