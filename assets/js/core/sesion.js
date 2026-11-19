// Sesión de usuario con token de acceso corto (decisión D1).
// - El token vive en sessionStorage: sobrevive a la navegación entre páginas y se borra al cerrar la pestaña.
//   Nunca va en localStorage, cookies ni la URL. El rol mostrado es informativo: la API decide los permisos.
// - Se renueva solo, RENOVAR_ANTES_MS antes de vencer, hasta el tope absoluto que fija la API (8 h).
// - Si la API responde 401, la sesión local se descarta y se avisa a los suscriptores.
import { AUTH_ROUTES, RENOVAR_ANTES_MS, SESION_CLAVE } from './config.js';
import { request } from './api.js';
import { parseFechaBackend } from './fecha.js';

const oyentes = new Set();
let temporizador = null;
let renovando = null;

function leer() {
  try { return JSON.parse(sessionStorage.getItem(SESION_CLAVE) || 'null'); } catch { return null; }
}
function escribir(valor) {
  try {
    if (valor) sessionStorage.setItem(SESION_CLAVE, JSON.stringify(valor));
    else sessionStorage.removeItem(SESION_CLAVE);
  } catch { /* almacenamiento bloqueado: la sesión vive solo en memoria de esta página */ }
  memoria = valor;
}
let memoria = leer();

function avisar() { const s = obtenerSesion(); for (const fn of oyentes) { try { fn(s); } catch (e) { console.warn(e); } } }

/** Sesión vigente o null. Nunca devuelve un token vencido. */
export function obtenerSesion() {
  const s = memoria;
  if (!s || typeof s.token !== 'string' || !Number.isFinite(s.expira) || s.expira <= Date.now() + 5000) return null;
  return s;
}

export function tokenActual() { return obtenerSesion()?.token ?? null; }

export function alCambiarSesion(fn) { oyentes.add(fn); return () => oyentes.delete(fn); }

function desdeRespuesta(r) {
  const expira = parseFechaBackend(r?.expira_en)?.getTime();
  const absoluto = parseFechaBackend(r?.expira_absoluto)?.getTime();
  const u = r?.usuario;
  if (typeof r?.access_token !== 'string' || !expira || !absoluto || !u || !['admin', 'usuario'].includes(u.rol)) {
    throw new Error('La API devolvió una sesión con formato inesperado.');
  }
  return {
    token: r.access_token, expira, absoluto,
    usuario: { id: u.id_usuario, email: String(u.email), nombre: String(u.nombre), rol: u.rol }
  };
}

function programarRenovacion() {
  clearTimeout(temporizador); temporizador = null;
  const s = obtenerSesion();
  if (!s) return;
  const espera = Math.max(1000, s.expira - Date.now() - RENOVAR_ANTES_MS);
  if (s.expira >= s.absoluto - 1000) return; // ya no se puede extender: vencerá al llegar al tope
  temporizador = setTimeout(() => { void renovar(); }, espera);
}

export async function iniciarSesion(email, password) {
  const r = await request(AUTH_ROUTES.login, { method: 'POST', body: { email, password }, auth: false });
  escribir(desdeRespuesta(r));
  programarRenovacion();
  avisar();
  return obtenerSesion();
}

export async function renovar() {
  if (renovando) return renovando;
  renovando = (async () => {
    try {
      const r = await request(AUTH_ROUTES.renovar, { method: 'POST', auth: true });
      escribir(desdeRespuesta(r));
      programarRenovacion();
      avisar();
      return true;
    } catch (error) {
      if (error?.status === 401) descartarSesion('vencida');
      else programarRenovacion(); // fallo de red: se reintenta más tarde si aún hay margen
      return false;
    } finally { renovando = null; }
  })();
  return renovando;
}

/** Cierra en el servidor (revoca) y localmente. Si la red falla, se descarta igual en el navegador. */
export async function cerrarSesion() {
  const token = tokenActual();
  descartarSesion('logout');
  if (!token) return;
  try { await request(AUTH_ROUTES.logout, { method: 'POST', token }); } catch { /* el token vence solo en ≤ 30 min */ }
}

export function descartarSesion(motivo = 'invalida') {
  clearTimeout(temporizador); temporizador = null;
  const habia = Boolean(memoria);
  escribir(null);
  if (habia) { ultimoMotivo = motivo; avisar(); }
}
let ultimoMotivo = null;
export function motivoUltimoCierre() { return ultimoMotivo; }

// Al cargar una página con sesión guardada, se reprograma la renovación.
if (obtenerSesion()) programarRenovacion(); else if (memoria) escribir(null);
