export const API_BASE = 'https://vehiculo-iot-itp.duckdns.org';
export const APP_NAME = 'Carrito Jesus';
export const AUTOR_NOMBRE = 'Navarro Carbajal Jesus Alfonso';
export const MATRICULA = '22200964';
export const ANIO = 2026;
// Páginas de la navegación principal (rutas relativas a la raíz del sitio).
// Para agregar una página nueva basta con añadir una entrada aquí.
export const PAGINAS = Object.freeze([
  Object.freeze({ id: 'control', href: 'index.html', etiqueta: 'Control', icono: 'control' }),
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
  cancelDemo: `/api/vehiculos/${VEHICLE_ID}/demos/cancelar`
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
