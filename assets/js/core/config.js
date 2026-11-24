const API_PRODUCCION = 'https://vehiculo-iot-itp.duckdns.org';
// Solo para pruebas locales: en localhost/127.0.0.1 se puede apuntar a una API local con
// ?api=http://127.0.0.1:8010 (únicamente hosts locales). En GitHub Pages siempre se usa producción.
function apiBase() {
  try {
    const local = ['localhost', '127.0.0.1'].includes(location.hostname);
    const pedida = local ? new URLSearchParams(location.search).get('api') : null;
    if (pedida && /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(pedida)) return pedida;
  } catch { /* sin location (pruebas en Node) */ }
  return API_PRODUCCION;
}
export const API_BASE = apiBase();
export const APP_NAME = 'Carrito Jesus';
export const AUTOR_NOMBRE = 'Navarro Carbajal Jesus Alfonso';
export const MATRICULA = '22200964';
export const ANIO = 2026;
// Páginas de la navegación principal (rutas relativas a la raíz del sitio).
// Para agregar una página nueva basta con añadir una entrada aquí.
export const PAGINAS = Object.freeze([
  Object.freeze({ id: 'control', href: 'index.html', etiqueta: 'Control', icono: 'control' }),
  Object.freeze({ id: 'monitoreo', href: 'monitoreo.html', etiqueta: 'Monitoreo', icono: 'monitoreo' }),
  Object.freeze({ id: 'eventos', href: 'eventos.html', etiqueta: 'Eventos', icono: 'eventos' }),
  Object.freeze({ id: 'catalogo', href: 'catalogo.html', etiqueta: 'Catálogo', icono: 'catalogo' }),
  Object.freeze({ id: 'administracion', href: 'administracion.html', etiqueta: 'Administración', icono: 'administracion' })
]);

// ===== ADMINISTRACIÓN (4.3) · rutas verificadas en /openapi.json de la API 1.1.0 =====
export const AUTH_ROUTES = Object.freeze({
  login: '/api/auth/login', renovar: '/api/auth/renovar', logout: '/api/auth/logout',
  yo: '/api/auth/yo', cambiarPassword: '/api/auth/cambiar-password'
});
export const ADMIN_ROUTES = Object.freeze({
  dashboard: '/api/admin/dashboard',
  inventario: '/api/admin/inventario',
  modelos: '/api/admin/modelos', modelo: (id) => `/api/admin/modelos/${encodeURIComponent(id)}`,
  unidades: '/api/admin/unidades', unidad: (id) => `/api/admin/unidades/${encodeURIComponent(id)}`,
  tokenDispositivo: (id) => `/api/admin/unidades/${encodeURIComponent(id)}/token-dispositivo`,
  comandosUnidad: (id) => `/api/vehiculos/${encodeURIComponent(id)}/comandos`,
  permisosComando: (id) => `/api/admin/comandos/${encodeURIComponent(id)}`,
  usuarios: '/api/admin/usuarios', usuario: (id) => `/api/admin/usuarios/${encodeURIComponent(id)}`,
  passwordUsuario: (id) => `/api/admin/usuarios/${encodeURIComponent(id)}/password`,
  asignaciones: '/api/admin/asignaciones',
  finalizarAsignacion: (id) => `/api/admin/asignaciones/${encodeURIComponent(id)}/finalizar`,
  auditoria: '/api/admin/auditoria',
  misVehiculos: '/api/mis-vehiculos',
  soporte: (id) => `/api/mis-vehiculos/${encodeURIComponent(id)}/soporte`,
  // V009: comandos propios, reportes de falla y gestión de demos/comandos del admin
  misComandos: (id) => `/api/mis-vehiculos/${encodeURIComponent(id)}/comandos`,
  miComando: (id, idComando) => `/api/mis-vehiculos/${encodeURIComponent(id)}/comandos/${encodeURIComponent(idComando)}`,
  misReportes: (id) => `/api/mis-vehiculos/${encodeURIComponent(id)}/reportes`,
  comandosAdmin: (id) => `/api/admin/unidades/${encodeURIComponent(id)}/comandos`,
  crearComandoFabrica: (id) => `/api/vehiculos/${encodeURIComponent(id)}/comandos`,
  desactivarComando: (id) => `/api/comandos/${encodeURIComponent(id)}`,
  demosAdmin: (id) => `/api/admin/unidades/${encodeURIComponent(id)}/demos`,
  demoAdmin: (id) => `/api/admin/demos/${encodeURIComponent(id)}`,
  reportes: '/api/admin/reportes', reporte: (id) => `/api/admin/reportes/${encodeURIComponent(id)}`
});
// Sesión: el token dura 30 min; se renueva cuando faltan RENOVAR_ANTES_MS (tope absoluto 8 h, lo impone la API).
export const SESION_CLAVE = 'ciot-sesion';
// Etapas 7-8
export const WS_TICKET_ROUTE = '/api/ws/ticket';
export const INVITADO_ROUTES = Object.freeze({
  catalogo: '/api/catalogo', reservar: '/api/invitado/sesiones', sesion: '/api/invitado/sesion'
});
export const RENOVAR_ANTES_MS = 5 * 60 * 1000;
// Unidad que operan CONTROL, MONITOREO y EVENTOS: ?vehiculo=N en la URL (entero positivo) o, por
// omisión, la unidad de exhibición (1). Elegirla en el selector solo cambia lo que se PIDE: la API
// decide si el usuario puede verla u operarla (404 si no es suya).
export const VEHICULO_POR_OMISION = 1;
function vehiculoElegido() {
  try {
    const texto = new URLSearchParams(location.search).get('vehiculo');
    if (texto && /^[1-9]\d{0,8}$/.test(texto)) return Number(texto);
  } catch { /* sin location (pruebas en Node) */ }
  return VEHICULO_POR_OMISION;
}
export const VEHICLE_ID = vehiculoElegido();
// Parámetros de la URL que se conservan al navegar entre páginas.
export const PARAMETROS_PERSISTENTES = Object.freeze(['vehiculo', 'api']);
export const WS_URL = `${API_BASE.replace(/^http/, 'ws')}/ws/vehiculos/${VEHICLE_ID}`; // https→wss, http→ws (local)
// Métodos de detener y demos deben CONFIRMAR EN SWAGGER.
export const ROUTES = Object.freeze({
  apiHealth: '/', dbHealth: '/health/db',
  commands: `/api/vehiculos/${VEHICLE_ID}/comandos`, demos: `/api/vehiculos/${VEHICLE_ID}/demos`,
  executeCommand: (id) => `/api/vehiculos/${VEHICLE_ID}/comandos/${encodeURIComponent(id)}/ejecutar`,
  stop: `/api/vehiculos/${VEHICLE_ID}/detener`,
  executeDemo: (id) => `/api/vehiculos/${VEHICLE_ID}/demos/${encodeURIComponent(id)}/ejecutar`,
  cancelDemo: `/api/vehiculos/${VEHICLE_ID}/demos/cancelar`,
  // MONITOREO (verificados en /openapi.json y con respuestas reales el 2026-11-13)
  estado: `/api/vehiculos/${VEHICLE_ID}/estado`,
  historial: `/api/vehiculos/${VEHICLE_ID}/historial` // sin parámetros: devuelve TODO el historial
});
export const HTTP_METHODS = Object.freeze({ executeCommand: 'POST', stop: 'POST', executeDemo: 'POST', cancelDemo: 'POST' }); // CONFIRMAR EN SWAGGER
export const REQUEST_TIMEOUT_MS = 8000;
export const HEALTH_INTERVAL_MS = 30000;
export const DEMO_TIMEOUT_MS = 180000;
export const STOP_REQUEST_TIMEOUT_MS = 1800;
export const JOYSTICK_AXIS_HYSTERESIS = 0.12;
// En la prueba del usuario, los toggles interrumpen un comando sostenido.
export const TOGGLE_INTERRUPTS_MOVEMENT = true;
// Luz (código 8, toggle). El estado mostrado es una ESTIMACIÓN, nunca el estado físico confirmado.
export const LUZ_CODIGO = 8;
export const LUZ_ESTADO_INICIAL = true; // encendida al cargar la página y tras reiniciarse el firmware
export const LUZ_CONFIRM_TIMEOUT_MS = 2000; // espera del evento WS antes de aceptar la confirmación HTTP

// ===== MONITOREO =====
// Las fechas del backend (fecha_hora, fecha_actualizacion) llegan sin sufijo de zona pero están en UTC
// (verificado: POST a las 05:50:13 UTC → fila 05:51:24, desfase de reloj de ~1 min, no de zona).
export const ZONA_HORARIA_BACKEND = 'UTC';
// Zona en la que se MUESTRAN las horas; se indica en pantalla.
export const ZONA_HORARIA_VISTA = 'America/Mexico_City';
export const HISTORIAL_FILAS = 10;
// Los pasos de una DEMO se persisten con origen "demo"; no forman parte de la tabla de movimientos individuales.
export const HISTORIAL_ORIGENES_EXCLUIDOS = Object.freeze(['demo']);
// Esperas para confirmar en RDS (vía REST) un movimiento publicado por WSS. Sin polling continuo.
export const HISTORIAL_AGRUPAR_MS = 400;
export const HISTORIAL_REINTENTOS_MS = Object.freeze([900, 2500]);
