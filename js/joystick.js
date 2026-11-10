import { JOYSTICK_MAP } from '../data/joystick-map.js';
import { JOYSTICK_AXIS_HYSTERESIS } from './config.js';

export function setupJoystick(element, knob, commands, getCatalog) {
  let pointer = null;
  let reportedDirection = null;
  let previousAxis = null;
  let keyboardDirection = null;
  const available = (direction) => getCatalog().some((item) => Number(item.codigo) === JOYSTICK_MAP[direction] && item.activo);

  // Solo publica cambios de direccion/null; la deduplicacion pertenece a commands.js.
  function report(direction, source) {
    const next = direction && available(direction) ? direction : null;
    if (next === reportedDirection) return;
    const previous = reportedDirection;
    reportedDirection = next;
    if (next) commands.enviarComando(JOYSTICK_MAP[next], source);
    else if (previous && pointer !== null) commands.detener('joystick centrado o direccion no disponible');
    else if (previous && source === 'teclado') commands.detener('teclado centrado');
  }

  function directionFor(dx, dy) {
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (!previousAxis) previousAxis = absX >= absY ? 'horizontal' : 'vertical';
    else if (previousAxis === 'horizontal' && absY > absX * (1 + JOYSTICK_AXIS_HYSTERESIS)) previousAxis = 'vertical';
    else if (previousAxis === 'vertical' && absX > absY * (1 + JOYSTICK_AXIS_HYSTERESIS)) previousAxis = 'horizontal';
    if (previousAxis === 'horizontal') return dx >= 0 ? 'derecha' : 'izquierda';
    return dy >= 0 ? 'abajo' : 'arriba';
  }

  function move(event) {
    const rect = element.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy) / (rect.width / 2);
    if (distance < 0.22) { knob.dataset.direction = 'centro'; report(null, 'joystick'); return; }
    const direction = directionFor(dx, dy);
    knob.dataset.direction = direction;
    report(direction, 'joystick');
  }

  function release() {
    if (pointer === null) return;
    pointer = null; previousAxis = null; knob.dataset.direction = 'centro';
    if (reportedDirection) { reportedDirection = null; commands.detener('liberacion del joystick'); }
  }

  element.addEventListener('contextmenu', (event) => event.preventDefault());
  element.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pointer !== null) return;
    pointer = event.pointerId; previousAxis = null; element.setPointerCapture(pointer); move(event);
  });
  element.addEventListener('pointermove', (event) => { if (event.pointerId === pointer) move(event); });
  element.addEventListener('pointerup', release);
  element.addEventListener('pointercancel', release);
  element.addEventListener('lostpointercapture', release);

  const keyDirections = { ArrowUp: 'arriba', ArrowDown: 'abajo', ArrowLeft: 'izquierda', ArrowRight: 'derecha' };
  element.addEventListener('keydown', (event) => {
    const direction = keyDirections[event.key];
    if (!direction) return;
    event.preventDefault(); keyboardDirection = direction; report(direction, 'teclado');
  });
  element.addEventListener('keyup', (event) => {
    if (!keyDirections[event.key]) return;
    keyboardDirection = null;
    if (pointer === null && reportedDirection) { reportedDirection = null; commands.detener('teclado liberado'); }
  });
  element.addEventListener('blur', () => {
    if (reportedDirection) { reportedDirection = null; pointer = null; keyboardDirection = null; commands.detener('perdida de foco'); }
  });
  document.addEventListener('visibilitychange', () => {
    const commandSending = typeof commands.isMovementInFlight === 'function' && commands.isMovementInFlight();
    const commandActive = typeof commands.isSustainedMovementActive === 'function' && commands.isSustainedMovementActive();
    const movementExists = Boolean(pointer !== null || keyboardDirection || commandSending || commandActive);
    if (document.hidden && movementExists) {
      pointer = null; keyboardDirection = null; previousAxis = null; reportedDirection = null; knob.dataset.direction = 'centro';
      commands.detener('pestana oculta');
    }
  });
}
