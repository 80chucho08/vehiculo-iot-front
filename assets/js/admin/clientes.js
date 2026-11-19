// Clientes: cuentas de compradores y administradores. Búsqueda, filtros y paginación del lado del servidor.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { obtenerSesion } from '../core/sesion.js';
import { abrirFormulario, avisar, crearPaginacion, crearTabla, el, etiqueta, fechaHora, textoError } from './ui.js';

const POR_PAGINA = 20;
const ROLES = [['usuario', 'Comprador'], ['admin', 'Administrador']];

export function crearClientes(contenedor) {
  let cargado = false;
  let pagina = 1;
  const buscar = el('input', { type: 'search', id: 'clientes-buscar', maxlength: 80, placeholder: 'Nombre o correo', autocomplete: 'off' });
  const rol = el('select', { id: 'clientes-rol' }, el('option', { value: '' }, 'Todos los roles'), ROLES.map(([v, t]) => el('option', { value: v }, t)));
  const estado = el('select', { id: 'clientes-estado' }, el('option', { value: '' }, 'Activos e inactivos'), el('option', { value: 'true' }, 'Activos'), el('option', { value: 'false' }, 'Inactivos'));
  const filtros = el('form', { class: 'filtros', role: 'search', 'aria-label': 'Filtrar clientes' },
    el('label', { for: 'clientes-buscar' }, 'Buscar', buscar),
    el('label', { for: 'clientes-rol' }, 'Rol', rol),
    el('label', { for: 'clientes-estado' }, 'Estado', estado),
    el('button', { type: 'submit', class: 'tecla tecla-chica' }, 'Filtrar'));
  filtros.addEventListener('submit', (e) => { e.preventDefault(); cargar(true, 1); });

  const tabla = crearTabla({
    titulo: 'Clientes y administradores',
    columnas: [
      { titulo: 'Cuenta', celda: (u) => el('span', { class: 'celda-doble' }, el('strong', {}, u.nombre), el('small', {}, `${u.email} · ID ${u.id_usuario}`)) },
      { titulo: 'Rol', celda: (u) => etiqueta(u.rol === 'admin' ? 'Administrador' : 'Comprador', u.rol === 'admin' ? 'acento' : 'neutro') },
      { titulo: 'Estado', celda: (u) => (u.activo ? etiqueta('Activo', 'ok') : etiqueta('Inactivo', 'error')) },
      { titulo: 'Último acceso', celda: (u) => (u.ultimo_acceso ? fechaHora(u.ultimo_acceso) : el('span', { class: 'texto-tenue' }, 'Nunca')) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (u) => el('span', { class: 'acciones' },
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => editar(u), 'aria-label': `Editar ${u.email}` }, 'Editar'),
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => restablecer(u), 'aria-label': `Restablecer contraseña de ${u.email}` }, 'Contraseña')) }
    ]
  });
  const paginacion = crearPaginacion((p) => cargar(true, p));
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Clientes'),
      el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', onclick: alta }, 'Nueva cuenta')),
    filtros, tabla.nodo, paginacion.nodo);

  async function cargar(forzar = false, nuevaPagina = pagina) {
    if (cargado && !forzar) return;
    pagina = nuevaPagina;
    tabla.cargando();
    const query = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA) });
    if (buscar.value.trim()) query.set('buscar', buscar.value.trim());
    if (rol.value) query.set('rol', rol.value);
    if (estado.value) query.set('activo', estado.value);
    try {
      const r = await request(`${ADMIN_ROUTES.usuarios}?${query}`, { auth: true });
      tabla.filas(r.items || [], 'No hay cuentas con esos filtros.');
      paginacion.actualizar(r.total, r.pagina, r.por_pagina);
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudieron cargar las cuentas: ${textoError(error)}`, () => cargar(true));
    }
  }

  function alta() {
    abrirFormulario({
      titulo: 'Nueva cuenta',
      descripcion: 'Comunica la contraseña inicial por un medio privado; la persona puede cambiarla al entrar.',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80 },
        { nombre: 'email', etiqueta: 'Correo', tipo: 'email', requerido: true, maxlength: 120 },
        { nombre: 'password', etiqueta: 'Contraseña inicial', tipo: 'password', requerido: true, minlength: 10, maxlength: 128, autocomplete: 'new-password', ayuda: 'Mínimo 10 caracteres.' },
        { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES, valor: 'usuario' }
      ],
      textoEnviar: 'Crear',
      enviar: async (d) => {
        await request(ADMIN_ROUTES.usuarios, { method: 'POST', auth: true, body: d });
        avisar(`Cuenta ${d.email} creada.`);
        await cargar(true, 1);
      }
    });
  }

  function editar(u) {
    const propia = obtenerSesion()?.usuario.id === u.id_usuario;
    abrirFormulario({
      titulo: `Editar ${u.email}`,
      descripcion: `${propia ? 'Es tu propia cuenta. ' : ''}Cambiar el rol o desactivar la cuenta cierra sus sesiones abiertas.`,
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80, valor: u.nombre },
        { nombre: 'rol', etiqueta: 'Rol', tipo: 'select', opciones: ROLES, valor: u.rol },
        { nombre: 'activo', etiqueta: 'Cuenta activa', tipo: 'checkbox', valor: Boolean(u.activo) }
      ],
      enviar: async (d) => {
        await request(ADMIN_ROUTES.usuario(u.id_usuario), { method: 'PUT', auth: true, body: d });
        avisar('Cuenta actualizada.');
        await cargar(true);
      }
    });
  }

  function restablecer(u) {
    abrirFormulario({
      titulo: `Contraseña de ${u.email}`,
      descripcion: 'Fija una contraseña temporal. Se cierran todas las sesiones de esa cuenta.',
      campos: [{ nombre: 'password', etiqueta: 'Contraseña temporal', tipo: 'password', requerido: true, minlength: 10, maxlength: 128, autocomplete: 'new-password' }],
      textoEnviar: 'Restablecer', peligro: true,
      enviar: async (d) => {
        await request(ADMIN_ROUTES.passwordUsuario(u.id_usuario), { method: 'PUT', auth: true, body: d });
        avisar(`Contraseña de ${u.email} restablecida.`);
      }
    });
  }
  return { cargar, recargar: () => cargar(true) };
}
