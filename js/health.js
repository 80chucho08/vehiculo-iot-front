import { ROUTES, HEALTH_INTERVAL_MS } from './config.js';
import { request } from './api.js';

const MAX_INTERVAL_MS = 60000;
const GATEWAY_FAILURES = new Set([502, 503, 504]);

function isAbort(error) { return error?.kind === 'abort'; }

export function startHealthChecks(render) {
  let running = false;
  let stopped = false;
  let runAgain = false;
  let timer = null;
  let consecutiveFailures = 0;

  function scheduleNext() {
    if (stopped || document.hidden) return;
    const delay = Math.min(MAX_INTERVAL_MS, HEALTH_INTERVAL_MS * (2 ** consecutiveFailures));
    clearTimeout(timer);
    timer = setTimeout(() => { timer = null; check(); }, delay);
  }

  async function check() {
    if (stopped || document.hidden) return;
    if (running) { runAgain = true; return; }
    running = true;
    let failed = false;
    let ignored = false;
    try {
      const [apiResult, dbResult] = await Promise.allSettled([
        request(ROUTES.apiHealth),
        request(ROUTES.dbHealth)
      ]);
      if (stopped || document.hidden) return;

      const apiAborted = apiResult.status === 'rejected' && isAbort(apiResult.reason);
      const apiHealthy = apiResult.status === 'fulfilled'
        && typeof apiResult.value?.mensaje === 'string'
        && apiResult.value.mensaje.length > 0;

      if (apiAborted) {
        ignored = true;
      } else {
        render('api', apiHealthy
          ? { ok: true }
          : { ok: false, error: apiResult.status === 'rejected' ? apiResult.reason : null });

        if (!apiHealthy) {
          // No se atribuye un estado de RDS si la comprobacion de API fallo.
          render('db', { unknown: true });
          failed = true;
        } else {
          const dbAborted = dbResult.status === 'rejected' && isAbort(dbResult.reason);
          if (dbAborted) ignored = true;
          else {
            const dbHealthy = dbResult.status === 'fulfilled' && dbResult.value?.conexion === 'exitosa';
            if (dbHealthy) render('db', { ok: true });
            else if (dbResult.status === 'rejected'
              && dbResult.reason?.kind === 'http'
              && !GATEWAY_FAILURES.has(dbResult.reason.status)) {
              render('db', { ok: false, unavailable: true, error: dbResult.reason });
            } else {
              render('db', { unknown: true });
            }
            failed = !dbHealthy;
          }
        }
      }

      if (!ignored) consecutiveFailures = failed ? consecutiveFailures + 1 : 0;
    } finally {
      running = false;
      if (stopped || document.hidden) return;
      if (runAgain) { runAgain = false; clearTimeout(timer); timer = null; check(); }
      else scheduleNext();
    }
  }

  function triggerCheck() {
    if (stopped || document.hidden) return;
    clearTimeout(timer); timer = null;
    if (running) { runAgain = true; return; }
    check();
  }

  function onVisibilityChange() {
    if (document.hidden) { clearTimeout(timer); timer = null; }
    else triggerCheck();
  }

  render('api', { checking: true });
  window.addEventListener('online', triggerCheck);
  document.addEventListener('visibilitychange', onVisibilityChange);
  triggerCheck();

  return () => {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener('online', triggerCheck);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
}
