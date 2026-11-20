import { WS_URL, WS_TICKET_ROUTE, VEHICLE_ID } from './config.js';
import { request } from './api.js';
import { tokenActual } from './sesion.js';

// Etapa 8: con sesión se pide un ticket de un solo uso (30 s) para ESTA unidad y se abre
// ws(s)://…/ws/vehiculos/{id}?ticket=…  El token de sesión nunca va en la URL.
// Sin sesión se conecta como anónimo: la API decide (transición) y cierra con 4401 si no procede.
async function urlDeConexion() {
  if (!tokenActual()) return WS_URL;
  const r = await request(WS_TICKET_ROUTE, { method: 'POST', body: { id_vehiculo: VEHICLE_ID } });
  return typeof r?.ticket === 'string' ? `${WS_URL}?ticket=${encodeURIComponent(r.ticket)}` : WS_URL;
}
const SIN_ACCESO = new Set([401, 403, 404]);
import { dispatchMessage } from './events.js';

const CONNECTION_TIMEOUT_MS = 10000;
const STABLE_CONNECTION_MS = 10000;

export function createWebSocket(context) {
  let socket = null;
  let stopped = false;
  let retry = 0;
  let retryTimer = null;
  let connectionTimer = null;
  let stableTimer = null;
  let attempt = 0;
  let hasOpened = false;
  let justReconnected = false;
  let preparando = false;
  const setStatus = context.setStatus;

  context.consumeReconnection = () => {
    const result = justReconnected;
    justReconnected = false;
    return result;
  };

  function clearConnectionTimers() {
    clearTimeout(connectionTimer); connectionTimer = null;
    clearTimeout(stableTimer); stableTimer = null;
  }

  function scheduleRetry() {
    if (stopped) return;
    if (navigator.onLine === false) {
      setStatus('Desconectado', 'error');
      return;
    }
    setStatus(hasOpened || retry ? 'Reconectando' : 'Desconectado', hasOpened || retry ? 'cargando' : 'error');
    if (retryTimer) return;
    const base = Math.min(30000, 1000 * 2 ** Math.min(retry, 5));
    const delay = Math.round(base * (0.8 + Math.random() * 0.4));
    retry += 1;
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay);
  }

  async function connect() {
    if (stopped || preparando) return;
    if (navigator.onLine === false) { setStatus('Desconectado', 'error'); return; }
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

    clearTimeout(retryTimer); retryTimer = null;
    clearConnectionTimers();
    const currentAttempt = ++attempt;
    setStatus(hasOpened || retry ? 'Reconectando' : 'Conectando', 'cargando');

    let url;
    preparando = true;
    try { url = await urlDeConexion(); }
    catch (error) {
      preparando = false;
      if (SIN_ACCESO.has(error?.status)) {
        // Sin permiso para esta unidad: se informa y se reintenta lento (por si se concede después).
        setStatus('Sin acceso', 'error');
        context.onAccesoDenegado?.(error);
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { retryTimer = null; connect(); }, 30000);
        return;
      }
      scheduleRetry();
      return;
    }
    preparando = false;
    if (stopped || attempt !== currentAttempt) return;
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;

    let candidate;
    try { candidate = new WebSocket(url); }
    catch { scheduleRetry(); return; }
    socket = candidate;

    connectionTimer = setTimeout(() => {
      if (socket === candidate && candidate.readyState === WebSocket.CONNECTING) {
        candidate.close();
        scheduleRetry();
      }
    }, CONNECTION_TIMEOUT_MS);

    candidate.addEventListener('open', () => {
      if (socket !== candidate || currentAttempt !== attempt) return;
      clearTimeout(connectionTimer); connectionTimer = null;
      if (navigator.onLine === false) {
        setStatus('Desconectado', 'error');
        candidate.close();
        return;
      }
      justReconnected = hasOpened;
      hasOpened = true;
      setStatus('En linea', 'ok');
      stableTimer = setTimeout(() => { if (socket === candidate) retry = 0; }, STABLE_CONNECTION_MS);
    });

    candidate.addEventListener('message', (event) => {
      if (socket !== candidate || currentAttempt !== attempt) return;
      retry = 0;
      clearTimeout(stableTimer); stableTimer = null;
      let message;
      try { message = JSON.parse(event.data); }
      catch {
        context.logUnknownEvent({ error: 'JSON invalido', crudo: String(event.data) });
        return;
      }
      try { dispatchMessage(message, context); }
      catch (error) {
        context.logUnknownEvent({
          error: 'error interno del manejador',
          tipo: typeof message?.tipo === 'string' ? message.tipo : 'tipo desconocido',
          detalle: error instanceof Error ? error.message : String(error),
          mensaje: message
        });
      }
    });

    candidate.addEventListener('error', () => {
      if (socket === candidate && navigator.onLine !== false) setStatus('Reconectando', 'cargando');
    });

    candidate.addEventListener('close', (event) => {
      if (socket !== candidate || currentAttempt !== attempt) return;
      clearConnectionTimers();
      // 4401 sin credencial · 4403 acceso revocado: el reintento pide un ticket nuevo y la API decide otra vez.
      if (event.code === 4401 || event.code === 4403) context.onAccesoDenegado?.({ codigo: event.code, motivo: event.reason });
      scheduleRetry();
    });
  }

  function onOffline() {
    clearTimeout(retryTimer); retryTimer = null;
    setStatus('Desconectado', 'error');
    if (socket?.readyState === WebSocket.OPEN) socket.close();
  }
  function reconnectWhenAvailable() {
    if (navigator.onLine === false) return;
    if (!socket || socket.readyState === WebSocket.CLOSED || socket.readyState === WebSocket.CLOSING) connect();
  }

  window.addEventListener('online', reconnectWhenAvailable);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', reconnectWhenAvailable);
  connect();

  return {
    close() {
      stopped = true;
      clearTimeout(retryTimer); retryTimer = null;
      if (socket?.readyState !== WebSocket.CONNECTING) clearConnectionTimers();
      window.removeEventListener('online', reconnectWhenAvailable);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', reconnectWhenAvailable);
      if (socket?.readyState === WebSocket.OPEN) socket.close(1000, 'Cierre de aplicacion');
    }
  };
}
