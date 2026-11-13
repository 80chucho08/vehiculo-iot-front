// MONITOREO: último movimiento + 10 movimientos individuales persistidos + 3 indicadores.
// Solo lectura: no envía comandos por REST ni por WSS.
// Flujo: carga inicial REST (estado + historial) → WSS en vivo → confirmación REST acotada → resincronización al reconectar.
import { APP_NAME, VEHICLE_ID, ROUTES, DEMO_TIMEOUT_MS } from '../core/config.js';
import { request } from '../core/api.js';
import { createWebSocket } from '../core/ws.js';
import { registerMessageHandler } from '../core/events.js';
import { montarNavegacion, montarCreditos } from '../core/layout.js';
import { montarIndicadores } from '../core/conectividad.js';
import { validarEstado, validarItemEstado, validarComandoWss, validarCompletadoWss, validarDemoWss } from '../core/validaciones.js';
import { etiquetaZona } from '../core/fecha.js';
import { crearHistorial } from './historial.js';
import { crearUltimoMovimiento, crearEstadoDemo } from './ultimo-movimiento.js';

const byId = (id) => document.getElementById(id);

montarNavegacion(document.querySelector('[data-nav]'), 'monitoreo');
montarCreditos(byId('app-credits'));
document.title = `${APP_NAME} · Monitoreo`;
document.querySelector('.brand-logo').setAttribute('aria-label', APP_NAME);
byId('zona-horaria').textContent = etiquetaZona();

const indicadores = montarIndicadores({ ws: byId('ws-status'), api: byId('api-status'), db: byId('db-status') });

const ultimo = crearUltimoMovimiento({
  card: byId('ultimo-card'), nombre: byId('ultimo-nombre'), codigo: byId('ultimo-codigo'), fuente: byId('ultimo-fuente'),
  fecha: byId('ultimo-fecha'), hora: byId('ultimo-hora'), fechaFuente: byId('ultimo-fecha-fuente'),
  fases: byId('ultimo-fases'), aviso: byId('ultimo-aviso')
});
const estadoDemo = crearEstadoDemo({ caja: byId('demo-estado'), titulo: byId('demo-estado-titulo'), detalle: byId('demo-estado-detalle') });
const historial = crearHistorial({ tbody: byId('historial-cuerpo'), estado: byId('historial-estado'), tabla: byId('historial-tabla'), actualizado: byId('historial-actualizado') });

function setVehiculo(nombre) {
  if (typeof nombre === 'string' && nombre.trim()) byId('vehicle-name').textContent = `${nombre} · ID ${VEHICLE_ID}`;
}

// ---- Último estado por REST (una petición en vuelo; la marca evita que una respuesta vieja pise un evento nuevo)
const controladorEstado = new AbortController();
let estadoEnCurso = null;
let estadoOtraVez = false;
async function cargarEstado() {
  const marca = ultimo.marca();
  ultimo.cargando();
  try {
    const respuesta = await request(ROUTES.estado, { signal: controladorEstado.signal });
    if (Array.isArray(respuesta?.estado) && respuesta.estado.length === 0) { ultimo.sinDatos(); return; }
    const estado = validarEstado(respuesta);
    if (!estado) { ultimo.error('La API devolvió un estado con formato no válido.'); return; }
    setVehiculo(estado.vehiculo);
    ultimo.aplicarSnapshot(estado, marca, 'rest');
    ultimo.limpiarAviso();
  } catch (error) {
    if (error?.kind === 'abort') return;
    const desconectado = navigator.onLine === false || error?.kind === 'network';
    ultimo.error(desconectado ? 'Desconectado: no se pudo consultar el último estado.' : `Error al consultar el último estado: ${error?.message || error}`, desconectado);
  }
}
function sincronizarEstado() {
  if (estadoEnCurso) { estadoOtraVez = true; return estadoEnCurso; }
  estadoEnCurso = (async () => {
    try { do { estadoOtraVez = false; await cargarEstado(); } while (estadoOtraVez); } finally { estadoEnCurso = null; }
  })();
  return estadoEnCurso;
}
const resincronizar = () => Promise.allSettled([sincronizarEstado(), historial.sincronizar()]);

// ---- DEMO en tiempo real (no es historial): los pasos llegan como comando_individual entre demo_iniciada y demo_completada
let demo = null;
let demoTimer = null;
function cerrarDemo() { clearTimeout(demoTimer); demoTimer = null; demo = null; }

// ---- Manejadores WSS (registro único al cargar el módulo; no se duplican)
registerMessageHandler('estado_inicial', (mensaje) => {
  const item = validarItemEstado(Array.isArray(mensaje?.estado) ? mensaje.estado[0] : null);
  if (!item) return;
  setVehiculo(item.vehiculo);
  ultimo.aplicarSnapshot(item, ultimo.marca(), 'wss');
});
registerMessageHandler('comando_individual', (mensaje) => {
  const comando = validarComandoWss(mensaje);
  if (!comando) { console.warn('[monitoreo] comando_individual con formato no válido', mensaje); return; }
  if (demo) {
    demo.paso += 1;
    estadoDemo.paso(demo);
    ultimo.alComando(comando, { ...demo });
    return; // los pasos de DEMO no se confirman contra la tabla individual
  }
  ultimo.alComando(comando, null);
  historial.confirmarMovimiento(comando).then((fila) => {
    if (fila) ultimo.alPersistido(comando.idSolicitud, fila);
    else ultimo.alNoConfirmado(comando.idSolicitud);
  });
});
registerMessageHandler('comando_individual_completado', (mensaje) => {
  const completado = validarCompletadoWss(mensaje);
  if (completado) ultimo.alCompletado(completado);
});
registerMessageHandler('demo_iniciada', (mensaje) => {
  const datos = validarDemoWss(mensaje);
  if (!datos) return;
  cerrarDemo();
  demo = { ...datos, paso: 0 };
  estadoDemo.iniciada(demo);
  demoTimer = setTimeout(() => {
    estadoDemo.desconocida('No llegó demo_completada dentro del tiempo de seguridad.');
    cerrarDemo();
    void resincronizar();
  }, DEMO_TIMEOUT_MS);
});
registerMessageHandler('demo_completada', (mensaje) => {
  const datos = validarDemoWss(mensaje);
  if (!datos) return;
  estadoDemo.completada(demo && demo.idDemo === datos.idDemo ? demo : null, datos.total);
  cerrarDemo();
  void sincronizarEstado(); // el estado REST confirma el último paso persistido
});

// ---- WebSocket (una conexión por pestaña; reconexión con backoff en core/ws.js)
let abiertoAntes = false;
let enLinea = false;
const context = {
  setStatus(status, estado) {
    indicadores.setWs(status, estado);
    const ahora = status === 'En linea';
    if (ahora && !enLinea && abiertoAntes) {
      // Reconexión: pudieron perderse eventos. Se cierra la DEMO como desconocida y se resincroniza por REST.
      if (demo) { estadoDemo.desconocida('Se perdió la conexión durante la DEMO.'); cerrarDemo(); }
      void resincronizar();
    }
    if (ahora) abiertoAntes = true;
    enLinea = ahora;
    ultimo.conexion(ahora);
  },
  // Contexto requerido por core/events.js; MONITOREO no muestra un registro crudo.
  setVehicleName: setVehiculo,
  setBackendConnectivity: () => {},
  logAction: () => {},
  logEvent: () => {},
  logUnknownEvent: (mensaje) => { if (mensaje?.tipo === 'evento_ignorado') console.info('[monitoreo] evento de otro vehículo ignorado', mensaje.id_vehiculo); },
  demoCompleted: () => {},
  notifyDemoStateUnknown: () => {}
};

void resincronizar();
const ws = createWebSocket(context);

window.addEventListener('online', () => void resincronizar());
window.addEventListener('pagehide', () => {
  ws.close();
  indicadores.detener();
  historial.cancelar();
  controladorEstado.abort();
  cerrarDemo();
}, { once: true });
