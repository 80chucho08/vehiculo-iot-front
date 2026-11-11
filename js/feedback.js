const read = (key, fallback) => { try { const value = localStorage.getItem(key); return value === null ? fallback : value === 'true'; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, String(value)); } catch {} };
let soundEnabled = read('cabina-sonido', false);
let vibrationEnabled = read('cabina-vibracion', true);
let audio = null;
const soundButton = document.getElementById('sound-toggle');
const vibrationButton = document.getElementById('vibration-toggle');
function refresh() { soundButton.textContent = `Sonido: ${soundEnabled ? 'activo' : 'apagado'}`; soundButton.setAttribute('aria-pressed', String(soundEnabled)); vibrationButton.textContent = `Vibración: ${vibrationEnabled ? 'activa' : 'apagada'}`; vibrationButton.setAttribute('aria-pressed', String(vibrationEnabled)); }
function gestureAudio() { if (!soundEnabled) return null; try { const Context = window.AudioContext || window.webkitAudioContext; if (!Context) return null; if (!audio) audio = new Context(); if (audio.state === 'suspended') audio.resume(); return audio; } catch { return null; } }
function tone(freq = 640, duration = .065, type = 'sine', volume = .035) { const ctx = gestureAudio(); if (!ctx) return; try { const oscillator = ctx.createOscillator(), gain = ctx.createGain(); oscillator.type = type; oscillator.frequency.value = freq; gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + duration); oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(); oscillator.stop(ctx.currentTime + duration); } catch {} }
function vibrate(pattern) { try { if (vibrationEnabled && typeof navigator.vibrate === 'function') navigator.vibrate(pattern); } catch {} }
soundButton.addEventListener('click', () => { soundEnabled = !soundEnabled; write('cabina-sonido', soundEnabled); refresh(); if (soundEnabled) tone(720,.07); });
vibrationButton.addEventListener('click', () => { vibrationEnabled = !vibrationEnabled; write('cabina-vibracion', vibrationEnabled); refresh(); if (vibrationEnabled) vibrate(20); });
refresh();
document.getElementById('stop-button').addEventListener('click', () => { vibrate([60,40,60]); tone(105,.24,'sawtooth',.08); });
document.addEventListener('click', (event) => { const button = event.target.closest('.command-button'); if (button) { vibrate(20); tone(510,.05); } });
for (const id of ['joystick-grua-knob','joystick-garra-knob']) {
  const knob = document.getElementById(id); let direction = knob.dataset.direction;
  new MutationObserver(() => { if (knob.dataset.direction !== direction) { direction = knob.dataset.direction; if (direction !== 'centro') { vibrate(10); tone(770,.035,'sine',.022); } } }).observe(knob, { attributes:true, attributeFilter:['data-direction'] });
}
let eventCount = 0;
const log = document.getElementById('event-log');
new MutationObserver(() => { const count = log.children.length; if (count > eventCount) tone(880,.11,'sine',.04); eventCount = count; }).observe(log, { childList:true });
new MutationObserver((records) => { if (records.some((record) => [...record.addedNodes].some((node) => node.nodeType === 1 && node.dataset?.estado === 'error'))) tone(115,.24,'triangle',.065); }).observe(document.getElementById('action-messages'), { childList:true });
