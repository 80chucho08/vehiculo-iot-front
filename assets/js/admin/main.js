// ADMINISTRACIÓN: inicio de sesión y vistas por rol. La interfaz oculta lo que el rol no puede usar,
// pero quien decide es la API (cada petición lleva el token y el servidor valida rol y propiedad).
import { APP_NAME, AUTH_ROUTES, VEHICULO_POR_OMISION } from '../core/config.js';
import { request } from '../core/api.js';
import { conParametros, montarNavegacion, montarCreditos } from '../core/layout.js';
import { montarIndicadores } from '../core/conectividad.js';
import { alCambiarSesion, cerrarSesion, iniciarSesion, motivoUltimoCierre, obtenerSesion } from '../core/sesion.js';
import { abrirFormulario, avisar, el, montarPestanas, textoError } from './ui.js';
import { crearResumen } from './resumen.js';
import { crearInventario } from './inventario.js';
import { crearModelos } from './modelos.js';
import { crearClientes } from './clientes.js';
import { crearAsignaciones } from './asignaciones.js';
import { crearBitacora } from './bitacora.js';
import { crearMisVehiculos } from './comprador.js';
import { crearReportes } from './reportes.js';

const byId = (id) => document.getElementById(id);
montarNavegacion(document.querySelector('[data-nav]'), 'administracion');
montarCreditos(byId('app-credits'));
document.title = `${APP_NAME} · Administración`;
document.querySelector('.brand-logo').setAttribute('aria-label', APP_NAME);
montarIndicadores({ ws: null, api: byId('api-status'), db: byId('db-status') });

const FABRICAS = {
  resumen: crearResumen, inventario: crearInventario, modelos: crearModelos,
  clientes: crearClientes, asignaciones: crearAsignaciones, reportes: crearReportes, bitacora: crearBitacora
};
const NOMBRE_ROL = { admin: 'Administrador', usuario: 'Comprador', visitante: 'Invitado' };
const secciones = {};
let misVehiculos;
// Crea (o vuelve a crear, vacías) todas las secciones: al cerrar sesión no queda ningún dato
// de la cuenta anterior en la página, por si otra persona entra en la misma pestaña.
function reiniciarSecciones() {
  for (const [nombre, crear] of Object.entries(FABRICAS)) {
    const panel = byId(`panel-${nombre}`);
    panel.replaceChildren();
    secciones[nombre] = crear(panel);
  }
  byId('panel-mis-vehiculos').replaceChildren();
  misVehiculos = crearMisVehiculos(byId('panel-mis-vehiculos'));
}
reiniciarSecciones();
const pestanas = montarPestanas(byId('pestanas'), (seccion) => secciones[seccion]?.cargar());

const fechaCorta = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
let rolPintado = null;

function pintar(sesionGuardada) {
  // Una prueba de invitado no es una cuenta: aquí se ve el formulario de inicio de sesión.
  const sesion = sesionGuardada?.usuario.rol === 'invitado' ? null : sesionGuardada;
  const rol = sesion?.usuario.rol ?? null;
  byId('vista-login').hidden = Boolean(sesion);
  byId('vista-sesion').hidden = !sesion;
  byId('vista-admin').hidden = rol !== 'admin';
  byId('vista-comprador').hidden = rol !== 'usuario';
  byId('vista-visitante').hidden = rol !== 'visitante';
  if (!sesion) {
    if (rolPintado !== null) reiniciarSecciones();
    rolPintado = null;
    const motivo = motivoUltimoCierre();
    if (motivo && motivo !== 'logout') avisar('Tu sesión terminó (venció o fue revocada). Inicia sesión de nuevo.', 'error');
    return;
  }
  byId('sesion-nombre').textContent = `${sesion.usuario.nombre} · ${NOMBRE_ROL[rol] || rol}`;
  byId('sesion-detalle').textContent = `${sesion.usuario.email} · sesión renovable hasta las ${fechaCorta.format(new Date(sesion.absoluto))}`;
  byId('admin-subtitulo').textContent = rol === 'admin' ? 'Empresa · inventario, clientes y ventas'
    : (rol === 'visitante' ? 'Cuenta de invitado · carrito en exhibición' : 'Tu cuenta de comprador');
  if (rol !== rolPintado) {
    rolPintado = rol;
    if (rol === 'admin') pestanas.activar(location.hash.slice(1) || pestanas.inicial.dataset.seccion);
    else if (rol === 'visitante') {
      byId('visitante-acciones').replaceChildren(
        el('a', { class: 'tecla tecla-acento', href: conParametros('index.html', { vehiculo: VEHICULO_POR_OMISION }) }, 'Controlar el carrito en exhibición'),
        el('a', { class: 'tecla', href: conParametros('monitoreo.html', { vehiculo: VEHICULO_POR_OMISION }) }, 'Monitorear'),
        el('a', { class: 'tecla', href: 'catalogo.html' }, 'Ver catálogo'));
    } else misVehiculos.cargar();
  }
}

byId('login-form').addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const formulario = evento.currentTarget;
  const error = byId('login-error');
  const boton = byId('login-enviar');
  error.hidden = true;
  if (!formulario.checkValidity()) {
    error.textContent = 'Escribe un correo válido y tu contraseña.';
    error.hidden = false;
    return;
  }
  boton.disabled = true;
  boton.textContent = 'Entrando…';
  try {
    const email = byId('login-email').value.trim();
    await iniciarSesion(email, byId('login-password').value);
    formulario.reset(); // limpia la contraseña sin marcar el campo como inválido
    byId('login-email').value = email;
  } catch (e) {
    error.textContent = e?.status === 401 ? 'Correo o contraseña incorrectos.'
      : e?.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : textoError(e);
    error.hidden = false;
    byId('login-password').select();
  } finally {
    boton.disabled = false;
    boton.textContent = 'Entrar';
  }
});

byId('cerrar-sesion').addEventListener('click', async () => {
  await cerrarSesion();
  avisar('Sesión cerrada y revocada en el servidor.');
  byId('login-email').focus();
});

byId('cambiar-password').addEventListener('click', () => abrirFormulario({
  titulo: 'Cambiar contraseña',
  descripcion: 'Al cambiarla se cierran todas tus sesiones, también esta.',
  campos: [
    { nombre: 'actual', etiqueta: 'Contraseña actual', tipo: 'password', requerido: true, autocomplete: 'current-password' },
    { nombre: 'nueva', etiqueta: 'Contraseña nueva', tipo: 'password', requerido: true, minlength: 10, maxlength: 128,
      autocomplete: 'new-password', ayuda: 'Mínimo 10 caracteres. Mejor una frase larga.' }
  ],
  textoEnviar: 'Cambiar',
  enviar: async ({ actual, nueva }) => {
    await request(AUTH_ROUTES.cambiarPassword, { method: 'POST', auth: true, body: { actual, nueva } });
    await cerrarSesion();
    avisar('Contraseña cambiada. Inicia sesión con la nueva.');
  }
}));

alCambiarSesion(pintar);
pintar(obtenerSesion());
