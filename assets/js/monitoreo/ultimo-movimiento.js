// Tarjeta "Último movimiento". Diferencia lo PUBLICADO por WSS, lo ENTREGADO por el backend, lo PERSISTIDO
// en RDS (confirmado por REST) y la EJECUCIÓN FÍSICA, que nunca se afirma (no hay telemetría del dispositivo).
// Orden: cada evento WSS incrementa una marca local; un snapshot REST lanzado antes de un evento más nuevo
// no puede reemplazarlo (solo lo confirma si coincide). Entre snapshots se compara la fecha del backend.
import { esDetenerWss } from '../core/validaciones.js';
import { formatearFecha, formatearHora, isoUtc, etiquetaZona } from '../core/fecha.js';

const ICONOS = Object.freeze({ hecho: '✓', pendiente: '…', 'no-aplica': '–', 'sin-verificar': '?', 'sin-confirmar': '!' });

export function crearUltimoMovimiento(ui) {
  let marca = 0;
  let actual = null; // { fuente, idSolicitud, comando, codigo, fecha, fechaBackend, demo }

  function fase(nombre, estado, texto) {
    const li = ui.fases.querySelector(`[data-fase="${nombre}"]`);
    if (!li) return;
    li.dataset.estado = estado;
    li.querySelector('.fase-icono').textContent = ICONOS[estado] || '';
    li.querySelector('.fase-texto').textContent = texto;
  }

  function pintarFecha() {
    if (!actual?.fecha) { ui.fecha.textContent = '—'; ui.hora.textContent = '—'; ui.fechaFuente.textContent = ''; return; }
    ui.fecha.dateTime = ui.hora.dateTime = isoUtc(actual.fecha);
    ui.fecha.textContent = formatearFecha(actual.fecha);
    ui.hora.textContent = formatearHora(actual.fecha);
    ui.fechaFuente.textContent = actual.fechaBackend
      ? `Fecha registrada por el backend · ${etiquetaZona(actual.fecha)}`
      : `Hora de recepción por WSS en este navegador · ${etiquetaZona(actual.fecha)}`;
  }

  function pintarMovimiento(nombre, codigo, extra = '') {
    ui.card.dataset.estado = 'ok';
    ui.nombre.textContent = nombre;
    const partes = [];
    if (codigo !== null && codigo !== undefined) partes.push(`Código ${codigo}`);
    if (extra) partes.push(extra);
    ui.codigo.textContent = partes.join(' · ');
    ui.codigo.hidden = partes.length === 0;
    pintarFecha();
  }

  const coincide = (a, b) => {
    if (!a || !b) return false;
    if (a.detener || b.detener) return Boolean(a.detener && b.detener);
    if (a.codigo !== null && b.codigo !== null) return a.codigo === b.codigo;
    return a.comando === b.comando;
  };

  return {
    marca: () => marca,

    /** Snapshot del último estado (GET /estado o WSS estado_inicial). */
    aplicarSnapshot(estado, marcaAlLanzar, fuente) {
      const snap = { comando: estado.comando, codigo: estado.codigo, detener: estado.comando === null && estado.codigo === null };
      if (marcaAlLanzar !== marca) {
        // Llegó un evento WSS mientras se consultaba: el snapshot puede ser viejo. Solo confirma si coincide.
        if (actual?.fuente === 'wss' && !actual.fechaBackend && coincide(actual, snap)) {
          actual.fecha = estado.fecha; actual.fechaBackend = true;
          pintarFecha();
          if (!actual.demo) fase('persistido', 'hecho', 'Estado del vehículo actualizado en RDS');
        }
        return false;
      }
      if (actual?.fechaBackend && estado.fecha < actual.fecha) return false; // más viejo que lo mostrado
      actual = { fuente, idSolicitud: null, comando: estado.comando, codigo: estado.codigo, fecha: estado.fecha, fechaBackend: true, detener: snap.detener };
      // Estado sin comando (p. ej. tras DETENER): se dice tal cual, sin inventar un movimiento.
      pintarMovimiento(snap.detener ? 'Sin comando activo' : estado.comando, estado.codigo);
      ui.card.dataset.demo = 'false';
      ui.fuente.textContent = fuente === 'rest' ? 'Último estado reportado por la API (GET /estado)' : 'Estado inicial enviado por el WSS al conectar';
      fase('publicado', 'no-aplica', 'Consultado como estado, no como evento en vivo');
      fase('entregado', 'no-aplica', 'Sin datos de entrega para este estado');
      fase('persistido', 'hecho', 'Guardado en RDS (fecha_actualizacion)');
      fase('fisico', 'sin-verificar', 'Ejecución física no verificable: no hay telemetría del dispositivo');
      return true;
    },

    /** Evento WSS comando_individual (en vivo, puede venir de cualquier pestaña o cliente). */
    alComando(comando, demo) {
      marca += 1;
      const detener = esDetenerWss(comando);
      actual = { fuente: 'wss', idSolicitud: comando.idSolicitud, comando: comando.comando, codigo: comando.codigo, fecha: new Date(), fechaBackend: false, demo, detener };
      pintarMovimiento(detener ? 'DETENER' : comando.comando, detener ? null : comando.codigo, demo ? `Paso de DEMO ${demo.paso}${demo.total ? ` de ${demo.total}` : ''}` : (detener ? 'APAGAR_TODO' : ''));
      ui.card.dataset.demo = demo ? 'true' : 'false';
      ui.fuente.textContent = demo ? `Paso interno de la DEMO "${demo.nombre || demo.idDemo}"` : 'Movimiento individual publicado en tiempo real';
      fase('publicado', 'hecho', `Publicado por WSS · id_solicitud ${comando.idSolicitud.slice(0, 8)}…`);
      fase('entregado', 'pendiente', 'Esperando confirmación de entrega del backend');
      if (demo) fase('persistido', 'no-aplica', 'Paso de DEMO: no se agrega a la tabla de movimientos individuales');
      else fase('persistido', 'pendiente', 'Verificando en RDS mediante GET /historial…');
      fase('fisico', 'sin-verificar', 'Ejecución física no verificable: no hay telemetría del dispositivo');
    },

    /** Evento WSS comando_individual_completado. */
    alCompletado(completado) {
      if (actual?.idSolicitud !== completado.idSolicitud) return;
      const texto = completado.estado === 'entregado_a_observadores'
        ? 'Entregado a observadores WSS (sin confirmación de firmware)'
        : `Respuesta del backend: ${completado.estado || 'sin estado'}`;
      fase('entregado', 'hecho', texto);
    },

    /** La fila apareció en GET /historial. */
    alPersistido(idSolicitud, fila) {
      if (actual?.idSolicitud !== idSolicitud) return;
      actual.fecha = fila.fecha; actual.fechaBackend = true;
      pintarFecha();
      fase('persistido', 'hecho', `Persistido en RDS · ID ${fila.id} (${fila.origen})`);
    },

    alNoConfirmado(idSolicitud) {
      if (actual?.idSolicitud !== idSolicitud) return;
      fase('persistido', 'sin-confirmar', 'Aún no aparece en el historial; se revisará al reconectar o con el próximo evento');
    },

    /** La API respondió sin ningún estado para el vehículo. */
    sinDatos() {
      if (actual) return;
      ui.card.dataset.estado = 'sin-datos';
      ui.nombre.textContent = 'Sin movimientos';
      ui.codigo.hidden = false;
      ui.codigo.textContent = 'La API no reporta ningún estado para este vehículo.';
    },

    cargando() {
      if (actual) return;
      ui.card.dataset.estado = 'cargando';
      ui.nombre.textContent = 'Cargando…';
      ui.codigo.hidden = true;
    },

    error(texto, desconectado = false) {
      if (actual) { ui.aviso.hidden = false; ui.aviso.dataset.tipo = desconectado ? 'desconectado' : 'error'; ui.aviso.textContent = `${texto} Se muestra el último dato obtenido.`; return; }
      ui.card.dataset.estado = desconectado ? 'desconectado' : 'error';
      ui.nombre.textContent = desconectado ? 'Desconectado' : 'Error';
      ui.codigo.hidden = false;
      ui.codigo.textContent = texto;
    },

    limpiarAviso() { ui.aviso.hidden = true; ui.aviso.textContent = ''; },

    conexion(enLinea) {
      if (enLinea) { if (ui.aviso.dataset.tipo === 'wss') this.limpiarAviso(); return; }
      ui.aviso.hidden = false;
      ui.aviso.dataset.tipo = 'wss';
      ui.aviso.textContent = 'Sin conexión WSS: los movimientos nuevos no se verán hasta reconectar (se resincroniza por REST al volver).';
    }
  };
}

/** Indicador de DEMO en tiempo real (no es historial). */
export function crearEstadoDemo(ui) {
  function pintar(estado, titulo, detalle) {
    ui.caja.hidden = false;
    ui.caja.dataset.estado = estado;
    ui.titulo.textContent = titulo;
    ui.detalle.textContent = detalle;
  }
  let ocultarTimer = null;
  return {
    iniciada: (demo) => { clearTimeout(ocultarTimer); pintar('en-curso', `DEMO en curso · ${demo.nombre || `Demo ${demo.idDemo}`}`, `Paso 0${demo.total ? ` de ${demo.total}` : ''}`); },
    paso: (demo) => pintar('en-curso', `DEMO en curso · ${demo.nombre || `Demo ${demo.idDemo}`}`, `Paso ${demo.paso}${demo.total ? ` de ${demo.total}` : ''} · publicado por WSS`),
    completada: (demo, total) => {
      pintar('completada', 'DEMO completada', `${total ?? demo?.paso ?? '?'} movimientos publicados · sin confirmación física`);
      ocultarTimer = setTimeout(() => { ui.caja.hidden = true; }, 8000);
    },
    desconocida: (motivo) => pintar('desconocida', 'Estado de DEMO desconocido', motivo)
  };
}
