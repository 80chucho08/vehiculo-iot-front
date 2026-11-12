import { HTTP_METHODS, ROUTES, STOP_REQUEST_TIMEOUT_MS, TOGGLE_INTERRUPTS_MOVEMENT } from '../core/config.js';
import { request } from '../core/api.js';
import { getState } from '../core/state.js';
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

function showAction(message, status = 'error') {
  try { onAction(message, status); } catch (error) { console.warn('No se pudo actualizar el mensaje de accion:', error); }
}

function notifyChange() {
  try { onChange(); } catch (error) { console.warn('No se pudo actualizar el estado de comandos:', error); }
}

function backendDetail(error) {
  if (typeof error?.detail === 'string') return error.detail;
  if (Array.isArray(error?.detail)) {
    const details = error.detail.map((item) => {
      const location = Array.isArray(item?.loc) ? item.loc.join('.') : '';
      return [location, item?.msg].filter(Boolean).join(': ');
    }).filter(Boolean).join('; ');
    if (details) return details;
  }
  if (error?.detail != null) {
    try { return JSON.stringify(error.detail); } catch { /* usa el mensaje normalizado */ }
  }
  return error?.message || String(error);
}

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
  if (getState().demoRunning || getState().demoStarting) { showAction('Los comandos estan bloqueados mientras se inicia o ejecuta una demo.', 'error'); return false; }
  const info = commandInfo(codigo);
  if (!info) { showAction(`El comando ${codigo} no esta disponible en el catalogo activo.`, 'error'); return false; }
  const item = { codigo: Number(codigo), origen, ...info };
  if (item.type === 'toggle' && (movementInFlight || stopping)) {
    if (toggleQueue.length >= MAX_TOGGLE_QUEUE) {
      showAction('La cola de toggles esta llena (maximo 2); espera a que termine el comando pendiente.', 'error');
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
  if (movementInFlight || stopping || getState().demoRunning || getState().demoStarting) return;
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
  let needsSafetyStop = false;
  notifyChange();
  showAction(`Comando "${item.command.nombre}" solicitado desde ${item.origen}.`, 'cargando');
  const task = (async () => {
    try {
      const response = await request(ROUTES.executeCommand(item.command.id_comando), { method: HTTP_METHODS.executeCommand, signal: controller.signal });
      if (requestGeneration !== generation) return false;
      showAction(`Comando "${item.command.nombre}" aceptado por API: ${response.estado || 'respuesta recibida'}.`, 'ok', response.id_solicitud);
      if (response.id_solicitud) registrarSolicitud(response.id_solicitud, item.codigo);
      return true;
    } catch (error) {
      if (requestGeneration === generation) {
        if (item.type === 'sostenido' && ['timeout', 'network'].includes(error?.kind)) needsSafetyStop = true;
        const message = String(error.message).includes('No hay un dispositivo WebSocket conectado.')
          ? 'El vehiculo no esta conectado al servidor en este momento.' : error.message;
        showAction(message, 'error');
        if (item.type === 'sostenido' && activeCode === item.codigo) activeCode = null;
      }
      return false;
    } finally {
      pending.delete(controller);
      if (requestGeneration === generation) {
        movementInFlight = false;
        notifyChange();
        if (needsSafetyStop) {
          void detener('detencion de seguridad tras error de movimiento');
        } else if (!getState().demoRunning && !getState().demoStarting) sendNextQueued();
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
      showAction(`DETENER aceptado por API: ${response.estado || 'respuesta recibida'}.`, 'ok');
      return { accepted: true, clientError: false };
    } catch (error) {
      const status = Number(error?.status) || 0;
      const isClientError = error?.kind === 'http' && status >= 400 && status < 500;
      const mayRetry = error?.kind === 'timeout' || error?.kind === 'network'
        || (error?.kind === 'http' && status >= 500);

      if (isClientError) {
        const detail = backendDetail(error);
        showAction(`DETENER rechazado por HTTP ${status}: ${detail}`, 'error');
        return { accepted: false, clientError: true };
      }
      if (attempt === 0 && mayRetry) {
        showAction('No se confirmo DETENER; se reintentara una vez.', 'cargando');
        continue;
      }
      showAction(`No se pudo confirmar DETENER${status ? ` (HTTP ${status})` : ''}: ${error?.message || String(error)}`, 'error');
      return { accepted: false, clientError: false };
    } finally { clearTimeout(timer); }
  }
  return { accepted: false, clientError: false };
}

export function detener(origen = 'user') {
  try {
    desiredCommand = null;
    toggleQueue.length = 0;
    if (stopPromise) return stopPromise;
    const inFlight = [...pending.values()].map((entry) => entry.done);
    const hadPending = inFlight.length > 0;
    generation += 1; activeCode = null; movementInFlight = false; stopping = true;
    for (const controller of pending.keys()) controller.abort();
    notifyChange();
    showAction(`DETENER solicitado desde ${origen}.`, 'cargando');

    const operation = (async () => {
      let accepted = false;
      try {
        const first = await sendStopOnce();
        accepted = first.accepted;
        if (hadPending && !first.clientError) {
          await Promise.allSettled(inFlight);
          const second = await sendStopOnce();
          accepted = accepted || second.accepted;
        }
        return accepted;
      } catch (error) {
        showAction(`No se pudo completar DETENER: ${error?.message || String(error)}`, 'error');
        return false;
      } finally {
        stopping = false; stopPromise = null;
        notifyChange();
        try { if (!getState().demoRunning && !getState().demoStarting) sendNextQueued(); }
        catch (error) { console.warn('No se pudo vaciar la cola despues de DETENER:', error); }
      }
    })();
    stopPromise = operation.then(Boolean, (error) => {
      showAction(`No se pudo completar DETENER: ${error?.message || String(error)}`, 'error');
      stopping = false; stopPromise = null;
      return false;
    });
    return stopPromise;
  } catch (error) {
    stopping = false; stopPromise = null; desiredCommand = null; toggleQueue.length = 0;
    showAction(`No se pudo iniciar DETENER: ${error?.message || String(error)}`, 'error');
    return Promise.resolve(false);
  }
}
