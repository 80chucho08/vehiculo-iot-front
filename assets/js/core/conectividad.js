// Los tres indicadores independientes (WSS, API AWS, Amazon RDS) para páginas nuevas.
// Mismo criterio que CONTROL: la API se mide con GET / y RDS SOLO con GET /health/db (core/health.js).
// Nunca se deduce RDS a partir del WSS ni el funcionamiento de las 21 APIs a partir del health.
import { startHealthChecks } from './health.js';

const TEXTO_WS = Object.freeze({ 'En linea': 'En línea', Conectando: 'Conectando', Reconectando: 'Reconectando', Desconectado: 'Desconectado' });

function pintar(tarjeta, texto, estado) {
  if (!tarjeta) return;
  tarjeta.dataset.estado = estado;
  const p = tarjeta.querySelector('p');
  if (p) p.textContent = texto;
}

/**
 * @param {{ ws: HTMLElement, api: HTMLElement, db: HTMLElement }} tarjetas
 * @returns {{ setWs: (status: string, estado: string) => void, detener: () => void }}
 */
export function montarIndicadores(tarjetas) {
  const detener = startHealthChecks((tipo, resultado) => {
    if (tipo === 'api') {
      if (resultado.checking) { pintar(tarjetas.api, 'Comprobando', 'cargando'); return; }
      pintar(tarjetas.api, resultado.ok ? 'Disponible' : 'No disponible', resultado.ok ? 'ok' : 'error');
      return;
    }
    if (resultado.unknown) pintar(tarjetas.db, 'Sin verificar', 'cargando');
    else if (resultado.unavailable) pintar(tarjetas.db, 'No disponible', 'error');
    else if (resultado.ok) pintar(tarjetas.db, 'Disponible', 'ok');
  });
  // Mientras no haya un diagnóstico de RDS, se muestra "Sin verificar".
  pintar(tarjetas.db, 'Sin verificar', 'cargando');
  return {
    setWs: (status, estado) => pintar(tarjetas.ws, TEXTO_WS[status] || status, estado),
    detener
  };
}
