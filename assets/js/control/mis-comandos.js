// «Mis comandos» (V009): comandos propios del comprador. Cada uno es un nombre suyo para un movimiento
// físico ya registrado (mismo código), así que se envía por su id_comando y respeta las mismas reglas que
// los de fábrica: los sostenidos se mantienen presionados y se DETIENEN al soltar; los toggles, un clic.
import { GRUPOS } from '../data/grupos.js';
import { byId } from './ui.js';

const tipoDe = (codigo) => GRUPOS.find((g) => g.codigos.includes(Number(codigo)))?.tipo || 'toggle';

export function renderMisComandos(propios, { enviarComando, detener, isSustainedMovementActive }) {
  const root = byId('command-groups');
  root.querySelector('[data-mis-comandos]')?.remove();
  if (!propios.length) return;
  const section = document.createElement('section');
  section.className = 'command-group';
  section.dataset.misComandos = '';
  const heading = document.createElement('h3');
  heading.textContent = 'Mis comandos';
  section.append(heading);
  for (const comando of propios) {
    const tipo = tipoDe(comando.codigo);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'command-button command-propio';
    button.dataset.commandCode = comando.codigo;
    button.dataset.tipo = tipo;
    button.dataset.estadoOriginal = 'ok';
    button.title = `Comando propio · movimiento ${comando.codigo}${tipo === 'sostenido' ? ' · mantén presionado' : ''}`;
    const icon = document.createElement('span'); icon.className = 'command-icon'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = '★';
    const label = document.createElement('span'); label.className = 'command-label'; label.textContent = comando.nombre;
    button.append(icon, label);
    button.setAttribute('aria-label', `Mi comando ${comando.nombre}${tipo === 'sostenido' ? ' (mantener presionado)' : ''}`);
    if (tipo === 'sostenido') {
      let activo = false;
      const soltar = () => { if (!activo) return; activo = false; if (isSustainedMovementActive()) void detener('soltar mi comando'); };
      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || button.disabled) return;
        activo = true;
        button.setPointerCapture?.(e.pointerId);
        void enviarComando(comando.codigo, 'mis comandos', comando);
      });
      for (const evento of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(evento, soltar);
      button.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); activo = true; void enviarComando(comando.codigo, 'mis comandos', comando); } });
      button.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') soltar(); });
      button.addEventListener('blur', soltar);
    } else {
      button.addEventListener('click', () => enviarComando(comando.codigo, 'mis comandos', comando));
    }
    section.append(button);
  }
  root.append(section);
}
