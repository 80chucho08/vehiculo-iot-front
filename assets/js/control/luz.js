// Interruptor de luz (código 8, toggle). Muestra un estado ESTIMADO que solo alterna con evidencia:
//  1) evento WS comando_individual_completado de la luz, o
//  2) aceptación HTTP (2xx) del POST si el evento no llega en LUZ_CONFIRM_TIMEOUT_MS.
// No envía comandos: el clic llama a enviarComando() igual que cualquier otro botón y este módulo
// solo escucha los callbacks existentes (onAction, onChange, onCorrelatedEvent) y los mensajes WS.
import { LUZ_CODIGO, LUZ_ESTADO_INICIAL, LUZ_CONFIRM_TIMEOUT_MS } from '../core/config.js';
import { registerMessageHandler } from '../core/events.js';
import { consumirSolicitud } from './commands.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_IDS_VISTOS = 100;
const ERROR_VISIBLE_MS = 2200;
const ESPERA_EVENTO_TARDIO_MS = 30000;

function svg(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function crearIconoFoco() {
  const icono = svg('svg', { viewBox: '0 0 24 24', class: 'luz-icono', 'aria-hidden': 'true', focusable: 'false' });
  icono.append(
    svg('circle', { class: 'luz-brillo', cx: '12', cy: '10', r: '9' }),
    svg('path', { class: 'luz-bulbo', d: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z' })
  );
  return icono;
}

/**
 * @param {object} opciones
 * @param {() => boolean} opciones.isMovementInFlight
 * @param {() => Array} opciones.getCatalog
 */
export function crearLuz({ isMovementInFlight, getCatalog }) {
  let encendida = LUZ_ESTADO_INICIAL;
  let errorHasta = 0;
  let errorTimer = null;
  let boton = null;
  // Intentos locales en orden: 'enviando' → 'aceptado' (espera evento) → 'confirmado_http' (espera evento tardío).
  const intentos = [];
  const idsVistos = new Set();

  const comandoLuz = () => getCatalog().find((item) => Number(item.codigo) === LUZ_CODIGO);
  const nombreLuz = () => comandoLuz()?.nombre;

  function estadoVisual() {
    if (Date.now() < errorHasta) return 'error';
    if (intentos.some((item) => item.fase === 'enviando' || item.fase === 'aceptado')) return 'enviando';
    return encendida ? 'encendida' : 'apagada';
  }

  function pintar() {
    // El botón puede estar recién creado (aún fuera del DOM) o haberse re-renderizado.
    if (!boton?.isConnected) boton = document.querySelector('.luz-switch') || boton;
    if (!boton) return;
    const estado = estadoVisual();
    const texto = `Luz: ${encendida ? 'encendida' : 'apagada'}`;
    boton.dataset.estado = estado;
    boton.dataset.luz = encendida ? 'encendida' : 'apagada';
    boton.setAttribute('aria-pressed', String(encendida));
    boton.setAttribute('aria-busy', String(estado === 'enviando'));
    boton.querySelector('.luz-texto').textContent = texto;
    boton.title = estado === 'error'
      ? 'Sin confirmación: el estado estimado no cambió'
      : 'Estado estimado; no confirma el estado físico de la luz';
  }

  function alternar() { encendida = !encendida; pintar(); }

  function mostrarError() {
    errorHasta = Date.now() + ERROR_VISIBLE_MS;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(pintar, ERROR_VISIBLE_MS + 20);
    pintar();
  }

  function recordarId(id) {
    idsVistos.add(id);
    while (idsVistos.size > MAX_IDS_VISTOS) idsVistos.delete(idsVistos.values().next().value);
  }

  function quitar(intento) {
    clearTimeout(intento.timer);
    const index = intentos.indexOf(intento);
    if (index >= 0) intentos.splice(index, 1);
  }

  function esEventoDeLuz(message, codigo) {
    if (codigo !== undefined) return Number(codigo) === LUZ_CODIGO;
    if (message?.codigo != null) return Number(message.codigo) === LUZ_CODIGO;
    if (message?.id_comando == null) return false;
    // Con catálogo cargado se traduce id_comando → código; sin él se aplica el contrato (id_comando 8).
    const porId = getCatalog().find((item) => Number(item.id_comando) === Number(message.id_comando));
    return porId ? Number(porId.codigo) === LUZ_CODIGO : Number(message.id_comando) === LUZ_CODIGO;
  }

  // Evidencia 1: evento WS. Cada id_solicitud cuenta una sola vez.
  function alRecibirEvento(message, codigo) {
    if (!esEventoDeLuz(message, codigo)) return;
    const id = message?.id_solicitud;
    if (id) {
      if (idsVistos.has(id)) return;
      recordarId(id);
    }
    const esPropio = codigo !== undefined;
    const pendiente = intentos.find((item) => !item.eventoRecibido && (item.fase === 'aceptado' || item.fase === 'enviando'));
    if (pendiente && (esPropio || pendiente.fase === 'enviando')) {
      // Evento de un intento propio (o evento temprano que llega antes de la respuesta HTTP).
      pendiente.eventoRecibido = true;
      if (pendiente.fase === 'aceptado') quitar(pendiente);
      alternar();
      return;
    }
    const tardio = esPropio ? intentos.find((item) => item.fase === 'confirmado_http') : null;
    if (tardio) { quitar(tardio); return; } // ya se alternó por la aceptación HTTP
    alternar(); // evento de otra sesión u origen: también es evidencia
  }

  // Callbacks existentes de commands.js (mensajes de acción y cambios de estado).
  function alAccion(message) {
    const nombre = nombreLuz();
    if (!nombre || typeof message !== 'string') return;
    if (message.startsWith(`Comando "${nombre}" solicitado desde `)) {
      intentos.push({ fase: 'enviando', eventoRecibido: false, timer: null });
      pintar();
      return;
    }
    if (message.startsWith(`Comando "${nombre}" aceptado por API`)) {
      const intento = intentos.find((item) => item.fase === 'enviando');
      if (!intento) return;
      if (intento.eventoRecibido) { quitar(intento); pintar(); return; }
      intento.fase = 'aceptado';
      // Evidencia 2: aceptación HTTP sin evento dentro del plazo.
      intento.timer = setTimeout(() => {
        if (intento.fase !== 'aceptado') return;
        intento.fase = 'confirmado_http';
        intento.timer = setTimeout(() => quitar(intento), ESPERA_EVENTO_TARDIO_MS);
        alternar();
      }, LUZ_CONFIRM_TIMEOUT_MS);
      pintar();
    }
  }

  function alCambiar() {
    // La petición terminó sin mensaje de aceptación: falló (409, timeout, red) o DETENER la abortó.
    if (isMovementInFlight()) return;
    const fallidos = intentos.filter((item) => item.fase === 'enviando');
    if (!fallidos.length) return;
    for (const intento of fallidos) {
      // Si su evento ya había llegado, la luz ya alternó con esa evidencia.
      quitar(intento);
    }
    if (fallidos.some((item) => !item.eventoRecibido)) mostrarError();
    else pintar();
  }

  // El firmware se reinició: vuelve al estado inicial y descarta lo pendiente.
  function restablecer() {
    for (const intento of [...intentos]) quitar(intento);
    encendida = LUZ_ESTADO_INICIAL;
    errorHasta = 0;
    pintar();
  }

  function crearBoton(command, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-button luz-switch';
    button.dataset.commandCode = command.codigo;
    button.dataset.tipo = 'toggle';
    button.dataset.estadoOriginal = command.activo ? 'ok' : 'error';
    button.disabled = !command.activo;

    const track = document.createElement('span');
    track.className = 'luz-track';
    track.setAttribute('aria-hidden', 'true');
    const knob = document.createElement('span');
    knob.className = 'luz-knob';
    track.append(knob);

    const etiqueta = document.createElement('span');
    etiqueta.className = 'luz-etiqueta';
    const texto = document.createElement('span');
    texto.className = 'luz-texto';
    const estimado = document.createElement('span');
    estimado.className = 'luz-estimado';
    estimado.textContent = ' (estimado)';
    etiqueta.append(texto, estimado);

    button.append(crearIconoFoco(), etiqueta, track);
    button.addEventListener('click', () => onClick(command.codigo));
    boton = button;
    pintar();
    return button;
  }

  // Reemplaza el manejador de comando_individual_completado conservando su comportamiento original
  // (correlación con consumirSolicitud y mensaje de acción) y añadiendo la evidencia de la luz.
  registerMessageHandler('comando_individual_completado', (message, context) => {
    const codigo = consumirSolicitud(message.id_solicitud, message);
    if (codigo !== undefined) context.logAction(`Evento recibido para el comando ${codigo}: ${message.comando || message.id_comando} completado (${message.estado || 'estado no indicado'}).`, 'ok', message.id_solicitud);
    alRecibirEvento(message, codigo);
  });
  registerMessageHandler('dispositivo_estado', (message) => {
    if (message?.conectado === true) restablecer();
  });

  return { crearBoton, alAccion, alCambiar, alRecibirEvento, restablecer, pintar, estaEncendida: () => encendida };
}
