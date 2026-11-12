import { API_BASE, REQUEST_TIMEOUT_MS } from './config.js';

export class ApiError extends Error {
  constructor(message, { status = 0, detail = null, kind = 'api' } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.kind = kind;
  }
}

function errorText(payload, status) {
  if ([502, 503, 504].includes(status)) return 'El servidor no esta disponible temporalmente.';
  const detail = payload?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      const location = Array.isArray(item?.loc) ? item.loc.join('.') : '';
      return [location, item?.msg].filter(Boolean).join(': ');
    }).filter(Boolean).join('; ') || 'La solicitud contiene datos no validos.';
  }
  return `La solicitud fue rechazada por el servidor (HTTP ${status}).`;
}

async function parseJsonTolerant(response) {
  try {
    const raw = await response.text();
    if (!raw) return { parsed: false, value: null };
    try { return { parsed: true, value: JSON.parse(raw) }; }
    catch { return { parsed: false, value: null }; }
  } catch { return { parsed: false, value: null }; }
}

function throwIfRequestWasAborted(timedOut, parentSignal) {
  if (timedOut) throw new ApiError('La solicitud excedio el tiempo permitido.', { kind: 'timeout' });
  if (parentSignal?.aborted) throw new ApiError('La solicitud fue cancelada.', { kind: 'abort' });
}

export async function request(path, { method = 'GET', signal: parentSignal } = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException('Tiempo agotado', 'TimeoutError'));
  }, REQUEST_TIMEOUT_MS);
  const abortParent = () => controller.abort(parentSignal.reason);
  if (parentSignal) {
    if (parentSignal.aborted) abortParent();
    else parentSignal.addEventListener('abort', abortParent, { once: true });
  }

  try {
    const options = {
      method,
      headers: { Accept: 'application/json' },
      signal: controller.signal
    };
    if (method.toUpperCase() === 'GET') options.cache = 'no-store';

    let response;
    try { response = await fetch(`${API_BASE}${path}`, options); }
    catch (error) {
      if (timedOut || error?.name === 'TimeoutError') {
        throw new ApiError('La solicitud excedio el tiempo permitido.', { kind: 'timeout' });
      }
      if (parentSignal?.aborted || controller.signal.aborted) {
        throw new ApiError('La solicitud fue cancelada.', { kind: 'abort' });
      }
      throw new ApiError('No fue posible conectar con el servidor.', { kind: 'network' });
    }

    if (!response.ok) {
      const parsed = await parseJsonTolerant(response);
      throwIfRequestWasAborted(timedOut, parentSignal);
      throw new ApiError(errorText(parsed.value, response.status), {
        status: response.status,
        detail: parsed.value?.detail ?? null,
        kind: 'http'
      });
    }

    const parsed = await parseJsonTolerant(response);
    throwIfRequestWasAborted(timedOut, parentSignal);
    if (!parsed.parsed) {
      throw new ApiError('El servidor devolvio una respuesta JSON invalida.', {
        status: response.status,
        kind: 'json'
      });
    }
    return parsed.value;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', abortParent);
  }
}
