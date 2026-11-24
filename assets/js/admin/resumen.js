// Resumen: métricas reales de GET /api/admin/dashboard (consultas a RDS y estado del proceso WSS).
// No hay valores de ejemplo: si la API no responde, se muestra el error, nunca números inventados.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { el, fechaHora, textoError } from './ui.js';

const TIPOS = { venta: 'Venta', exhibicion: 'Exhibición', simulada: 'Simuladas' };

export function crearResumen(contenedor) {
  const estado = el('p', { class: 'admin-estado', role: 'status', 'aria-live': 'polite' });
  const rejilla = el('div', { class: 'metricas' });
  const pie = el('p', { class: 'admin-nota' });
  const actualizar = el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => cargar() }, 'Actualizar');
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Resumen de la empresa'), actualizar),
    estado, rejilla, pie);

  const metrica = (titulo, valor, detalle, tipo) =>
    el('article', { class: 'metrica', 'data-tipo': tipo }, el('h3', {}, titulo), el('p', { class: 'metrica-valor' }, String(valor)),
      detalle ? el('p', { class: 'metrica-detalle' }, detalle) : null);

  // Se vuelve a consultar cada vez que se abre la pestaña: las métricas (reportes, soportes, ventas)
  // cambian por acciones en otras pestañas y nunca deben quedarse con los números de la primera carga.
  async function cargar() {
    estado.dataset.estado = 'cargando'; estado.textContent = 'Consultando métricas…'; estado.hidden = false;
    actualizar.disabled = true;
    try {
      const d = await request(ADMIN_ROUTES.dashboard, { auth: true });
      const unidades = Array.isArray(d.unidades_por_tipo) ? d.unidades_por_tipo : [];
      const activas = unidades.filter((u) => u.activo);
      const totalActivas = activas.reduce((s, u) => s + Number(u.n), 0);
      const porTipo = Object.entries(TIPOS).map(([k, t]) => `${t}: ${activas.filter((u) => u.tipo_unidad === k).reduce((s, u) => s + Number(u.n), 0)}`).join(' · ');
      const bajas = unidades.filter((u) => !u.activo).reduce((s, u) => s + Number(u.n), 0);
      const usuarios = Array.isArray(d.usuarios_por_rol) ? d.usuarios_por_rol : [];
      const compradores = usuarios.filter((u) => u.rol === 'usuario' && u.activo).reduce((s, u) => s + Number(u.n), 0);
      const admins = usuarios.filter((u) => u.rol === 'admin' && u.activo).reduce((s, u) => s + Number(u.n), 0);
      const invitados = usuarios.filter((u) => u.rol === 'invitado' && u.activo).reduce((s, u) => s + Number(u.n), 0);
      rejilla.replaceChildren(
        metrica('Unidades activas', totalActivas, `${porTipo}${bajas ? ` · ${bajas} de baja` : ''}`),
        metrica('Vendidas', d.unidades_vendidas, 'Con asignación vigente'),
        metrica('Compradores', compradores, `${admins} administrador${admins === 1 ? '' : 'es'} · ${invitados} cuenta${invitados === 1 ? '' : 's'} de invitado`),
        metrica('Modelos activos', d.modelos_activos),
        metrica('Demos activas', d.demos_activas),
        metrica('Dispositivos en línea', d.dispositivos_conectados, 'ESP8266 con WSS abierto ahora', d.dispositivos_conectados ? 'ok' : undefined),
        metrica('Movimientos 24 h', d.movimientos_24h, 'Persistidos en RDS'),
        metrica('Reservas de invitado', d.reservas_invitado_activas, 'Vigentes'),
        metrica('Soportes autorizados', d.soportes_vigentes, 'Consentimientos vigentes'),
        metrica('Reportes de falla', d.reportes_abiertos ?? 0, 'Abiertos o en revisión', d.reportes_abiertos ? 'aviso' : undefined),
        metrica('Accesos denegados 24 h', d.accesos_denegados_24h, 'Ver Bitácora', d.accesos_denegados_24h ? 'aviso' : undefined)
      );
      pie.replaceChildren('Datos reales de la API · generados ', fechaHora(d.generado_en), ' (hora del centro de México).');
      estado.hidden = true;
    } catch (error) {
      estado.dataset.estado = 'error';
      estado.textContent = `No se pudieron cargar las métricas: ${textoError(error)}`;
    } finally {
      actualizar.disabled = false;
    }
  }
  return { cargar };
}
