// Modelos: catálogo comercial (lo que se vende), separado de la unidad física.
import { ADMIN_ROUTES } from '../core/config.js';
import { request } from '../core/api.js';
import { abrirFormulario, avisar, crearTabla, el, etiqueta, textoError } from './ui.js';

export function crearModelos(contenedor) {
  let cargado = false;
  const tabla = crearTabla({
    titulo: 'Modelos comerciales',
    columnas: [
      { titulo: 'Modelo', celda: (m) => el('span', { class: 'celda-doble' }, el('strong', {}, m.nombre), el('small', {}, m.descripcion || 'Sin descripción')) },
      { titulo: 'Microcontrolador', celda: (m) => m.microcontrolador || '—' },
      { titulo: 'Límites de demo', celda: (m) => `${m.pasos_max_demo} pasos · ${m.duracion_max_paso_ms} ms/paso` },
      { titulo: 'Unidades', clase: 'col-num', celda: (m) => String(m.unidades) },
      { titulo: 'Catálogo', celda: (m) => (m.publicado ? etiqueta('Publicado', 'ok') : etiqueta('Oculto', 'neutro')) },
      { titulo: 'Estado', celda: (m) => (m.activo ? etiqueta('Activo', 'ok') : etiqueta('Inactivo', 'error')) },
      { titulo: 'Acciones', clase: 'col-acciones', celda: (m) => el('button', { type: 'button', class: 'tecla tecla-chica', onclick: () => formulario(m), 'aria-label': `Editar ${m.nombre}` }, 'Editar') }
    ]
  });
  contenedor.append(
    el('div', { class: 'seccion-cabecera' }, el('h2', { class: 'admin-h2' }, 'Modelos'),
      el('button', { type: 'button', class: 'tecla tecla-acento tecla-chica', onclick: () => formulario(null) }, 'Nuevo modelo')),
    el('p', { class: 'admin-sub' }, 'Los límites de demo protegen el hardware: ningún paso supera el tope del modelo (máximo absoluto 10 s).'),
    tabla.nodo);

  async function cargar(forzar = false) {
    if (cargado && !forzar) return;
    tabla.cargando();
    try {
      const r = await request(ADMIN_ROUTES.modelos, { auth: true });
      tabla.filas(r.modelos || [], 'Aún no hay modelos.');
      cargado = true;
    } catch (error) {
      tabla.error(`No se pudieron cargar los modelos: ${textoError(error)}`, () => cargar(true));
    }
  }

  function formulario(m) {
    abrirFormulario({
      titulo: m ? `Editar ${m.nombre}` : 'Nuevo modelo',
      campos: [
        { nombre: 'nombre', etiqueta: 'Nombre comercial', requerido: true, maxlength: 80, valor: m?.nombre },
        { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'textarea', maxlength: 255, valor: m?.descripcion },
        { nombre: 'microcontrolador', etiqueta: 'Microcontrolador', maxlength: 50, valor: m?.microcontrolador },
        { nombre: 'duracion_max_paso_ms', etiqueta: 'Duración máxima por paso (ms)', tipo: 'number', requerido: true, min: 100, max: 10000, valor: m?.duracion_max_paso_ms ?? 3000 },
        { nombre: 'pasos_max_demo', etiqueta: 'Pasos máximos por demo', tipo: 'number', requerido: true, min: 1, max: 50, valor: m?.pasos_max_demo ?? 20 },
        { nombre: 'publicado', etiqueta: 'Visible en el catálogo público', tipo: 'checkbox', valor: m ? Boolean(m.publicado) : false },
        { nombre: 'activo', etiqueta: 'Activo', tipo: 'checkbox', valor: m ? Boolean(m.activo) : true }
      ],
      enviar: async (d) => {
        await request(m ? ADMIN_ROUTES.modelo(m.id_modelo) : ADMIN_ROUTES.modelos, { method: m ? 'PUT' : 'POST', auth: true, body: d });
        avisar(m ? 'Modelo actualizado.' : 'Modelo registrado.');
        await cargar(true);
      }
    });
  }
  return { cargar };
}
