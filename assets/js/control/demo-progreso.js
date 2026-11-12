// Tarjeta de progreso de demo. Solo observa: el estado global (demoStarting/demoRunning), los mensajes
// de acción que ya emite demo.js y los eventos WS. No modifica demo.js ni envía peticiones propias
// (el botón "Cancelar demo" invoca la misma cancelarDemo() del panel).
import { registerMessageHandler } from '../core/events.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const OCULTAR_COMPLETADA_MS = 3000;
const OCULTAR_CANCELADA_MS = 2000;
const OCULTAR_DESCONOCIDA_MS = 6000;

/**
 * Mensajes WS con progreso interno de la demo. El contrato actual solo define demo_completada,
 * así que el mapa está vacío y la barra queda indeterminada. Para soportar un mensaje documentado,
 * agrega una entrada: tipo → función que devuelve { movimiento, total? } leyendo sus campos.
 * Ejemplo (NO existe en el contrato actual):
 *   demo_movimiento: (m) => ({ idDemo: m.id_demo, movimiento: m.numero_movimiento, total: m.total_movimientos })
 */
export const PROGRESO_POR_TIPO = Object.freeze({});

// Causas de fin y avisos, reconocidos por los mensajes de acción existentes de demo.js.
const CAUSAS_FIN = [
  [/^Cancelacion de demo aceptada/, 'cancelada'],
  [/^Se agoto el tiempo de seguridad/, 'timeout'],
  [/^La API rechazo el inicio de la demo/, 'rechazada'],
  [/^No se inicio la demo/, 'rechazada'],
  [/^No se pudo preparar el inicio de la demo/, 'rechazada']
];
const AVISOS_DESCONOCIDO = [/^Estado de la demo desconocido/, /^La API no confirmo el inicio/, /^Conexion perdida durante la demo/];

const ESTADOS = Object.freeze({
  iniciando: { titulo: 'Iniciando demo', info: 'Esperando confirmación de la API', icono: ['M12 7v5l3 2', 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z'] },
  ejecutando: { titulo: 'Demo en ejecución', info: 'En curso', icono: ['M8 5.5v13l10.5-6.5L8 5.5Z'] },
  completada: { titulo: 'Demo completada', icono: ['M20 6 9 17l-5-5'] },
  cancelada: { titulo: 'Demo cancelada', icono: ['M18 6 6 18', 'M6 6l12 12'] },
  desconocida: { titulo: 'Estado desconocido', icono: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'] }
});

const ACTIVOS = new Set(['iniciando', 'ejecutando', 'desconocida']);

function crearIcono(paths) {
  const icono = document.createElementNS(SVG_NS, 'svg');
  icono.setAttribute('viewBox', '0 0 24 24');
  icono.setAttribute('aria-hidden', 'true');
  icono.setAttribute('focusable', 'false');
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    icono.append(path);
  }
  return icono;
}

const mmss = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * @param {object} opciones
 * @param {() => object} opciones.getState
 * @param {(fn: Function) => Function} opciones.subscribe
 * @param {() => Promise<boolean>} opciones.cancelar
 */
export function crearDemoProgreso({ getState, subscribe, cancelar }) {
  const byId = (id) => document.getElementById(id);
  const tarjeta = byId('demo-card');
  const deck = tarjeta.closest('.command-deck');
  const icono = byId('demo-card-icono');
  const titulo = byId('demo-card-titulo');
  const nombre = byId('demo-card-nombre');
  const tiempo = byId('demo-card-tiempo');
  const barra = byId('demo-card-barra');
  const detalle = byId('demo-card-detalle');
  const botonCancelar = byId('demo-card-cancelar');

  let fase = null; // null | iniciando | ejecutando | desconocida (activas) | completada | cancelada | desconocida-final
  let demoId = null;
  let inicio = 0;
  let reloj = null;
  let ocultarTimer = null;
  let resolverPendiente = false;
  let causa = null;
  let completada = null; // { id, total }
  let cancelando = false;

  function nombreDemo(id) {
    const demo = [...(getState().demos || []), ...(getState().initialDemos || [])]
      .find((item) => String(item.id_demo) === String(id));
    return demo?.nombre || (id != null ? `Demo ${id}` : 'Demo');
  }

  function pintar(estado, { texto = ESTADOS[estado].titulo, info = ESTADOS[estado].info || '' } = {}) {
    tarjeta.dataset.estado = estado;
    titulo.textContent = texto;
    icono.replaceChildren(crearIcono(ESTADOS[estado].icono));
    detalle.textContent = info;
    const activa = ACTIVOS.has(estado) && fase !== 'desconocida-final';
    botonCancelar.hidden = !activa;
    botonCancelar.disabled = cancelando;
    botonCancelar.textContent = cancelando ? 'Cancelando…' : 'Cancelar demo';
    if (estado === 'completada') {
      barra.setAttribute('aria-valuenow', '100');
      barra.setAttribute('aria-valuetext', '100 %');
    } else {
      barra.removeAttribute('aria-valuenow');
      barra.setAttribute('aria-valuetext', ACTIVOS.has(estado) ? 'En curso' : texto);
    }
  }

  function tic() { tiempo.textContent = mmss(Date.now() - inicio); }

  function mostrar() {
    clearTimeout(ocultarTimer); ocultarTimer = null;
    tarjeta.hidden = false;
    deck.dataset.demoActiva = 'true';
  }

  function ocultarEn(ms) {
    clearTimeout(ocultarTimer);
    ocultarTimer = setTimeout(() => {
      tarjeta.hidden = true;
      delete deck.dataset.demoActiva;
      fase = null;
    }, ms);
  }

  function comenzar(id) {
    demoId = id; inicio = Date.now(); causa = null; completada = null; cancelando = false;
    nombre.textContent = nombreDemo(id);
    delete barra.dataset.movimiento;
    barra.style.removeProperty('--progreso');
    tic();
    clearInterval(reloj);
    reloj = setInterval(tic, 1000);
    mostrar();
  }

  function terminar(estado, opciones, ocultarMs) {
    clearInterval(reloj); reloj = null;
    tic();
    cancelando = false;
    fase = estado === 'desconocida' ? 'desconocida-final' : estado;
    pintar(estado, opciones);
    ocultarEn(ocultarMs);
  }

  function resolverFin() {
    resolverPendiente = false;
    if (getState().demoRunning || getState().demoStarting) return; // se reactivó
    if (completada && String(completada.id) === String(demoId)) {
      const n = Number(completada.total);
      const info = Number.isFinite(n) ? `Demo completada · ${n} ${n === 1 ? 'movimiento' : 'movimientos'}` : 'Demo completada';
      terminar('completada', { texto: info }, OCULTAR_COMPLETADA_MS);
    } else if (causa === 'cancelada') {
      terminar('cancelada', {}, OCULTAR_CANCELADA_MS);
    } else if (causa === 'rechazada') {
      terminar('cancelada', { texto: 'Demo no iniciada', info: 'La demo no llegó a iniciarse.' }, OCULTAR_CANCELADA_MS);
    } else {
      // Timeout de seguridad u otra causa no confirmada: no se afirma nada sobre el vehículo.
      terminar('desconocida', { info: causa === 'timeout' ? 'Venció el tiempo de seguridad sin confirmación.' : 'No se recibió confirmación del final.' }, OCULTAR_DESCONOCIDA_MS);
    }
  }

  subscribe((state) => {
    const activa = state.demoStarting || state.demoRunning;
    if (activa) {
      if (!fase || !ACTIVOS.has(fase)) comenzar(state.demoId);
      if (fase === 'desconocida') return; // aviso fijo hasta que termine
      const siguiente = state.demoRunning ? 'ejecutando' : 'iniciando';
      if (siguiente !== fase) { fase = siguiente; pintar(fase, barra.dataset.movimiento ? { info: detalle.textContent } : undefined); }
      return;
    }
    // demo.js limpia el estado antes de emitir el mensaje de causa: se resuelve tras ese mensaje.
    if (fase && ACTIVOS.has(fase) && !resolverPendiente) {
      resolverPendiente = true;
      setTimeout(resolverFin, 0);
    }
  });

  botonCancelar.addEventListener('click', () => {
    if (cancelando) return;
    cancelando = true;
    pintar(fase === 'desconocida' ? 'desconocida' : fase);
    void cancelar();
  });

  // Mensajes de acción que ya emite demo.js (llamado desde logAction en main.js).
  function alAccion(message) {
    if (typeof message !== 'string' || !fase) return;
    if (message.startsWith('No se pudo cancelar la demo')) {
      cancelando = false;
      if (ACTIVOS.has(fase)) pintar(fase);
      return;
    }
    for (const [patron, valor] of CAUSAS_FIN) if (patron.test(message)) { causa = valor; return; }
    if (ACTIVOS.has(fase) && AVISOS_DESCONOCIDO.some((patron) => patron.test(message))) {
      fase = 'desconocida';
      pintar('desconocida', { texto: 'Estado desconocido', info: 'Bloqueo mantenido hasta confirmar el final o cancelar.' });
    }
  }

  // Se llama ANTES de completarDemo() para conservar el dato aunque demo.js limpie el estado.
  function alCompletar(message) {
    completada = { id: message?.id_demo, total: message?.total_movimientos };
  }

  function alMovimiento(lectura) {
    if (!lectura || !ACTIVOS.has(fase)) return;
    if (lectura.idDemo != null && String(lectura.idDemo) !== String(demoId)) return;
    const n = Number(lectura.movimiento);
    if (!Number.isFinite(n)) return;
    const total = Number(lectura.total);
    detalle.textContent = Number.isFinite(total) && total > 0 ? `Movimiento ${n} de ${total}` : `Movimiento ${n}`;
    if (Number.isFinite(total) && total > 0) {
      barra.dataset.movimiento = 'determinado';
      barra.style.setProperty('--progreso', `${Math.min(100, (n / total) * 100)}%`);
      barra.setAttribute('aria-valuenow', String(Math.round(Math.min(100, (n / total) * 100))));
    }
  }

  for (const [tipo, leer] of Object.entries(PROGRESO_POR_TIPO)) {
    registerMessageHandler(tipo, (message) => {
      try { alMovimiento(leer(message)); } catch { /* mensaje con forma inesperada: se ignora */ }
    });
  }

  return { alAccion, alCompletar };
}
