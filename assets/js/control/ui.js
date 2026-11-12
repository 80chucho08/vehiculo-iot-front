import { GRUPOS } from '../data/grupos.js';
import { JOYSTICK_GRUA, JOYSTICK_GARRA } from '../data/joystick-map.js';
import { getState } from '../core/state.js';

export function byId(id) { return document.getElementById(id); }
export function setStatusCard(id, title, status, state) {
  const card = byId(id); card.dataset.estado = state; card.querySelector('p').textContent = status;
  if (title) card.querySelector('h3').textContent = title;
}
// El control solo muestra la última acción y su estado; el historial vive en eventos.html.
export function createActionLogger() {
  const container = byId('action-messages');
  return (message, status = 'ok', correlation = '') => {
    const item = document.createElement('p'); item.dataset.estado = status;
    item.textContent = `${message}${correlation ? ` | solicitud ${correlation}` : ''}`;
    container.replaceChildren(item);
    container.dataset.estado = status;
  };
}
export function setVehicleName(name) { byId('vehicle-name').textContent = typeof name === 'string' && name.trim() ? name : 'Vehículo sin identificar'; }
export function setBackendConnectivity(value) {
  const node = byId('backend-connectivity'); node.textContent = `Unidad ID 1 · vehículo ${value ? 'verificado' : 'sin verificar'}`;
  node.dataset.estado = value ? 'ok' : 'error';
}

export function renderCommands(onClick, stopCommand = () => {}) {
  const root = byId('command-groups'); root.replaceChildren();
  const commands = getState().commands;
  if (!commands.length) {
    for (let index = 0; index < 4; index += 1) { const skeleton = document.createElement('button'); skeleton.type = 'button'; skeleton.className = 'command-button skeleton'; skeleton.dataset.estadoOriginal = 'error'; skeleton.disabled = true; skeleton.setAttribute('aria-label', 'Comando no disponible'); skeleton.textContent = ' '; root.append(skeleton); }
    return;
  }
  for (const group of GRUPOS) {
    // Los sostenidos se controlan con sus joysticks; los botones son solo toggles.
    if (group.tipo !== 'toggle') continue;
    const section = document.createElement('section'); section.className = 'command-group';
    const heading = document.createElement('h3'); heading.textContent = group.nombre;
    const buttons = document.createElement('div'); buttons.className = 'command-buttons';
    for (const command of commands.filter((item) => group.codigos.includes(Number(item.codigo)) && Number(item.codigo) !== 13)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'command-button';
      button.dataset.commandCode = command.codigo; button.dataset.tipo = group.tipo;
      button.dataset.estadoOriginal = command.activo ? 'ok' : 'error';
      const icon = document.createElement('span'); icon.className = 'command-icon'; icon.setAttribute('aria-hidden', 'true');
      icon.textContent = ({ 5: '◉', 6: '✦', 7: '⌁', 8: '●' })[Number(command.codigo)] || '◇';
      const label = document.createElement('span'); label.className = 'command-label'; label.textContent = command.nombre;
      button.append(icon, label);
      button.setAttribute('aria-label', `Enviar comando ${command.nombre}`);
      button.disabled = !command.activo; button.dataset.estado = command.activo ? 'ok' : 'error';
      button.dataset.accion = command.activo ? 'normal' : 'error';
      button.addEventListener('click', () => onClick(command.codigo));
      buttons.append(button);
    }
    if (buttons.children.length) { section.append(heading, buttons); root.append(section); }
  }
  const rendered = root.querySelectorAll('.command-button').length;
  for (let index = rendered; index < 4; index += 1) { const skeleton = document.createElement('button'); skeleton.type = 'button'; skeleton.className = 'command-button skeleton'; skeleton.dataset.estadoOriginal = 'error'; skeleton.disabled = true; skeleton.setAttribute('aria-label', 'Comando no disponible'); skeleton.textContent = ' '; root.append(skeleton); }

  const missingFor = (map) => Object.entries(map)
    .filter(([, code]) => !commands.some((item) => Number(item.codigo) === code && item.activo))
    .map(([direction]) => direction);
  const gruaMissing = missingFor(JOYSTICK_GRUA);
  const garraMissing = missingFor(JOYSTICK_GARRA);
  byId('joystick-grua-notice').textContent = gruaMissing.length
    ? `Direcciones deshabilitadas: ${gruaMissing.join(', ')} (comando ausente o inactivo en catalogo).`
    : 'Todas las direcciones de grua estan disponibles.';
  byId('joystick-garra-notice').textContent = garraMissing.length
    ? `Direcciones deshabilitadas: ${garraMissing.join(', ')} (comando ausente o inactivo en catalogo).`
    : 'Todas las direcciones de garra estan disponibles.';
  void stopCommand;
}

export function renderDemos(demos) {
  const select = byId('demo-select'); select.replaceChildren();
  const activeDemos = demos.filter((item) => item.activo === 1);
  const placeholder = document.createElement('option'); placeholder.value = '';
  placeholder.textContent = activeDemos.length ? 'Selecciona una demo' : 'No hay demos disponibles'; select.append(placeholder);
  for (const demo of activeDemos) {
    const option = document.createElement('option'); option.value = demo.id_demo; option.textContent = demo.nombre; select.append(option);
  }
  select.disabled = select.options.length < 2;
}

export function setCommandButtonsState({ sending = false, demoRunning = false, activeCode = null } = {}) {
  document.querySelectorAll('.command-button').forEach((button) => {
    const selected = Number(button.dataset.commandCode) === Number(activeCode);
    button.disabled = demoRunning || button.dataset.estadoOriginal === 'error';
    button.dataset.accion = button.disabled ? 'deshabilitado' : (selected ? 'presionado' : (sending ? 'enviando' : 'normal'));
    button.dataset.estado = selected || (sending && button.dataset.tipo === 'sostenido') ? 'cargando' : (button.disabled ? 'error' : 'ok');
    button.removeAttribute('aria-pressed');
  });
}

// Interacciones de la cabina: diálogos, pantalla completa, popover de WebSocket, hoja de demos y aviso de giro.
export function initControlChrome() {
  const get = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
  byId('fullscreen-toggle').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch {} });

  const dialogs = ['settings-sheet', 'demo-sheet'].map(byId);
  const showDialog = (dialog, opener) => { dialog._opener = opener; if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); };
  for (const dialog of dialogs) {
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => dialog._opener?.focus());
  }
  byId('settings-open').addEventListener('click', (event) => showDialog(byId('settings-sheet'), event.currentTarget));
  document.querySelector('[data-close="settings-sheet"]').addEventListener('click', () => byId('settings-sheet').close());

  const wsInfo = byId('ws-info'); const wsPopover = byId('ws-popover');
  const closePopover = () => { wsPopover.hidden = true; wsInfo.setAttribute('aria-expanded', 'false'); };
  wsInfo.addEventListener('click', () => {
    const open = wsPopover.hidden; wsPopover.hidden = !open; wsInfo.setAttribute('aria-expanded', String(open));
    if (open) { const first = wsPopover.querySelector('p'); first.setAttribute('tabindex', '-1'); first.focus(); }
  });
  document.addEventListener('pointerdown', (event) => { if (!wsPopover.hidden && !wsPopover.contains(event.target) && event.target !== wsInfo) closePopover(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !wsPopover.hidden) { closePopover(); wsInfo.focus(); } });

  const sheet = byId('demo-sheet'); const primarySelect = byId('demo-select'); const secondarySelect = byId('demo-select-sheet');
  const copyOptions = (from, to) => { const selected = from.value; to.replaceChildren(...[...from.options].map((option) => { const clone = document.createElement('option'); clone.value = option.value; clone.textContent = option.textContent; clone.disabled = option.disabled; return clone; })); to.value = selected; };
  const syncPrimary = () => { primarySelect.value = secondarySelect.value; primarySelect.dispatchEvent(new Event('change', { bubbles: true })); };
  byId('demo-open').addEventListener('click', (event) => { if (event.currentTarget.classList.contains('demo-running')) { byId('demo-cancel').click(); return; } copyOptions(primarySelect, secondarySelect); showDialog(sheet, event.currentTarget); });
  byId('demo-close').addEventListener('click', () => sheet.close());
  secondarySelect.addEventListener('change', syncPrimary);
  byId('demo-sheet-start').addEventListener('click', () => { syncPrimary(); byId('demo-start').click(); sheet.close(); });
  byId('demo-sheet-cancel').addEventListener('click', () => { byId('demo-cancel').click(); sheet.close(); });
  new MutationObserver(() => copyOptions(primarySelect, secondarySelect)).observe(primarySelect, { childList: true });

  const hint = byId('rotate-hint');
  if (get('cabina-rotate-hint', '') !== 'oculto' && matchMedia('(max-width: 700px) and (orientation: landscape)').matches) { hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 6000); }
}
