// Utilidades de fecha y hora. El backend entrega fechas ISO SIN zona ("2026-11-13T05:51:24") que están en UTC.
import { ZONA_HORARIA_BACKEND, ZONA_HORARIA_VISTA } from './config.js';

const ISO_SIN_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/;
const ISO_CON_ZONA = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Convierte una fecha del backend a Date. Devuelve null si el formato no es el documentado. */
export function parseFechaBackend(valor) {
  if (typeof valor !== 'string') return null;
  let texto = valor.trim();
  if (ISO_SIN_ZONA.test(texto)) {
    if (ZONA_HORARIA_BACKEND !== 'UTC') return null; // solo se interpreta la zona verificada
    texto += 'Z';
  } else if (!ISO_CON_ZONA.test(texto)) {
    return null;
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

const formatoFecha = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA_VISTA, day: '2-digit', month: '2-digit', year: 'numeric' });
const formatoHora = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA_VISTA, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const formatoZona = new Intl.DateTimeFormat('es-MX', { timeZone: ZONA_HORARIA_VISTA, timeZoneName: 'shortOffset' });

export const formatearFecha = (fecha) => (fecha ? formatoFecha.format(fecha) : '—');
export const formatearHora = (fecha) => (fecha ? formatoHora.format(fecha) : '—');

/** Texto de la zona mostrada, p. ej. "Hora del centro de México (GMT-6)". */
export function etiquetaZona(fecha = new Date()) {
  const desfase = formatoZona.formatToParts(fecha).find((parte) => parte.type === 'timeZoneName')?.value || '';
  return `Hora del centro de México${desfase ? ` (${desfase})` : ''}`;
}

/** Para <time datetime>: ISO completo en UTC. */
export const isoUtc = (fecha) => (fecha ? fecha.toISOString() : '');
