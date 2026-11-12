import { JOYSTICK_AXIS_HYSTERESIS } from '../core/config.js';

// El unico estado compartido es el propietario del gesto para excluir los controles.
let owner = null;
const controls = new Set();

function refreshLocks() {
  for (const control of controls) {
    const blocked = owner !== null && owner !== control.element;
    control.element.dataset.estado = blocked ? 'bloqueado' : (control.hasMissingCodes ? 'error' : 'ok');
    if (blocked) control.element.setAttribute('aria-disabled', 'true');
    else control.element.removeAttribute('aria-disabled');
  }
}

function acquire(control) {
  if (owner !== null && owner !== control.element) return false;
  owner = control.element;
  refreshLocks();
  return true;
}

function releaseOwner(control) {
  if (owner !== control.element) return false;
  owner = null;
  refreshLocks();
  return true;
}

export function setupJoystick(element, knob, commands, getCatalog, map) {
  let pointer = null;
  let reportedDirection = null;
  let previousAxis = null;
  const pressedKeys = new Set();
  const keyDirections = { ArrowUp: 'arriba', ArrowDown: 'abajo', ArrowLeft: 'izquierda', ArrowRight: 'derecha' };
  const available = (direction) => getCatalog().some((item) => Number(item.codigo) === map[direction] && item.activo);
  const control = { element, hasMissingCodes: Object.entries(map).some(([direction, code]) => !getCatalog().some((item) => Number(item.codigo) === code && item.activo)) };
  controls.add(control);
  refreshLocks();

  // Cada instancia conserva solo su gesto y direccion reportada.
  function report(direction, source) {
    const next = direction && available(direction) ? direction : null;
    if (next === reportedDirection) return;
    const previous = reportedDirection;
    reportedDirection = next;
    if (next) commands.enviarComando(map[next], source);
    else if (previous && owner === element) commands.detener('joystick centrado o direccion no disponible');
  }

  function directionFor(dx, dy) {
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (!previousAxis) previousAxis = absX >= absY ? 'horizontal' : 'vertical';
    else if (previousAxis === 'horizontal' && absY > absX * (1 + JOYSTICK_AXIS_HYSTERESIS)) previousAxis = 'vertical';
    else if (previousAxis === 'vertical' && absX > absY * (1 + JOYSTICK_AXIS_HYSTERESIS)) previousAxis = 'horizontal';
    return previousAxis === 'horizontal' ? (dx >= 0 ? 'derecha' : 'izquierda') : (dy >= 0 ? 'abajo' : 'arriba');
  }

  function move(event) {
    const rect = element.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy) / (rect.width / 2);
    if (distance < 0.22) {
      previousAxis = null;
      knob.dataset.direction = 'centro';
      report(null, 'joystick');
      return;
    }
    const direction = directionFor(dx, dy);
    knob.dataset.direction = direction;
    report(direction, 'joystick');
  }

  function releaseGesture(reason) {
    if (owner !== element) return;
    pointer = null; previousAxis = null; pressedKeys.clear(); reportedDirection = null;
    knob.dataset.direction = 'centro';
    releaseOwner(control);
    commands.detener(reason);
  }

  element.addEventListener('contextmenu', (event) => event.preventDefault());
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== null || pressedKeys.size > 0 || !acquire(control)) return;
    pointer = event.pointerId;
    try { element.setPointerCapture(pointer); }
    catch { releaseGesture('no se pudo capturar el puntero'); return; }
    move(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === pointer && owner === element) move(event); });
  element.addEventListener('pointerup', (event) => {
    if (pointer === event.pointerId) releaseGesture('liberacion del joystick');
  });
  element.addEventListener('pointercancel', (event) => {
    if (pointer === event.pointerId) releaseGesture('cancelacion del joystick');
  });
  element.addEventListener('lostpointercapture', (event) => {
    if (pointer === event.pointerId) releaseGesture('perdida de captura del joystick');
  });

  element.addEventListener('keydown', (event) => {
    const direction = keyDirections[event.key];
    if (!direction) return;
    if (pointer !== null) { event.preventDefault(); return; }
    if (!acquire(control)) { event.preventDefault(); return; }
    event.preventDefault();
    if (pressedKeys.has(event.key)) return;
    pressedKeys.add(event.key);
    report(direction, 'teclado');
  });
  element.addEventListener('keyup', (event) => {
    if (!keyDirections[event.key] || !pressedKeys.has(event.key) || owner !== element) return;
    event.preventDefault(); pressedKeys.delete(event.key);
    const remainingKeys = [...pressedKeys];
    const remainingKey = remainingKeys[remainingKeys.length - 1];
    if (remainingKey) report(keyDirections[remainingKey], 'teclado');
    else releaseGesture('teclado liberado');
  });
  element.addEventListener('blur', () => {
    if (owner === element) releaseGesture('perdida de foco del joystick');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && owner === element) releaseGesture('pestana oculta');
  });
}
