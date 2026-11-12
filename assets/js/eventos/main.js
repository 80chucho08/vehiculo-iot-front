// Registro de eventos: conexión WSS propia y de solo lectura al mismo vehículo.
// No envía nada por el socket ni llama a endpoints de comandos; solo muestra lo que publica el backend.
import { APP_NAME, VEHICLE_ID } from '../core/config.js';
import { createWebSocket } from '../core/ws.js';
import { montarNavegacion, montarCreditos } from '../core/layout.js';

const MAX_EVENTOS = 200;
const byId = (id) => document.getElementById(id);

const lista = byId('eventos-lista');
const vacio = byId('eventos-vacio');
const contador = byId('eventos-contador');
const botonPausar = byId('eventos-pausar');
const botonLimpiar = byId('eventos-limpiar');
const avisoPausa = byId('eventos-pausa');
const tarjetaWs = byId('ws-status');

let pausado = false;
let omitidos = 0;

montarNavegacion(document.querySelector('[data-nav]'), 'eventos', { mostrarEtiqueta: true });
montarCreditos(byId('app-credits'));
document.title = `${APP_NAME} · Eventos`;
document.querySelector('.brand-logo').setAttribute('aria-label', APP_NAME);
byId('vehicle-name').textContent = `Vehículo ID ${VEHICLE_ID}`;

function actualizarResumen() {
  const total = lista.children.length;
  contador.textContent = String(total);
  vacio.hidden = total > 0;
  botonLimpiar.disabled = total === 0;
  avisoPausa.hidden = !pausado;
  avisoPausa.textContent = pausado ? `En pausa · ${omitidos} ${omitidos === 1 ? 'evento omitido' : 'eventos omitidos'}` : '';
}

function agregarEvento(mensaje, { desconocido = false } = {}) {
  if (pausado) { omitidos += 1; actualizarResumen(); return; }
  const ahora = new Date();
  const item = document.createElement('li');
  item.className = 'evento';
  if (desconocido) item.dataset.desconocido = 'true';

  const cabecera = document.createElement('div');
  cabecera.className = 'evento-cabecera';
  const hora = document.createElement('time');
  hora.dateTime = ahora.toISOString();
  hora.textContent = ahora.toLocaleTimeString();
  const tipo = document.createElement('strong');
  tipo.className = 'evento-tipo';
  tipo.textContent = typeof mensaje?.tipo === 'string' ? mensaje.tipo : 'tipo desconocido';
  cabecera.append(hora, tipo);

  // JSON crudo siempre con textContent: el contenido del backend nunca se interpreta como HTML.
  const crudo = document.createElement('pre');
  crudo.className = 'evento-json';
  try { crudo.textContent = JSON.stringify(mensaje, null, 2); } catch { crudo.textContent = String(mensaje); }

  item.append(cabecera, crudo);
  lista.prepend(item);
  while (lista.children.length > MAX_EVENTOS) lista.lastElementChild.remove();
  actualizarResumen();
}

const noop = () => {};
const context = {
  setStatus(status, state) {
    tarjetaWs.dataset.estado = state;
    tarjetaWs.querySelector('p').textContent = status === 'En linea' ? 'En línea' : status;
  },
  setVehicleName(name) {
    if (typeof name === 'string' && name.trim()) byId('vehicle-name').textContent = name;
  },
  logEvent: (mensaje) => agregarEvento(mensaje),
  logUnknownEvent: (mensaje) => agregarEvento(mensaje, { desconocido: true }),
  // Los manejadores compartidos de core/events.js esperan estas funciones; aquí no actúan.
  setBackendConnectivity: noop,
  logAction: noop,
  demoCompleted: noop,
  notifyDemoStateUnknown: noop
};

botonPausar.addEventListener('click', () => {
  pausado = !pausado;
  if (pausado) omitidos = 0;
  botonPausar.textContent = pausado ? 'Reanudar' : 'Pausar';
  botonPausar.setAttribute('aria-pressed', String(pausado));
  actualizarResumen();
});
botonLimpiar.addEventListener('click', () => {
  lista.replaceChildren();
  actualizarResumen();
});

actualizarResumen();
const ws = createWebSocket(context);
window.addEventListener('pagehide', () => ws.close(), { once: true });
