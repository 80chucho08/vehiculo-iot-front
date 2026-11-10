import { ROUTES, HTTP_METHODS, VEHICLE_ID } from './config.js';
import { request } from './api.js';
import { startHealthChecks } from './health.js';
import { createWebSocket } from './ws.js';
import { byId, setStatusCard, createActionLogger, logEvent, setVehicleName, setBackendConnectivity, renderCommands, renderDemos, setCommandButtonsState } from './ui.js';
import { configureCommands, enviarComando, detener, isMovementInFlight, isSustainedMovementActive, getActiveCommand } from './commands.js';
import { configureDemos, loadDemos, iniciarDemo, cancelarDemo, completarDemo, avisarDemoEstadoDesconocido } from './demo.js';
import { getState, updateState, subscribe } from './state.js';
import { setupJoystick } from './joystick.js';

if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[depuracion local] Promesa no manejada:', event.reason);
  });
}

byId('vehicle-id').textContent = `ID ${VEHICLE_ID}`;
byId('current-year').textContent = String(new Date().getFullYear());
const writeAction = createActionLogger();
const logAction = (...args) => { writeAction(...args); setCommandButtonsState({ sending: isMovementInFlight(), demoRunning: getState().demoRunning || getState().demoStarting, activeCode: getActiveCommand() }); };
configureCommands(
  logAction,
  () => setCommandButtonsState({ sending: isMovementInFlight(), demoRunning: getState().demoRunning || getState().demoStarting, activeCode: getActiveCommand() }),
  (event, codigo) => logAction(`Evento recibido para el comando ${codigo}: ${event.comando || event.id_comando} completado (${event.estado || 'estado no indicado'}).`, 'ok', event.id_solicitud)
); configureDemos(logAction);
const context = {
  setStatus: (status, state) => setStatusCard('ws-status', null, status, state),
  setVehicleName, setBackendConnectivity, logAction, logEvent, logUnknownEvent: logEvent,
  notifyDemoStateUnknown: avisarDemoEstadoDesconocido,
  demoCompleted: completarDemo
};
const ws = createWebSocket(context);
window.addEventListener('pagehide', () => ws.close(), { once: true });

startHealthChecks((kind, result) => {
  if (kind === 'api') {
    if (result.checking) { setStatusCard('api-status', null, 'Comprobando', 'cargando'); return; }
    setStatusCard('api-status', null, result.ok ? 'Disponible' : 'No disponible', result.ok ? 'ok' : 'error');
    return;
  }
  if (result.unknown) { setStatusCard('db-status', null, 'Sin verificar', 'cargando'); return; }
  if (result.unavailable) { setStatusCard('db-status', null, 'No disponible', 'error'); return; }
  if (result.ok) setStatusCard('db-status', null, 'Disponible', 'ok');
});

async function loadCatalogs() {
  try {
    const result = await request(ROUTES.commands);
    updateState({ commands: Array.isArray(result.comandos) ? result.comandos : [] });
    renderCommands((code) => enviarComando(code, 'boton'), (origin) => detener(origin));
  } catch (error) { logAction(`No se pudo cargar el catálogo de comandos: ${error.message}`, 'error'); }
  try {
    renderDemos(await loadDemos());
    byId('demo-start').disabled = getState().demoRunning || getState().demoStarting || !byId('demo-select').value;
  }
  catch (error) { renderDemos([]); logAction(`No se pudieron cargar las demos: ${error.message}`, 'error'); }
}
await loadCatalogs();
setupJoystick(byId('joystick'), byId('joystick-knob'), { enviarComando, detener, isMovementInFlight, isSustainedMovementActive, getActiveCommand }, () => getState().commands);

byId('stop-button').addEventListener('click', () => detener('botón DETENER'));
byId('demo-start').addEventListener('click', async () => {
  const id = byId('demo-select').value; if (!id) { logAction('Selecciona una demo disponible.', 'error'); return; }
  await iniciarDemo(id);
});
byId('demo-cancel').addEventListener('click', cancelarDemo);
subscribe((state) => {
  setCommandButtonsState({ sending: isMovementInFlight(), demoRunning: state.demoRunning || state.demoStarting, activeCode: getActiveCommand() });
  byId('demo-start').disabled = state.demoRunning || state.demoStarting || !byId('demo-select').value;
  byId('demo-cancel').disabled = !state.demoRunning && !state.demoStarting;
});
byId('demo-select').addEventListener('change', () => { byId('demo-start').disabled = getState().demoRunning || getState().demoStarting || !byId('demo-select').value; });

// Rutas/métodos centrales en config.js; las constantes mantienen visibles los puntos por confirmar.
void HTTP_METHODS;
