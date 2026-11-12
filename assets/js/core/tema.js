// Tema de color y efectos visuales, compartido por todas las páginas.
// El tema guardado se aplica siempre; los controles de ajustes solo se conectan si existen en la página.
const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const get = (key, fallback) => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } };
const put = (key, value) => { try { localStorage.setItem(key, value); } catch {} };

const TEMAS = ['hielo', 'ambar', 'esmeralda'];
const TEMA_POR_DEFECTO = 'hielo';
const savedTheme = get('cabina-tema', TEMA_POR_DEFECTO);
root.dataset.tema = TEMAS.includes(savedTheme) ? savedTheme : TEMA_POR_DEFECTO;

const theme = byId('theme-select');
if (theme) {
  theme.value = root.dataset.tema;
  theme.addEventListener('change', () => { root.dataset.tema = theme.value; put('cabina-tema', theme.value); });
}

let reduced = get('cabina-efectos-reducidos', 'false') === 'true';
const effects = byId('effects-toggle');
const applyEffects = () => {
  root.dataset.efectos = reduced ? 'reducidos' : 'normales';
  if (!effects) return;
  effects.textContent = reduced ? 'Efectos reducidos' : 'Efectos normales';
  effects.setAttribute('aria-pressed', String(reduced));
};
applyEffects();
effects?.addEventListener('click', () => { reduced = !reduced; put('cabina-efectos-reducidos', String(reduced)); applyEffects(); });
