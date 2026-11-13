// Tabla de los DIEZ movimientos individuales más recientes PERSISTIDOS en RDS (fuente única: GET /historial).
// - El endpoint no admite límite/orden/filtro: se descarga completo y se filtra aquí.
// - Orden y deduplicación por id_historial (verificado: ids únicos y fecha_hora no decreciente con el id).
// - Se excluyen los pasos de DEMO (origen "demo").
// - Una sola petición en vuelo; si llega otra solicitud se encadena UNA recarga más (sin polling).
// - Nunca se aplica una respuesta cuyo id máximo sea menor que el ya mostrado.
// - Quitar visualmente la fila 11 solo la saca del DOM: jamás se borra nada en RDS.
import { ROUTES, HISTORIAL_FILAS, HISTORIAL_ORIGENES_EXCLUIDOS, HISTORIAL_AGRUPAR_MS, HISTORIAL_REINTENTOS_MS } from '../core/config.js';
import { request } from '../core/api.js';
import { validarHistorial, esDetenerHistorial, esDetenerWss } from '../core/validaciones.js';
import { formatearFecha, formatearHora, isoUtc } from '../core/fecha.js';

export function nombreMovimiento(fila) {
  return esDetenerHistorial(fila) ? 'DETENER' : (fila.comando ?? 'Comando sin nombre');
}

/**
 * @param {{ tbody: HTMLElement, estado: HTMLElement, tabla: HTMLElement, actualizado: HTMLElement }} ui
 */
export function crearHistorial(ui) {
  const controlador = new AbortController();
  let individuales = []; // todas las filas individuales válidas, desc por id
  let maxIdAplicado = 0;
  let maxIdAnterior = 0; // máximo antes de la última recarga aplicada
  let aplicadoEn = 0;
  let cargadoAlgunaVez = false;
  let enCurso = null;
  let otraVez = false;
  let agruparTimer = null;
  const pendientes = []; // { esperado, maxIdPrevio, intento, resolve }
  const idsReclamados = new Set();

  function mostrarEstado(tipo, texto) {
    ui.estado.dataset.estado = tipo;
    ui.estado.textContent = texto;
    ui.tabla.dataset.estado = tipo;
  }

  function crearFilaDom(fila) {
    const tr = document.createElement('tr');
    tr.dataset.id = String(fila.id);
    const num = document.createElement('td'); num.className = 'col-num';
    const mov = document.createElement('td'); mov.className = 'col-mov';
    const nombre = document.createElement('span'); nombre.className = 'mov-nombre'; nombre.textContent = nombreMovimiento(fila);
    const meta = document.createElement('span'); meta.className = 'mov-meta';
    const partes = [`ID ${fila.id}`];
    if (fila.codigo !== null) partes.push(`código ${fila.codigo}`);
    partes.push(fila.origen);
    meta.textContent = partes.join(' · ');
    if (esDetenerHistorial(fila)) tr.dataset.detener = 'true';
    mov.append(nombre, meta);
    const fecha = document.createElement('td'); fecha.className = 'col-fecha';
    const tFecha = document.createElement('time'); tFecha.dateTime = isoUtc(fila.fecha); tFecha.textContent = formatearFecha(fila.fecha);
    fecha.append(tFecha);
    const hora = document.createElement('td'); hora.className = 'col-hora';
    const tHora = document.createElement('time'); tHora.dateTime = isoUtc(fila.fecha); tHora.textContent = formatearHora(fila.fecha);
    hora.append(tHora);
    tr.append(num, mov, fecha, hora);
    return tr;
  }

  // Reconciliación por id: solo se crean, mueven o quitan las filas necesarias.
  function render(top) {
    const existentes = new Map([...ui.tbody.querySelectorAll('tr[data-id]')].map((tr) => [Number(tr.dataset.id), tr]));
    ui.tbody.querySelectorAll('tr:not([data-id])').forEach((tr) => tr.remove());
    top.forEach((fila, index) => {
      let tr = existentes.get(fila.id);
      if (tr) existentes.delete(fila.id);
      else {
        tr = crearFilaDom(fila);
        if (cargadoAlgunaVez) tr.dataset.nuevo = 'true';
      }
      tr.firstElementChild.textContent = String(index + 1);
      if (ui.tbody.children[index] !== tr) ui.tbody.insertBefore(tr, ui.tbody.children[index] || null);
    });
    for (const tr of existentes.values()) tr.remove(); // la fila 11 sale del DOM; RDS no se toca
  }

  async function cargar() {
    if (!cargadoAlgunaVez) mostrarEstado('cargando', 'Cargando movimientos…');
    else ui.estado.dataset.actualizando = 'true';
    try {
      const respuesta = await request(ROUTES.historial, { signal: controlador.signal });
      const validado = validarHistorial(respuesta);
      if (!validado) throw Object.assign(new Error('La API devolvió un historial con formato no válido.'), { kind: 'json' });
      const porId = new Map();
      for (const fila of validado.filas) {
        if (HISTORIAL_ORIGENES_EXCLUIDOS.includes(fila.origen)) continue;
        porId.set(fila.id, fila); // deduplicación por id_historial
      }
      const ordenadas = [...porId.values()].sort((a, b) => b.id - a.id);
      const maxId = ordenadas[0]?.id ?? 0;
      if (maxId < maxIdAplicado) return; // respuesta más vieja que lo mostrado: se ignora
      individuales = ordenadas;
      if (maxId !== maxIdAplicado) { maxIdAnterior = maxIdAplicado; aplicadoEn = Date.now(); }
      maxIdAplicado = maxId;
      render(ordenadas.slice(0, HISTORIAL_FILAS));
      cargadoAlgunaVez = true;
      if (!ordenadas.length) mostrarEstado('vacio', 'Sin movimientos individuales registrados.');
      else mostrarEstado('ok', `${Math.min(HISTORIAL_FILAS, ordenadas.length)} de ${ordenadas.length} movimientos individuales persistidos.`);
      ui.actualizado.textContent = `Consultado a las ${formatearHora(new Date())}`;
      if (validado.descartadas) console.warn(`[historial] ${validado.descartadas} filas con formato no válido se omitieron.`);
    } catch (error) {
      if (error?.kind === 'abort') return;
      const desconectado = navigator.onLine === false || error?.kind === 'network';
      const texto = desconectado ? 'Desconectado: no se pudo consultar el historial.' : `Error al consultar el historial: ${error?.message || error}`;
      if (cargadoAlgunaVez) mostrarEstado(desconectado ? 'desconectado' : 'error', `${texto} Se muestran los últimos datos obtenidos.`);
      else mostrarEstado(desconectado ? 'desconectado' : 'error', texto);
    } finally {
      delete ui.estado.dataset.actualizando;
      revisarPendientes();
    }
  }

  /** Recarga desde REST. Llamadas concurrentes se agrupan en a lo sumo una recarga adicional. */
  function sincronizar() {
    if (enCurso) { otraVez = true; return enCurso; }
    enCurso = (async () => {
      try {
        do { otraVez = false; await cargar(); } while (otraVez && !controlador.signal.aborted);
      } finally { enCurso = null; }
    })();
    return enCurso;
  }

  function coincide(fila, esperado) {
    if (esperado.detener) return esDetenerHistorial(fila);
    if (esperado.codigo !== null && fila.codigo === esperado.codigo) return true;
    return fila.comando === esperado.comando;
  }

  function revisarPendientes() {
    for (const pendiente of [...pendientes]) {
      const fila = individuales.find((item) => item.id > pendiente.maxIdPrevio && !idsReclamados.has(item.id) && coincide(item, pendiente.esperado));
      if (fila) {
        idsReclamados.add(fila.id);
        if (idsReclamados.size > 200) idsReclamados.delete(idsReclamados.values().next().value);
        pendientes.splice(pendientes.indexOf(pendiente), 1);
        pendiente.resolve(fila);
        continue;
      }
      if (pendiente.programado) continue;
      const espera = HISTORIAL_REINTENTOS_MS[pendiente.intento];
      if (espera === undefined) { pendientes.splice(pendientes.indexOf(pendiente), 1); pendiente.resolve(null); continue; }
      pendiente.intento += 1;
      pendiente.programado = true;
      setTimeout(() => { pendiente.programado = false; void sincronizar(); }, espera);
    }
  }

  /**
   * Tras un comando_individual válido (fuera de DEMO): confirma por REST que quedó persistido.
   * Resuelve con la fila de RDS o null si no aparece tras los reintentos acotados.
   */
  function confirmarMovimiento(comando) {
    return new Promise((resolve) => {
      pendientes.push({
        esperado: { detener: esDetenerWss(comando), codigo: comando.codigo, comando: comando.comando },
        // Si la última recarga fue hace muy poco, la fila pudo llegar ANTES que el evento WSS.
        maxIdPrevio: Date.now() - aplicadoEn < 1500 ? maxIdAnterior : maxIdAplicado,
        intento: 0,
        programado: true, // la primera consulta la hace la recarga agrupada
        resolve
      });
      clearTimeout(agruparTimer);
      agruparTimer = setTimeout(() => {
        for (const pendiente of pendientes) pendiente.programado = false;
        void sincronizar();
      }, HISTORIAL_AGRUPAR_MS);
    });
  }

  return {
    sincronizar,
    confirmarMovimiento,
    cancelar: () => controlador.abort()
  };
}
