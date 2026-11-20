// Selector de unidad para CONTROL, MONITOREO y EVENTOS.
// Las opciones salen de la API según la sesión (comprador: sus unidades; admin: inventario), pero
// elegir una solo cambia ?vehiculo=N en la URL: es la API la que decide si se puede ver u operar.
import { ADMIN_ROUTES, VEHICLE_ID, VEHICULO_POR_OMISION } from './config.js';
import { request } from './api.js';
import { conParametros } from './layout.js';
import { obtenerSesion } from './sesion.js';

function opcion(valor, texto) {
  const o = document.createElement('option');
  o.value = String(valor);
  o.textContent = texto;
  return o;
}

async function cargarOpciones(sesion) {
  const exhibicion = { id: VEHICULO_POR_OMISION, texto: `Unidad de exhibición · ID ${VEHICULO_POR_OMISION}` };
  if (sesion?.usuario.rol === 'usuario') {
    const r = await request(ADMIN_ROUTES.misVehiculos, { auth: true });
    return [...(r.vehiculos || []).map((v) => ({ id: v.id_vehiculo, texto: `${v.nombre} · ${v.numero_serie || `ID ${v.id_vehiculo}`}` })), exhibicion];
  }
  if (sesion?.usuario.rol === 'admin') {
    const r = await request(ADMIN_ROUTES.inventario, { auth: true });
    return (r.unidades || []).filter((u) => u.activo).map((u) => ({
      id: u.id_vehiculo,
      texto: `${u.nombre} · ID ${u.id_vehiculo}${u.id_propietario ? ' · vendida (requiere soporte)' : ''}`
    }));
  }
  return [];
}

/**
 * Monta un <label> con <select> dentro de `contenedor` ([data-selector-unidad]).
 * Sin sesión (o sin unidades que elegir) el contenedor queda oculto y se usa la unidad de la URL.
 */
export async function montarSelectorUnidad(contenedor, { compacto = false } = {}) {
  if (!contenedor) return;
  contenedor.hidden = true;
  const sesion = obtenerSesion();
  if (!sesion || sesion.usuario.rol === 'invitado') return; // el invitado solo tiene su unidad reservada
  let opciones;
  try { opciones = await cargarOpciones(sesion); } catch { return; } // sin selector: la página sigue con su unidad
  if (!opciones.some((o) => o.id === VEHICLE_ID)) opciones.unshift({ id: VEHICLE_ID, texto: `Unidad ID ${VEHICLE_ID}` });
  if (opciones.length < 2) return;

  const select = document.createElement('select');
  select.id = `selector-unidad-${Math.random().toString(36).slice(2, 6)}`;
  select.append(...opciones.map((o) => opcion(o.id, o.texto)));
  select.value = String(VEHICLE_ID);
  select.addEventListener('change', () => {
    const pagina = location.pathname.split('/').pop() || 'index.html';
    location.assign(conParametros(pagina, { vehiculo: select.value }));
  });
  const label = document.createElement('label');
  label.htmlFor = select.id;
  const texto = document.createElement('span');
  texto.textContent = 'Unidad';
  if (compacto) texto.className = 'sr-only';
  label.append(texto, select);
  contenedor.replaceChildren(label);
  contenedor.hidden = false;
}
