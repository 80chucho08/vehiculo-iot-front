import { HTTP_METHODS, ROUTES, DEMO_TIMEOUT_MS } from './config.js';
import { request } from './api.js';
import { getState, updateState } from './state.js';

let onAction = () => {};
export function configureDemos(handler) { onAction = handler; }
export async function loadDemos() {
  const result = await request(ROUTES.demos);
  updateState({ demos: Array.isArray(result.demos) ? result.demos : [] }); return getState().demos;
}
export async function iniciarDemo(id) {
  if (getState().demoRunning) { onAction('Ya hay una demo en ejecución.', 'error'); return false; }
  onAction('Inicio de demo solicitado.', 'cargando');
  try {
    const result = await request(ROUTES.executeDemo(id), { method: HTTP_METHODS.executeDemo });
    if (result.estado !== 'en_ejecucion') { onAction('La API no confirmó el inicio de la demo.', 'error'); return false; }
    updateState({ demoRunning: true });
    const timer = setTimeout(() => { updateState({ demoRunning: false, demoTimer: null }); onAction('Se agotó el tiempo de seguridad de la demo; el bloqueo se liberó.', 'error'); }, DEMO_TIMEOUT_MS);
    updateState({ demoTimer: timer }); onAction('Demo aceptada por API y en ejecución. Esperando evento de finalización.', 'ok'); return true;
  } catch (error) { onAction(`No se pudo iniciar la demo: ${error.message}`, 'error'); return false; }
}
export async function cancelarDemo() {
  onAction('Cancelación de demo solicitada.', 'cargando');
  try {
    await request(ROUTES.cancelDemo, { method: HTTP_METHODS.cancelDemo });
    clearTimeout(getState().demoTimer); updateState({ demoRunning: false, demoTimer: null });
    onAction('Cancelación de demo aceptada por API.', 'ok'); return true;
  } catch (error) { onAction(`No se pudo cancelar la demo: ${error.message}`, 'error'); return false; }
}
export function completarDemo(message) {
  clearTimeout(getState().demoTimer); updateState({ demoRunning: false, demoTimer: null });
  onAction(`Evento recibido: demo ${message.id_demo} completada (${message.total_movimientos} movimientos).`, 'ok');
}

export function recuperarDemoSinConfirmacion() {
  if (!getState().demoRunning) return;
  clearTimeout(getState().demoTimer);
  updateState({ demoRunning: false, demoTimer: null });
  onAction('Tras reconectar, el estado inicial no confirma una demo activa; se libero el bloqueo local.', 'error');
}
