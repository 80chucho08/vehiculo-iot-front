const state = { commands: [], demos: [], demoRunning: false, demoTimer: null };
const listeners = new Set();
export function getState() { return state; }
export function updateState(patch) { Object.assign(state, patch); for (const listener of listeners) listener(state); }
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
