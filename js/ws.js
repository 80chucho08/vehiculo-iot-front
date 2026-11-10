import { WS_URL } from './config.js';
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

  function connect(force = false) {
    if (stopped) return;
    if (navigator.onLine === false) { setStatus('Desconectado', 'error'); return; }
    if (socket?.readyState === WebSocket.OPEN) return;
    if (socket?.readyState === WebSocket.CONNECTING && !force) return;

    clearTimeout(retryTimer); retryTimer = null;
    clearConnectionTimers();
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
    const currentAttempt = ++attempt;
    setStatus(hasOpened || retry ? 'Reconectando' : 'Conectando', 'cargando');

    let candidate;
    try { candidate = new WebSocket(WS_URL); }
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

    candidate.addEventListener('close', () => {
      if (socket !== candidate || currentAttempt !== attempt) return;
      clearConnectionTimers();
      scheduleRetry();
    });
  }

  function onOffline() {
    clearTimeout(retryTimer); retryTimer = null;
    setStatus('Desconectado', 'error');
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
  function reconnectWhenAvailable() {
    if (socket?.readyState !== WebSocket.OPEN) connect(true);
  }

  window.addEventListener('online', reconnectWhenAvailable);
  window.addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', reconnectWhenAvailable);
  connect();

  return {
    close() {
      stopped = true;
      clearTimeout(retryTimer); retryTimer = null;
      clearConnectionTimers();
      window.removeEventListener('online', reconnectWhenAvailable);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', reconnectWhenAvailable);
      if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'Cierre de aplicacion');
    }
  };
}
