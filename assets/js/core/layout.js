// Piezas de interfaz compartidas por todas las páginas: navegación y créditos.
import { PAGINAS, AUTOR_NOMBRE, MATRICULA, ANIO } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Trazos de 24x24 (stroke). Agrega aquí el icono de cada página nueva.
const ICONOS = Object.freeze({
  control: ['M6 12h4', 'M8 10v4', 'M15 13h.01', 'M18 11h.01', 'M17.3 5H6.7a4 4 0 0 0-4 3.6l-.7 6.9A2.7 2.7 0 0 0 4.7 18.5c1 0 1.9-.6 2.4-1.5L8 15h8l.9 2c.5.9 1.4 1.5 2.4 1.5a2.7 2.7 0 0 0 2.7-3l-.7-6.9A4 4 0 0 0 17.3 5Z'],
  eventos: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  monitoreo: ['M3 12h4l3 8 4-16 3 8h4'],
  administracion: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z']
});

export function crearIcono(nombre) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icono');
  for (const d of ICONOS[nombre] || ICONOS.eventos) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

/**
 * Rellena un <nav data-nav> con enlaces a las demás páginas de PAGINAS.
 * La página actual se omite para ahorrar espacio en la barra superior.
 * Opciones: { mostrarEtiqueta: boolean } para enseñar el texto junto al icono.
 */
export function montarNavegacion(contenedor, paginaActual, { mostrarEtiqueta = false } = {}) {
  if (!contenedor) return;
  const enlaces = PAGINAS.filter((pagina) => pagina.id !== paginaActual).map((pagina) => {
    const enlace = document.createElement('a');
    enlace.className = 'nav-link';
    enlace.href = pagina.href; // relativa: funciona en la raíz y en subrutas (/control-iot/)
    enlace.dataset.pagina = pagina.id;
    enlace.setAttribute('aria-label', pagina.etiqueta);
    enlace.title = pagina.etiqueta;
    enlace.append(crearIcono(pagina.icono));
    if (mostrarEtiqueta) {
      const texto = document.createElement('span');
      texto.className = 'nav-label';
      texto.textContent = pagina.etiqueta;
      enlace.append(texto);
    }
    return enlace;
  });
  contenedor.replaceChildren(...enlaces);
}

export function textoCreditos() {
  return `Desarrollado por ${AUTOR_NOMBRE} · ${MATRICULA} · ${ANIO}`;
}

export function montarCreditos(elemento) {
  if (elemento) elemento.textContent = textoCreditos();
}
