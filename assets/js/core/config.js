export const API_BASE = 'https://vehiculo-iot-itp.duckdns.org';
export const APP_NAME = 'Carrito Jesus';
export const AUTOR_NOMBRE = 'Navarro Carbajal Jesus Alfonso';
export const MATRICULA = '22200964';
export const ANIO = 2026;
// Páginas de la navegación principal (rutas relativas a la raíz del sitio).
// Para agregar una página nueva basta con añadir una entrada aquí.
export const PAGINAS = Object.freeze([
  Object.freeze({ id: 'control', href: 'index.html', etiqueta: 'Control', icono: 'control' }),
  Object.freeze({ id: 'monitoreo', href: 'monitoreo.html', etiqueta: 'Monitoreo', icono: 'monitoreo' }),
  Object.freeze({ id: 'eventos', href: 'eventos.html', etiqueta: 'Eventos', icono: 'eventos' })
]);
export const VEHICLE_ID = 1;
export const WS_URL = `${API_BASE.replace(/^https:/, 'wss:')}/ws/vehiculos/${VEHICLE_ID}`;
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
