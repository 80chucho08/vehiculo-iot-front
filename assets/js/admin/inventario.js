// Inventario: unidades físicas (vehiculos) con modelo, serie, tipo y comprador vigente.
// Alta y edición comercial, comandos (de fábrica y propios de compradores), demos de cualquier unidad
// y dispositivo compartido (V009: un mismo ESP8266 registrado como varias unidades para pruebas).
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { abrirDemosDeUnidad } from './editor-demos.js';
import { abrirFormulario, abrirPanel, avisar, crearTabla, el, etiqueta, textoError } from './ui.js';

const TIPOS = [['venta', 'Venta'], ['exhibicion', 'Exhibición'], ['simulada', 'Simulada']];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const PATRON_SERIE = '[A-Z0-9][A-Z0-9\\-]{2,39}';

export function crearInventario(contenedor) {
  let modelos = [];
  let unidades = [];
  let cargado = false;

  const tabla = crearTabla({
    titulo: 'Unidades del inventario',
    columnas: [
      { titulo: 'Unidad', celda: (u) => el('span', { class: 'celda-doble' }, el('strong', {}, u.nombre), el('small', {}, `ID ${u.id_vehiculo} · ${u.numero_serie || 'sin serie'}`)) },
      { titulo: 'Modelo', celda: (u) => u.modelo || '—' },
      { titulo: 'Tipo', celda: (u) => etiqueta(NOMBRE_TIPO[u.tipo_unidad] || u.tipo_unidad, u.tipo_unidad === 'exhibicion' ? 'acento' : 'neutro') },
      { titulo: 'Estado', celda: (u) => (u.activo ? etiqueta('Activa', 'ok') : etiqueta('De baja', 'error')) },
      { titulo: 'Comprador', celda: (u) => (u.propietario ? u.propietario : el('span', { class: 'texto-tenue' }, u.tipo_unidad === 'venta' ? 'Disponible' : 'No se vende')) },
      { titulo: 'Dispositivo', celda: (u) => el('span', { class: 'celda-doble' },
        u.dispositivo_conectado ? etiqueta('En línea', 'ok') : etiqueta('Sin conexión', 'neutro'),
        u.id_unidad_fisica ? el('small', {}, `ESP8266 compartido de ID ${u.id_unidad_fisica}`) : null) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (u) => el('span', { class: 'acciones' },
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => editar(u), 'aria-label': `Editar ${u.nombre}` }, 'Editar'),
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => comandos(u), 'aria-label': `Comandos de ${u.nombre}` }, 'Comandos'),
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => abrirDemosDeUnidad(u, { admin: true }), 'aria-label': `Demos de ${u.nombre}` }, 'Demos'),
        el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => tokenDispositivo(u), 'aria-label': `Token del ESP8266 de ${u.nombre}` }, 'Token ESP')) }
    ]
  });

  // Token del ESP8266 (Etapa 8): se genera aquí y se muestra UNA vez; la API solo guarda su SHA-256.
  function tokenDispositivo(u) {
    abrirFormulario({
      titulo: `Token del ESP8266 · ${u.nombre}`,
      descripcion: 'Genera un token nuevo para el firmware de esta unidad. Si ya había uno, el dispositivo que lo usa dejará de conectarse hasta que actualices credenciales_dispositivo.h.',
      campos: [{ nombre: 'confirmo', tipo: 'checkbox', valor: false, etiqueta: 'Entiendo que el token anterior deja de servir.' }],
      textoEnviar: 'Generar token', peligro: true,
      enviar: async ({ confirmo }) => {
        if (!confirmo) throw new Error('Marca la confirmación para generar el token.');
        const r = await request(ADMIN_ROUTES.tokenDispositivo(u.id_vehiculo), { method: 'POST', auth: true });
        const campo = el('input', { type: 'text', readonly: true, class: 'token-campo', 'aria-label': 'Token del dispositivo' });
        campo.value = r.token;
        abrirPanel({ titulo: 'Copia el token ahora', contenido: el('div', { class: 'admin-form' },
          el('p', { class: 'admin-sub' }, 'No se volverá a mostrar. En el firmware, pon en credenciales_dispositivo.h:'),
          el('code', { class: 'token-bloque' }, `#define DISPOSITIVO_ID_VEHICULO ${u.id_vehiculo}`),
          campo,
          el('button', { type: 'button', class: 'tecla tecla-chica', onclick: async (e) => {
            campo.select();
            try { await navigator.clipboard.writeText(r.token); e.target.textContent = 'Copiado ✓'; } catch { e.target.textContent = 'Selecciónalo y cópialo'; }
          } }, 'Copiar token')) });
        campo.select();
      }
    });
  }
  const nueva = el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', onclick: () => alta() }, 'Nueva unidad');
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Inventario de unidades'), nueva),
    el('p', { class: 'admin-sub' }, 'Una unidad vendida solo la opera su comprador; para operarla necesitas su autorización de soporte.'),
    tabla.nodo);

  async function cargar(forzar = false) {
    if (cargado && !forzar) return;
    tabla.cargando();
    try {
      const [inv, mods] = await Promise.all([request(ADMIN_ROUTES.inventario, { auth: true }), request(ADMIN_ROUTES.modelos, { auth: true })]);
      modelos = mods.modelos || [];
      unidades = inv.unidades || [];
      tabla.filas(unidades, 'Aún no hay unidades registradas.');
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudo cargar el inventario: ${textoError(error)}`, () => cargar(true));
    }
  }

  function alta() {
    const disponibles = modelos.filter((m) => m.activo);
    if (!disponibles.length) { avisar('Primero registra un modelo activo en la pestaña Modelos.', 'error'); return; }
    abrirFormulario({
      titulo: 'Nueva unidad',
      descripcion: 'Se copian los comandos y las demos de fábrica de otra unidad del mismo modelo.',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80 },
        { nombre: 'id_modelo', etiqueta: 'Modelo', tipo: 'select', requerido: true, opciones: disponibles.map((m) => [m.id_modelo, m.nombre]) },
        { nombre: 'numero_serie', etiqueta: 'Número de serie', requerido: true, patron: PATRON_SERIE, maxlength: 40, ayuda: 'Mayúsculas, dígitos y guiones. Ejemplo: CJ-2026-0002' },
        { nombre: 'tipo_unidad', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS, valor: 'venta' },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255 }
      ],
      textoEnviar: 'Registrar',
      enviar: async (d) => {
        const r = await request(ADMIN_ROUTES.unidades, { method: 'POST', auth: true, body: { ...d, id_modelo: Number(d.id_modelo), numero_serie: d.numero_serie.toUpperCase() } });
        const demos = `${r.demos_copiadas} demo${r.demos_copiadas === 1 ? '' : 's'}`;
        avisar(`Unidad ${r.id_vehiculo} registrada · ${r.comandos_copiados} comandos y ${demos} copiados${r.plantilla ? ` de la unidad ${r.plantilla}` : ' (sin plantilla: agrega comandos)'}.`);
        await cargar(true);
      }
    });
  }

  function editar(u) {
    abrirFormulario({
      titulo: `Editar ${u.nombre}`,
      descripcion: u.propietario ? 'Vendida: no puede cambiar de tipo ni darse de baja hasta finalizar la asignación.' : null,
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 80, valor: u.nombre },
        { nombre: 'numero_serie', etiqueta: 'Número de serie', requerido: true, patron: PATRON_SERIE, maxlength: 40, valor: u.numero_serie },
        { nombre: 'tipo_unidad', etiqueta: 'Tipo', tipo: 'select', opciones: TIPOS, valor: u.tipo_unidad },
        { nombre: 'microcontrolador', etiqueta: 'Microcontrolador', maxlength: 50, valor: u.microcontrolador },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255, valor: u.descripcion },
        { nombre: 'id_unidad_fisica', etiqueta: 'Dispositivo (ESP8266)', tipo: 'select', valor: u.id_unidad_fisica ?? '',
          opciones: [['', 'Propio (su firmware usa esta unidad)'],
            ...unidades.filter((o) => o.id_vehiculo !== u.id_vehiculo && o.activo && !o.id_unidad_fisica).map((o) => [o.id_vehiculo, `Compartido: el de ${o.nombre} · ID ${o.id_vehiculo}`])],
          ayuda: 'Compartido: los comandos de esta unidad mueven el carrito físico de la otra (pruebas con un solo carrito).' },
        { nombre: 'activo', etiqueta: 'Unidad activa (desmarcar = baja lógica, conserva el historial)', tipo: 'checkbox', valor: Boolean(u.activo) }
      ],
      enviar: async (d) => {
        await request(ADMIN_ROUTES.unidad(u.id_vehiculo), { method: 'PUT', auth: true,
          body: { ...d, numero_serie: d.numero_serie.toUpperCase(), id_unidad_fisica: d.id_unidad_fisica ? Number(d.id_unidad_fisica) : null } });
        avisar(`Unidad ${u.id_vehiculo} actualizada.`);
        await cargar(true);
      }
    });
  }

  async function comandos(u) {
    const lista = el('div', { class: 'comandos-lista' }, el('p', { class: 'admin-estado', 'data-estado': 'cargando' }, 'Cargando comandos…'));
    const nuevo = el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica' }, 'Nuevo comando de fábrica');
    abrirPanel({ titulo: `Comandos de ${u.nombre}`, contenido: el('div', {},
      el('p', { class: 'admin-sub' }, 'Activo: disponible en CONTROL (desmarcar = eliminar con baja lógica; el historial se conserva). Invitados: permitido para invitados (solo movimientos 1-12). Tope: duración máxima por paso de demo. «Propio»: lo creó un comprador.'),
      el('div', { class: 'seccion-cabecera' }, nuevo), lista) });
    async function recargar() {
      try {
        const r = await request(ADMIN_ROUTES.comandosAdmin(u.id_vehiculo), { auth: true });
        const filas = (r.comandos || []).map((c) => filaComando(c, recargar));
        lista.replaceChildren(...(filas.length ? filas : [el('p', { class: 'admin-estado', 'data-estado': 'vacio' }, 'Esta unidad no tiene comandos.')]));
      } catch (error) {
        lista.replaceChildren(el('p', { class: 'admin-estado', 'data-estado': 'error' }, textoError(error)));
      }
    }
    nuevo.addEventListener('click', () => formularioComando(u, null, recargar));
    await recargar();
  }

  // Alta (de fábrica) o edición de nombre, código y descripción de un comando.
  function formularioComando(u, c, alGuardar) {
    abrirFormulario({
      titulo: c ? `Editar «${c.nombre}»` : `Nuevo comando · ${u.nombre}`,
      descripcion: c ? null : 'El código debe ser uno que el firmware entienda (1-13). Entre los de fábrica, el código es único por unidad.',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre', requerido: true, maxlength: 60, valor: c?.nombre },
        { nombre: 'codigo', etiqueta: 'Código', tipo: 'number', requerido: true, min: 1, max: 13, valor: c?.codigo },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255, valor: c?.descripcion }
      ],
      textoEnviar: c ? 'Guardar' : 'Crear',
      enviar: async (d) => {
        if (c) await request(ADMIN_ROUTES.desactivarComando(c.id_comando), { method: 'PUT', auth: true, body: { ...d, activo: Boolean(c.activo) } });
        else await request(ADMIN_ROUTES.crearComandoFabrica(u.id_vehiculo), { method: 'POST', auth: true, body: d });
        avisar(c ? 'Comando actualizado.' : `Comando «${d.nombre}» creado.`);
        await alGuardar();
      }
    });
  }

  function filaComando(c, recargar) {
    const id = `cmd-${c.id_comando}`;
    const activo = el('input', { type: 'checkbox', id: `${id}-a` }); activo.checked = Boolean(c.activo);
    const invitado = el('input', { type: 'checkbox', id: `${id}-i`, disabled: !(c.codigo >= 1 && c.codigo <= 12) }); invitado.checked = Boolean(c.permitido_invitado);
    const tope = el('input', { type: 'number', id: `${id}-t`, min: 100, max: 10000, step: 100, inputmode: 'numeric', placeholder: 'modelo' });
    if (c.duracion_max_ms) tope.value = String(c.duracion_max_ms);
    const estado = el('span', { class: 'comando-estado', role: 'status' });
    const guardar = el('button', { type: 'button', class: 'tecla tecla-chica' }, 'Guardar');
    guardar.addEventListener('click', async () => {
      if (!tope.checkValidity()) { estado.textContent = 'Tope entre 100 y 10 000 ms'; return; }
      guardar.disabled = true; estado.textContent = 'Guardando…';
      try {
        await request(ADMIN_ROUTES.permisosComando(c.id_comando), { method: 'PUT', auth: true,
          body: { activo: activo.checked, permitido_invitado: invitado.checked, duracion_max_ms: tope.value ? Number(tope.value) : null } });
        estado.textContent = 'Guardado ✓';
      } catch (error) { estado.textContent = textoError(error); }
      finally { guardar.disabled = false; }
    });
    const editar = el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => formularioComando(null, c, recargar) }, 'Editar');
    return el('fieldset', { class: 'comando-fila' },
      el('legend', {}, `${c.codigo} · ${c.nombre} `, c.tipo === 'usuario' ? etiqueta(`Propio · ${c.propietario || 'comprador'}`, 'acento') : etiqueta('De fábrica', 'neutro')),
      el('label', { for: `${id}-a` }, activo, ' Activo'),
      el('label', { for: `${id}-i` }, invitado, ' Invitados'),
      el('label', { for: `${id}-t`, class: 'comando-tope' }, 'Tope ms', tope),
      guardar, editar, estado);
  }

  return { cargar };
}
