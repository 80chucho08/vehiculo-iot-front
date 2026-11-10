import { ROUTES, HEALTH_INTERVAL_MS } from './config.js';
import { request } from './api.js';

export function startHealthChecks(render) {
  let running = false;
  let timer = null;
  async function check() {
    if (running || document.hidden) return;
    running = true;
    try {
      const results = await Promise.allSettled([request(ROUTES.apiHealth), request(ROUTES.dbHealth)]);
      render('api', results[0].status === 'fulfilled' ? { ok: true, data: results[0].value } : { ok: false, error: results[0].reason });
      render('db', results[1].status === 'fulfilled' ? { ok: true, data: results[1].value } : { ok: false, error: results[1].reason });
    } finally { running = false; }
  }
  function schedule() { clearInterval(timer); if (!document.hidden) { check(); timer = setInterval(check, HEALTH_INTERVAL_MS); } }
  document.addEventListener('visibilitychange', schedule);
  schedule();
  return () => { clearInterval(timer); document.removeEventListener('visibilitychange', schedule); };
}
