const read = (key, fallback) => {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : value === 'true';
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
};

let soundEnabled = read('cabina-sonido', false);
let vibrationEnabled = read('cabina-vibracion', true);
let audio = null;

const soundButton = document.getElementById('sound-toggle');
const vibrationButton = document.getElementById('vibration-toggle');

function refresh() {
  if (soundButton) {
    soundButton.textContent = `Sonido: ${soundEnabled ? 'activo' : 'apagado'}`;
    soundButton.setAttribute('aria-pressed', String(soundEnabled));
  }
  if (vibrationButton) {
    vibrationButton.textContent = `Vibración: ${vibrationEnabled ? 'activa' : 'apagada'}`;
    vibrationButton.setAttribute('aria-pressed', String(vibrationEnabled));
  }
}

const UNLOCK_EVENTS = ['pointerup', 'click', 'touchend', 'keyup'];

function registerUnlock() {
  removeUnlock();
  for (const event of UNLOCK_EVENTS) {
    document.addEventListener(event, handleUnlock, { once: true });
  }
}

function removeUnlock() {
  for (const event of UNLOCK_EVENTS) {
    document.removeEventListener(event, handleUnlock);
  }
}

function initAudio() {
  if (!soundEnabled) return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!audio) {
      audio = new Context();
    }
    if (audio.state === 'suspended') {
      audio.resume().catch(() => {});
    }
  } catch {}
}

function handleUnlock() {
  removeUnlock();
  if (soundEnabled) {
    initAudio();
  }
}

function tone(freq = 640, duration = 0.065, type = 'sine', volume = 0.035) {
  if (!soundEnabled || !audio || audio.state !== 'running') return;
  try {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    gain.gain.setValueAtTime(volume, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + duration);
  } catch {}
}

function vibrate(pattern) {
  if (
    !vibrationEnabled ||
    typeof navigator === 'undefined' ||
    typeof navigator.vibrate !== 'function' ||
    navigator.userActivation?.hasBeenActive !== true
  ) {
    return;
  }
  try {
    navigator.vibrate(pattern);
  } catch {}
}

if (soundButton) {
  soundButton.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    write('cabina-sonido', soundEnabled);
    refresh();
    if (soundEnabled) {
      initAudio();
      if (!audio || audio.state !== 'running') {
        registerUnlock();
      }
      if (audio?.state === 'running') {
        tone(720, 0.07);
      } else if (audio?.state === 'suspended') {
        audio.resume().then(() => {
          if (soundEnabled && audio?.state === 'running') {
            tone(720, 0.07);
          }
        }).catch(() => {});
      }
    } else {
      removeUnlock();
    }
  });
}

if (vibrationButton) {
  vibrationButton.addEventListener('click', () => {
    vibrationEnabled = !vibrationEnabled;
    write('cabina-vibracion', vibrationEnabled);
    refresh();
    if (vibrationEnabled) vibrate(20);
  });
}

refresh();
registerUnlock();

const stopButton = document.getElementById('stop-button');
if (stopButton) {
  stopButton.addEventListener('click', () => {
    vibrate([60, 40, 60]);
    tone(105, 0.24, 'sawtooth', 0.08);
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('.command-button');
  if (button) {
    vibrate(20);
    tone(510, 0.05);
  }
});

for (const id of ['joystick-grua-knob', 'joystick-garra-knob']) {
  const knob = document.getElementById(id);
  if (!knob) continue;
  let previousDirection = knob.dataset.direction || 'centro';
  const observer = new MutationObserver(() => {
    const nextDirection = knob.dataset.direction;
    if (!nextDirection || nextDirection === 'centro' || nextDirection === previousDirection) {
      previousDirection = nextDirection || 'centro';
      return;
    }
    previousDirection = nextDirection;
    vibrate(10);
    tone(770, 0.035, 'sine', 0.022);
  });
  observer.observe(knob, { attributes: true, attributeFilter: ['data-direction'] });
}

let eventCount = 0;
const log = document.getElementById('event-log');
if (log) {
  new MutationObserver(() => {
    const count = log.children.length;
    if (count > eventCount) tone(880, 0.11, 'sine', 0.04);
    eventCount = count;
  }).observe(log, { childList: true });
}

const actionMessages = document.getElementById('action-messages');
if (actionMessages) {
  new MutationObserver((records) => {
    if (records.some((record) => [...record.addedNodes].some((node) => node.nodeType === 1 && node.dataset?.estado === 'error'))) {
      tone(115, 0.24, 'triangle', 0.065);
    }
  }).observe(actionMessages, { childList: true });
}
