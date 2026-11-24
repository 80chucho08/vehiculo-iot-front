import { ROUTES, HTTP_METHODS, APP_NAME, LUZ_CODIGO } from '../core/config.js';
import { request } from '../core/api.js';
import { startHealthChecks } from '../core/health.js';
import { createWebSocket } from '../core/ws.js';
import { getState, updateState, subscribe } from '../core/state.js';
import { montarNavegacion, montarCreditos } from '../core/layout.js';
import { montarSelectorUnidad } from '../core/selector-unidad.js';
import { esInvitado, montarModoInvitado } from './invitado.js';
import { byId, setStatusCard, createActionLogger, setVehicleName, setBackendConnectivity, renderCommands, renderDemos, setCommandButtonsState, initControlChrome } from './ui.js';
import { configureCommands, enviarComando, detener, isMovementInFlight, isSustainedMovementActive, getActiveCommand, alAceptarDetener } from './commands.js';
import { configureDemos, loadDemos, iniciarDemo, cancelarDemo, completarDemo, finalizarDemo, avisarDemoEstadoDesconocido } from './demo.js';
import { setupJoystick } from './joystick.js';
import { crearLuz } from './luz.js';
import { crearDemoProgreso } from './demo-progreso.js';
import { renderMisComandos } from './mis-comandos.js';
import { JOYSTICK_GRUA, JOYSTICK_GARRA } from '../data/joystick-map.js';

if (['localhost', '127.0.0.1', '::1'].includes(location.hostname)) {
  window.addEventListener('unhandledrejection', (event) => {
    console.warn('[depuracion local] Promesa no manejada:', event.reason);
  });
}

montarNavegacion(document.querySelector('[data-nav]'), 'control');
void montarSelectorUnidad(document.querySelector('[data-selector-unidad]'));
montarModoInvitado();
montarCreditos(byId('app-credits'));
initControlChrome();
document.title = `${APP_NAME} · Control IoT`;
byId('app-name').textContent = APP_NAME;
document.querySelector('.brand-logo').setAttribute('aria-label', APP_NAME);
byId('joystick-grua').setAttribute('aria-label', `${APP_NAME}: joystick de grúa`);
byId('joystick-garra').setAttribute('aria-label', `${APP_NAME}: joystick de garra`);
byId('stop-button').setAttribute('aria-label', `${APP_NAME}: detener`);
const noop = () => {};
const getCommandCatalog = () => getState().commands;
const luz = crearLuz({ isMovementInFlight, getCatalog: getCommandCatalog });
const demoProgreso = crearDemoProgreso({ getState, subscribe, cancelar: cancelarDemo });
const writeAction = createActionLogger();
const refreshButtons = () => setCommandButtonsState({ sending: isMovementInFlight(), demoRunning: getState().demoRunning || getState().demoStarting, activeCode: getActiveCommand() });
const logAction = (...args) => { writeAction(...args); luz.alAccion(args[0], args[1]); demoProgreso.alAccion(args[0], args[1]); setCommandButtonsState({ sending: isMovementInFlight(), demoRunning: getState().demoRunning || getState().demoStarting, activeCode: getActiveCommand() }); };
configureCommands(
  logAction,
  () => { refreshButtons(); luz.alCambiar(); },
  (event, codigo) => { logAction(`Evento recibido para el comando ${codigo}: ${event.comando || event.id_comando} completado (${event.estado || 'estado no indicado'}).`, 'ok', event.id_solicitud); luz.alRecibirEvento(event, codigo); }
); configureDemos(logAction);
const context = {
  setStatus: (status, state) => { setStatusCard('ws-status', null, status, state); const online = status === 'En linea'; if (online && !wsAvailable && !catalogLoaded) { catalogRetryDelay = 1000; void loadCatalogs(); } wsAvailable = online; },
  // El registro completo de eventos se muestra en eventos.html; aquí se descartan.
  setVehicleName, setBackendConnectivity, logAction, logEvent: noop, logUnknownEvent: noop,
  notifyDemoStateUnknown: avisarDemoEstadoDesconocido,
  demoCompleted: (message) => { demoProgreso.alCompletar(message); completarDemo(message); },
  demoEnded: (message, causa) => finalizarDemo(message, causa, 'evento WSS')
};
// DETENER cancela la demo en el backend; si el evento WSS se perdió, la respuesta REST lo confirma.
alAceptarDetener((response) => {
  if (response?.demo_cancelada === true && getState().demoId != null) {
    finalizarDemo({ id_demo: getState().demoId }, 'cancelada', 'respuesta de DETENER');
  }
});
let catalogRetryTimer = null;
let catalogRetryDelay = 1500;
let catalogLoading = false;
let catalogLoaded = false;
let apiAvailable = false;
let wsAvailable = false;
const ws = createWebSocket(context);
window.addEventListener('pagehide', () => ws.close(), { once: true });

function scheduleCatalogRetry() {
  if (catalogRetryTimer || catalogLoading || catalogLoaded) return;
  catalogRetryTimer = setTimeout(() => { catalogRetryTimer = null; if (!catalogLoaded) void loadCatalogs(); }, catalogRetryDelay);
  catalogRetryDelay = Math.min(30000, catalogRetryDelay * 2);
}

startHealthChecks((kind, result) => {
  if (kind === 'api') {
    if (result.checking) { setStatusCard('api-status', null, 'Comprobando', 'cargando'); return; }
    setStatusCard('api-status', null, result.ok ? 'Disponible' : 'No disponible', result.ok ? 'ok' : 'error');
    if (result.ok && !apiAvailable && !catalogLoaded) { catalogRetryDelay = 1000; void loadCatalogs(); }
    apiAvailable = result.ok;
    return;
  }
  if (result.unknown) { setStatusCard('db-status', null, 'Sin verificar', 'cargando'); return; }
  if (result.unavailable) { setStatusCard('db-status', null, 'No disponible', 'error'); return; }
  if (result.ok) setStatusCard('db-status', null, 'Disponible', 'ok');
});

async function loadCatalogs() {
  if (catalogLoading) return;
  catalogLoading = true;
  let commandsOK = false;
  let demosOK = false;
  byId('catalog-status').hidden = true;
  try {
    const result = await request(ROUTES.commands);
    const todos = Array.isArray(result.comandos) ? result.comandos : [];
    // Joysticks y botones usan los de fábrica; los propios del usuario (V009) van en «Mis comandos».
    const comandos = todos.filter((c) => (c.tipo || 'fabrica') === 'fabrica');
    const propios = todos.filter((c) => c.tipo === 'usuario' && c.activo);
    // Invitado: solo los comandos habilitados para la prueba (la API rechaza los demás con 403).
    updateState({ commands: esInvitado() ? comandos.filter((c) => c.permitido_invitado) : comandos });
    renderCommands((code) => enviarComando(code, 'boton'), undefined, { [LUZ_CODIGO]: luz.crearBoton },
      esInvitado() ? { nota: 'Invitado: movimientos de grúa y garra, luz y demos de fábrica.' } : {});
    if (!esInvitado()) renderMisComandos(propios, { enviarComando, detener, isSustainedMovementActive });
    commandsOK = getState().commands.length > 0;
  } catch (error) { logAction(`No se pudo cargar el catálogo de comandos: ${error.message}`, 'error'); }
  try {
    renderDemos(await loadDemos());
    demosOK = true;
    byId('demo-start').disabled = getState().demoRunning || getState().demoStarting || !byId('demo-select').value;
  }
  catch (error) { renderDemos([]); logAction(`No se pudieron cargar las demos: ${error.message}`, 'error'); }
  catalogLoading = false;
  catalogLoaded = commandsOK && demosOK;
  byId('catalog-status').hidden = catalogLoaded;
  if (!catalogLoaded) scheduleCatalogRetry();
  else { catalogRetryDelay = 1500; clearTimeout(catalogRetryTimer); catalogRetryTimer = null; }
}
renderCommands(() => {});
await loadCatalogs();
byId('catalog-retry').addEventListener('click', () => { clearTimeout(catalogRetryTimer); catalogRetryTimer = null; catalogRetryDelay = 1000; void loadCatalogs(); });
const joystickCommands = { enviarComando, detener, isMovementInFlight, isSustainedMovementActive, getActiveCommand };
setupJoystick(byId('joystick-grua'), byId('joystick-grua-knob'), joystickCommands, getCommandCatalog, JOYSTICK_GRUA);
setupJoystick(byId('joystick-garra'), byId('joystick-garra-knob'), joystickCommands, getCommandCatalog, JOYSTICK_GARRA);

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
  const demoButton = byId('demo-open');
  demoButton.textContent = state.demoRunning || state.demoStarting ? 'Cancelar demo' : 'DEMO';
  demoButton.classList.toggle('demo-running', state.demoRunning || state.demoStarting);
});
byId('demo-select').addEventListener('change', () => { byId('demo-start').disabled = getState().demoRunning || getState().demoStarting || !byId('demo-select').value; });

// Rutas/métodos centrales en config.js; las constantes mantienen visibles los puntos por confirmar.
void HTTP_METHODS;
