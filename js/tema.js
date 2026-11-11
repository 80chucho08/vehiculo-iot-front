const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const get = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const put = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
const theme = byId('theme-select');
const savedTheme = get('cabina-tema', 'ambar');
root.dataset.tema = ['ambar', 'cian', 'neon'].includes(savedTheme) ? savedTheme : 'ambar';
theme.value = root.dataset.tema;
theme.addEventListener('change', () => { root.dataset.tema = theme.value; put('cabina-tema', theme.value); });
const effects = byId('effects-toggle');
let reduced = get('cabina-efectos-reducidos', 'false') === 'true';
const applyEffects = () => { root.dataset.efectos = reduced ? 'reducidos' : 'normales'; effects.textContent = reduced ? 'Efectos reducidos' : 'Efectos normales'; effects.setAttribute('aria-pressed', String(reduced)); };
applyEffects(); effects.addEventListener('click', () => { reduced = !reduced; put('cabina-efectos-reducidos', String(reduced)); applyEffects(); });
let sound = get('cabina-sonido', 'false') === 'true';
const soundButton = byId('sound-toggle');
const applySound = () => { soundButton.textContent = `Sonido: ${sound ? 'activado' : 'apagado'}`; soundButton.setAttribute('aria-pressed', String(sound)); };
applySound(); soundButton.addEventListener('click', () => { sound = !sound; put('cabina-sonido', String(sound)); applySound(); });
const vibration = byId('vibration-toggle');
let vibrationOn = get('cabina-vibracion', 'true') === 'true';
const applyVibration = () => { vibration.textContent = `Vibración: ${vibrationOn ? 'activa' : 'inactiva'}`; vibration.setAttribute('aria-pressed', String(vibrationOn)); };
applyVibration(); vibration.addEventListener('click', () => { vibrationOn = !vibrationOn; put('cabina-vibracion', String(vibrationOn)); applyVibration(); });
byId('fullscreen-toggle').addEventListener('click', async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch {} });

const dialogs = ['settings-sheet', 'events-sheet', 'demo-sheet'].map(byId);
function showDialog(dialog, opener) { dialog._opener = opener; if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); }
for (const dialog of dialogs) {
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => dialog._opener?.focus());
}
byId('settings-open').addEventListener('click', (event) => showDialog(byId('settings-sheet'), event.currentTarget));
byId('events-open').addEventListener('click', (event) => showDialog(byId('events-sheet'), event.currentTarget));
document.querySelector('[data-close="settings-sheet"]').addEventListener('click', () => byId('settings-sheet').close());
document.querySelector('[data-close="events-sheet"]').addEventListener('click', () => byId('events-sheet').close());
const events = byId('event-log'); const mobileEvents = byId('event-log-mobile');
new MutationObserver(() => { mobileEvents.replaceChildren(...[...events.children].map((item) => item.cloneNode(true))); }).observe(events, { childList: true });

const wsInfo = byId('ws-info'); const wsPopover = byId('ws-popover');
wsInfo.addEventListener('click', () => { const open = wsPopover.hidden; wsPopover.hidden = !open; wsInfo.setAttribute('aria-expanded', String(open)); if (open) wsPopover.querySelector('p').setAttribute('tabindex', '-1'), wsPopover.querySelector('p').focus(); });
document.addEventListener('pointerdown', (event) => { if (!wsPopover.hidden && !wsPopover.contains(event.target) && event.target !== wsInfo) { wsPopover.hidden = true; wsInfo.setAttribute('aria-expanded', 'false'); } });
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !wsPopover.hidden) { wsPopover.hidden = true; wsInfo.setAttribute('aria-expanded', 'false'); wsInfo.focus(); } });

const sheet = byId('demo-sheet'); const primarySelect = byId('demo-select'); const secondarySelect = byId('demo-select-sheet');
const copyOptions = (from, to) => { const selected = from.value; to.replaceChildren(...[...from.options].map((option) => { const clone = document.createElement('option'); clone.value = option.value; clone.textContent = option.textContent; clone.disabled = option.disabled; return clone; })); to.value = selected; };
byId('demo-open').addEventListener('click', (event) => { if (event.currentTarget.classList.contains('demo-running')) { byId('demo-cancel').click(); return; } copyOptions(primarySelect, secondarySelect); showDialog(sheet, event.currentTarget); });
byId('demo-close').addEventListener('click', () => sheet.close());
secondarySelect.addEventListener('change', () => { primarySelect.value = secondarySelect.value; primarySelect.dispatchEvent(new Event('change', { bubbles: true })); });
byId('demo-sheet-start').addEventListener('click', () => { primarySelect.value = secondarySelect.value; primarySelect.dispatchEvent(new Event('change', { bubbles: true })); byId('demo-start').click(); sheet.close(); });
byId('demo-sheet-cancel').addEventListener('click', () => { byId('demo-cancel').click(); sheet.close(); });
new MutationObserver(() => copyOptions(primarySelect, secondarySelect)).observe(primarySelect, { childList: true });

const hint = byId('rotate-hint');
if (get('cabina-rotate-hint', '') !== 'oculto' && matchMedia('(max-width: 700px) and (orientation: landscape)').matches) { hint.hidden = false; setTimeout(() => { hint.hidden = true; }, 6000); }
