// CATÁLOGO público (Etapa 7): modelos publicados con su unidad de exhibición y la prueba temporal de invitado.
import { APP_NAME, INVITADO_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { conParametros, montarCreditos, montarNavegacion } from '../core/layout.js';
import { montarIndicadores } from '../core/conectividad.js';
import { iniciarPruebaInvitado, obtenerSesion } from '../core/sesion.js';
import { abrirFormulario, avisar, el, etiqueta, textoError } from '../admin/ui.js';

const byId = (id) => document.getElementById(id);
montarNavegacion(document.querySelector('[data-nav]'), 'catalogo');
montarCreditos(byId('app-credits'));
document.title = `${APP_NAME} · Catálogo`;
montarIndicadores({ ws: null, api: byId('api-status'), db: byId('db-status') });

const MENSAJES_FIN = {
  expirada: 'Tu prueba terminó por tiempo. La unidad se detuvo y quedó libre.',
  finalizada: 'Terminaste tu prueba. La unidad se detuvo y quedó libre.',
  desconexion: 'Tu prueba terminó porque se perdió la conexión. La unidad se detuvo.'
};
const fin = new URLSearchParams(location.search).get('fin');
if (MENSAJES_FIN[fin]) avisar(MENSAJES_FIN[fin]);

async function cargar() {
  const estado = byId('catalogo-estado');
  const lista = byId('catalogo-lista');
  estado.hidden = false; estado.dataset.estado = 'cargando'; estado.textContent = 'Cargando catálogo…';
  try {
    const r = await request(INVITADO_ROUTES.catalogo, { auth: false });
    const minutos = r.minutos_prueba;
    const mia = obtenerSesion();
    lista.replaceChildren(...(r.unidades || []).map((u) => tarjeta(u, minutos, mia)));
    if (!r.unidades?.length) { estado.dataset.estado = 'vacio'; estado.textContent = 'No hay unidades de exhibición disponibles por ahora.'; }
    else estado.hidden = true;
  } catch (error) {
    lista.replaceChildren();
    estado.dataset.estado = 'error';
    estado.textContent = `No se pudo cargar el catálogo: ${textoError(error)}`;
  }
}

function tarjeta(u, minutos, mia) {
  const esMia = mia?.usuario.rol === 'invitado' && mia.idVehiculo === u.id_vehiculo;
  let accion;
  if (esMia) {
    accion = el('a', { class: 'tecla tecla-acento', href: conParametros('index.html', { vehiculo: u.id_vehiculo }) }, 'Continuar mi prueba');
  } else if (!u.disponible) {
    accion = el('button', { type: 'button', class: 'tecla', disabled: true }, 'En uso por otro invitado');
  } else {
    accion = el('button', { type: 'button', class: 'tecla tecla-acento', onclick: () => reservar(u, minutos) }, `Probar ${minutos} minutos`);
  }
  return el('article', { class: 'catalogo-tarjeta' },
    el('div', { class: 'demo-tarjeta-titulo' }, el('h3', {}, u.modelo),
      u.disponible || esMia ? etiqueta(esMia ? 'Tu prueba' : 'Disponible', 'ok') : etiqueta('Ocupada', 'aviso')),
    el('p', { class: 'admin-sub' }, u.descripcion || 'Vehículo IoT controlado por WebSocket seguro.'),
    el('dl', { class: 'catalogo-datos' },
      el('dt', {}, 'Unidad'), el('dd', {}, `${u.nombre} · ${u.numero_serie || `ID ${u.id_vehiculo}`}`),
      el('dt', {}, 'Controlador'), el('dd', {}, u.microcontrolador || '—'),
      el('dt', {}, 'Vehículo'), el('dd', {}, u.dispositivo_conectado ? etiqueta('En línea', 'ok') : etiqueta('Sin conexión', 'neutro'))),
    accion);
}

function reservar(u, minutos) {
  abrirFormulario({
    titulo: `Probar ${u.modelo}`,
    descripcion: `Tendrás ${minutos} minutos de uso exclusivo de la unidad ${u.nombre}. Al terminar se detiene sola.`,
    campos: [{
      nombre: 'acepto', tipo: 'checkbox', valor: false,
      etiqueta: 'Hay una persona supervisando, la zona está despejada y sé que DETENER apaga todo.'
    }],
    textoEnviar: 'Empezar prueba',
    enviar: async ({ acepto }) => {
      if (!acepto) throw new Error('Confirma las condiciones de seguridad para empezar.');
      try {
        await iniciarPruebaInvitado(u.id_vehiculo);
      } catch (error) {
        if (error?.status === 409) { void cargar(); throw new Error('Otra persona acaba de reservarla. Intenta en unos minutos.'); }
        if (error?.status === 429) throw new Error('Alcanzaste el límite de pruebas. Intenta más tarde.');
        throw error;
      }
      location.assign(conParametros('index.html', { vehiculo: u.id_vehiculo }));
    }
  });
}

byId('catalogo-actualizar').addEventListener('click', cargar);
void cargar();
// Mantiene la disponibilidad al día sin recargar.
setInterval(() => { if (!document.hidden) void cargar(); }, 20000);

