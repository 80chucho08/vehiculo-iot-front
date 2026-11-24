// Modo invitado en CONTROL (Etapa 7): cuenta regresiva de la reserva, botón para terminarla y salida al
// catálogo cuando vence o la API la cierra. La exclusividad, el tiempo y los comandos permitidos los
// impone la API; esto solo lo hace visible.
import { VEHICLE_ID } from '../core/config.js';
import { registerMessageHandler } from '../core/events.js';
import { conParametros } from '../core/layout.js';
import { alCambiarSesion, descartarSesion, obtenerSesion, terminarPruebaInvitado } from '../core/sesion.js';

// Prueba anónima del catálogo ('invitado') o cuenta de invitado ('visitante'): mismos comandos permitidos.
export const esInvitado = () => ['invitado', 'visitante'].includes(obtenerSesion()?.usuario.rol);

function salir(motivo) {
  location.assign(conParametros('catalogo.html', { fin: motivo }));
}

export function montarModoInvitado() {
  const sesion = obtenerSesion();
  if (sesion?.usuario.rol !== 'invitado') return false;
  if (sesion.idVehiculo !== VEHICLE_ID) {
    // La prueba es de otra unidad: se lleva al invitado a la suya.
    location.replace(conParametros('index.html', { vehiculo: sesion.idVehiculo }));
    return true;
  }
  const banner = document.getElementById('invitado-banner');
  const tiempo = document.getElementById('invitado-tiempo');
  const terminar = document.getElementById('invitado-terminar');
  banner.hidden = false;
  let terminado = false;

  function tic() {
    const restante = Math.max(0, sesion.expira - Date.now());
    const s = Math.ceil(restante / 1000);
    tiempo.textContent = `Prueba de invitado · ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    banner.dataset.estado = s <= 30 ? 'aviso' : 'ok';
    if (restante <= 0 && !terminado) {
      terminado = true;
      descartarSesion('expirada');
      salir('expirada');
    }
  }
  tic();
  const reloj = setInterval(tic, 1000);

  terminar.addEventListener('click', async () => {
    if (terminado) return;
    terminado = true;
    clearInterval(reloj);
    terminar.disabled = true;
    terminar.textContent = 'Terminando…';
    await terminarPruebaInvitado(); // la API libera la unidad y la DETIENE
    salir('finalizada');
  });

  // La API avisa por WSS cuando cierra la reserva (venció, se desconectó o la terminó otra pestaña).
  registerMessageHandler('reserva_finalizada', (mensaje) => {
    if (terminado || Number(mensaje?.id_vehiculo) !== VEHICLE_ID) return;
    terminado = true;
    descartarSesion('expirada');
    salir(mensaje?.motivo || 'expirada');
  });
  alCambiarSesion((s) => { if (!s && !terminado) { terminado = true; salir('expirada'); } });
  return true;
}
