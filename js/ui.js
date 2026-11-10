import { GRUPOS } from '../data/grupos.js';
import { JOYSTICK_GRUA, JOYSTICK_GARRA } from '../data/joystick-map.js';
import { getState } from './state.js';

export function byId(id) { return document.getElementById(id); }
export function setStatusCard(id, title, status, state) {
  const card = byId(id); card.dataset.estado = state; card.querySelector('p').textContent = status;
  if (title) card.querySelector('h3').textContent = title;
}
export function createActionLogger() {
  const container = byId('action-messages');
  return (message, status = 'ok', correlation = '') => {
    const item = document.createElement('p'); item.dataset.estado = status;
    item.textContent = `${new Date().toLocaleTimeString()} | ${message}${correlation ? ` | solicitud ${correlation}` : ''}`;
    container.prepend(item); while (container.children.length > 12) container.lastElementChild.remove();
  };
}
export function logEvent(message, alreadyLogged = false) {
  if (alreadyLogged) return;
  const item = document.createElement('li'); item.className = 'event-item';
  const type = document.createElement('strong'); type.textContent = typeof message?.tipo === 'string' ? message.tipo : 'tipo desconocido';
  const raw = document.createElement('pre');
  try { raw.textContent = JSON.stringify(message, null, 2); } catch { raw.textContent = String(message); }
  item.append(type, raw); byId('event-log').prepend(item);
  while (byId('event-log').children.length > 10) byId('event-log').lastElementChild.remove();
}
export function setVehicleName(name) { byId('vehicle-name').textContent = name; }
export function setBackendConnectivity(value) {
  const node = byId('backend-connectivity'); node.textContent = `Conexion del vehiculo (dato reportado por el backend): ${String(value)}`;
  node.dataset.estado = value ? 'ok' : 'error';
}

export function renderCommands(onClick, stopCommand = () => {}) {
  const root = byId('command-groups'); root.replaceChildren();
  const commands = getState().commands;
  for (const group of GRUPOS) {
    // Los sostenidos se controlan con sus joysticks; los botones son solo toggles.
    if (group.tipo !== 'toggle') continue;
    const section = document.createElement('section'); section.className = 'command-group';
    const heading = document.createElement('h3'); heading.textContent = group.nombre;
    const buttons = document.createElement('div'); buttons.className = 'command-buttons';
    for (const command of commands.filter((item) => group.codigos.includes(Number(item.codigo)) && Number(item.codigo) !== 13)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-outline-primary command-button';
      button.dataset.commandCode = command.codigo; button.dataset.tipo = group.tipo;
      button.dataset.estadoOriginal = command.activo ? 'ok' : 'error';
      button.textContent = command.nombre;
      button.setAttribute('aria-label', `Enviar comando ${command.nombre}`);
      button.disabled = !command.activo; button.dataset.estado = command.activo ? 'ok' : 'error';
      button.addEventListener('click', () => onClick(command.codigo));
      buttons.append(button);
    }
    if (buttons.children.length) { section.append(heading, buttons); root.append(section); }
  }

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
