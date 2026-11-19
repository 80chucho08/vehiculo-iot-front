import { HTTP_METHODS, ROUTES, DEMO_TIMEOUT_MS } from '../core/config.js';
import { request } from '../core/api.js';
import { getState, updateState } from '../core/state.js';
import { detener, isMovementInFlight, isSustainedMovementActive } from './commands.js';

let onAction = () => {};
let startPostPending = false;
let demoStartSubmitted = false;
let completionCount = 0;
let completionReceivedForActiveDemo = false;
let demoGeneration = 0;
// Cómo terminó la última demo según el backend: 'completada' | 'cancelada' | 'error'.
let lastEndCause = null;

// Texto cuando el fin llega mientras el POST de inicio sigue pendiente (demo-progreso.js reconoce estos prefijos).
const FIN_DURANTE_INICIO = Object.freeze({
  completada: ['La demo se completo durante la solicitud de inicio.', 'ok'],
  cancelada: ['La demo se cancelo durante la solicitud de inicio.', 'ok'],
  error: ['La demo se interrumpio durante la solicitud de inicio.', 'error']
});
const avisarFinDuranteInicio = () => onAction(...(FIN_DURANTE_INICIO[lastEndCause] || FIN_DURANTE_INICIO.completada));

export function configureDemos(handler) { onAction = handler; }

export async function loadDemos() {
  const result = await request(ROUTES.demos);
  const activeDemos = Array.isArray(result.demos) ? result.demos.filter((demo) => demo.activo === 1) : [];
  updateState({ demos: activeDemos });
  return activeDemos;
}

function clearDemoState() {
  clearTimeout(getState().demoTimer);
  updateState({ demoRunning: false, demoStarting: false, demoId: null, demoTimer: null });
  demoGeneration += 1;
  startPostPending = false;
  demoStartSubmitted = false;
  completionReceivedForActiveDemo = false;
}

function setSafetyTimeout(id) {
  clearTimeout(getState().demoTimer);
  const generation = demoGeneration;
  const timer = setTimeout(() => {
    if (generation !== demoGeneration || String(getState().demoId) !== String(id)) return;
    clearDemoState();
    onAction('Se agoto el tiempo de seguridad; se libero el bloqueo de la demo.', 'error');
  }, DEMO_TIMEOUT_MS);
  updateState({ demoTimer: timer });
}

function isClearHttpFailure(error) {
  return error?.kind === 'http' && error.status >= 400 && error.status < 500 && ![408, 409].includes(error.status);
}

export async function iniciarDemo(id) {
  const state = getState();
  if (state.demoRunning || state.demoStarting || startPostPending) {
    onAction('Ya hay una demo en ejecucion o iniciandose.', 'error');
    return false;
  }

  clearTimeout(state.demoTimer);
  const generation = ++demoGeneration;
  completionReceivedForActiveDemo = false;
  updateState({ demoStarting: true, demoRunning: false, demoId: id, demoTimer: null });
  onAction('Inicio de demo solicitado.', 'cargando');

  try {
    if (isSustainedMovementActive() || isMovementInFlight()) {
      const stopped = await detener('antes de iniciar demo');
      if (generation !== demoGeneration) return false;
      if (!stopped) {
        clearDemoState();
        onAction('No se inicio la demo porque no se pudo confirmar DETENER.', 'error');
        return false;
      }
    }

    const countAtPostStart = completionCount;
    demoStartSubmitted = true;
    startPostPending = true;
    let response;
    try { response = await request(ROUTES.executeDemo(id), { method: HTTP_METHODS.executeDemo }); }
    catch (error) {
      if (generation !== demoGeneration) return false;
      startPostPending = false;
      if (completionCount !== countAtPostStart) {
        clearDemoState();
        avisarFinDuranteInicio();
        return lastEndCause === 'completada';
      }
      if (isClearHttpFailure(error)) {
        clearDemoState();
        onAction(`La API rechazo el inicio de la demo: ${error.message}`, 'error');
      } else {
        setSafetyTimeout(id);
        onAction('Estado de la demo desconocido; se mantiene el bloqueo para evitar iniciar otra.', 'error');
      }
      return false;
    }
    if (generation !== demoGeneration) return false;
    startPostPending = false;

    if (completionCount !== countAtPostStart) {
      clearDemoState();
      avisarFinDuranteInicio();
      return lastEndCause === 'completada';
    }
    if (response?.estado !== 'en_ejecucion') {
      setSafetyTimeout(id);
      onAction('La API no confirmo el inicio; estado de la demo desconocido y bloqueo mantenido.', 'error');
      return false;
    }

    clearTimeout(getState().demoTimer);
    updateState({ demoStarting: false, demoRunning: true, demoId: id, demoTimer: null });
    setSafetyTimeout(id);
    onAction('Demo aceptada por API y en ejecucion. Esperando evento de finalizacion.', 'ok');
    return true;
  } catch (error) {
    if (generation !== demoGeneration) return false;
    startPostPending = false;
    clearDemoState();
    onAction(`No se pudo preparar el inicio de la demo: ${error.message}`, 'error');
    return false;
  }
}

export async function cancelarDemo() {
  onAction('Cancelacion de demo solicitada.', 'cargando');
  try {
    await request(ROUTES.cancelDemo, { method: HTTP_METHODS.cancelDemo });
    clearDemoState();
    onAction('Cancelacion de demo aceptada por API.', 'ok');
    await detener('cancelacion de demo');
    return true;
  } catch (error) {
    onAction(`No se pudo cancelar la demo: ${error.message}`, 'error');
    return false;
  }
}

// Registra el fin de la demo activa una sola vez, venga de WSS o de la respuesta de DETENER.
function registrarFin(message, causa) {
  const state = getState();
  const inProgress = state.demoRunning || demoStartSubmitted;
  if (!inProgress || String(message?.id_demo) !== String(state.demoId) || completionReceivedForActiveDemo) return false;
  completionCount += 1;
  lastEndCause = causa;
  completionReceivedForActiveDemo = true;
  if (!startPostPending) clearDemoState();
  return true;
}

export function completarDemo(message) {
  if (!registrarFin(message, 'completada')) return;
  onAction(`Evento recibido: demo ${message.id_demo} completada (${message.total_movimientos} movimientos).`, 'ok');
}

/**
 * El backend terminó la demo sin completarla: `demo_cancelada` (p. ej. DETENER la canceló) o `demo_error`.
 * @param {{id_demo:number, mensaje?:string}} message
 * @param {'cancelada'|'error'} causa
 * @param {string} fuente de dónde llegó el aviso (evento WSS o respuesta de DETENER)
 */
export function finalizarDemo(message, causa, fuente) {
  if (!registrarFin(message, causa)) return;
  if (causa === 'cancelada') onAction(`Demo ${message.id_demo} cancelada por el backend (${fuente}).`, 'ok');
  else onAction(`Demo ${message.id_demo} interrumpida por el backend (${fuente}): ${message?.mensaje || 'sin detalle'}`, 'error');
}

export function avisarDemoEstadoDesconocido() {
  if (!getState().demoRunning && !getState().demoStarting) return;
  onAction('Conexion perdida durante la demo, estado desconocido. Se mantiene el bloqueo hasta recibir demo_completada, confirmar la cancelacion o alcanzar el timeout de seguridad.', 'error');
}
