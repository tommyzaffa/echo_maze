// Gestione tastiera: mappa action -> elenco di KeyboardEvent.code.
// Espone isDown(action) e isPressed(action) (edge: solo nel tick in cui il
// tasto è appena passato da rilasciato a premuto).
//
// Architettura pensata per supportare in futuro il rebinding (basta riscrivere
// ACTIONS).

export const DEFAULT_ACTIONS = {
  left:  ['ArrowLeft'],
  right: ['ArrowRight'],
  up:    ['ArrowUp'],
  down:  ['ArrowDown'],
  crouch: ['ArrowDown'],
  jump:  ['ArrowUp'],
  attack: ['KeyS'],
  ranged: ['KeyA'],
  super: ['Space'],
  dash: ['KeyD'],
  shield: ['KeyX'],
  stop: ['KeyZ'],
  interact: ['KeyC'],
  map: ['ShiftLeft', 'ShiftRight'],
  newRun: ['KeyN'],
  slot1: ['Digit1'],
  slot2: ['Digit2'],
  slot3: ['Digit3'],
  slot4: ['Digit4'],
  slot5: ['Digit5'],
  pause: ['Escape'],
};

export const ACTION_ORDER = [
  'left',
  'right',
  'down',
  'jump',
  'attack',
  'ranged',
  'super',
  'dash',
  'shield',
  'stop',
  'interact',
  'map',
  'newRun',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'pause',
];

const STORAGE_KEY = 'echoMaze.controls.v1';
let ACTIONS = loadBindings();
let PREVENT_DEFAULT = new Set(Object.values(ACTIONS).flat());

const down = new Set();
const pressed = new Set();   // resettato a fine tick logico

function cloneActions(actions) {
  return Object.fromEntries(
    Object.entries(actions).map(([action, codes]) => [action, [...codes]]),
  );
}

function loadBindings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneActions(DEFAULT_ACTIONS);
    const saved = JSON.parse(raw);
    const merged = cloneActions(DEFAULT_ACTIONS);
    for (const action of Object.keys(merged)) {
      if (Array.isArray(saved[action]) && saved[action].length > 0) {
        merged[action] = saved[action].filter((code) => typeof code === 'string');
      }
    }
    merged.up = [...(merged.jump ?? DEFAULT_ACTIONS.jump)];
    merged.crouch = [...(merged.down ?? DEFAULT_ACTIONS.down)];
    merged.pause = [...DEFAULT_ACTIONS.pause];
    return merged;
  } catch {
    return cloneActions(DEFAULT_ACTIONS);
  }
}

function persistBindings() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ACTIONS));
  } catch {
    // Local storage can be unavailable in restricted browser modes.
  }
}

function refreshPreventDefault() {
  PREVENT_DEFAULT = new Set(Object.values(ACTIONS).flat());
}

window.addEventListener('keydown', (e) => {
  if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (!down.has(e.code)) pressed.add(e.code);
  down.add(e.code);
});

window.addEventListener('keyup', (e) => {
  if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
  down.delete(e.code);
});

// Reset quando la finestra perde il focus (evita "stuck keys").
window.addEventListener('blur', () => {
  down.clear();
  pressed.clear();
});

export function getActionBindings() {
  return cloneActions(ACTIONS);
}

export function getActionCodes(action) {
  return [...(ACTIONS[action] ?? [])];
}

export function setActionBinding(action, code) {
  if (!ACTIONS[action] || !code) return;
  if (action === 'pause') return;
  ACTIONS[action] = [code];
  if (action === 'jump' || action === 'up') {
    ACTIONS.jump = [code];
    ACTIONS.up = [code];
  }
  if (action === 'down') ACTIONS.crouch = [code];
  if (action === 'crouch') ACTIONS.down = [code];
  refreshPreventDefault();
  persistBindings();
}

export function resetActionBindings() {
  ACTIONS = cloneActions(DEFAULT_ACTIONS);
  refreshPreventDefault();
  persistBindings();
  down.clear();
  pressed.clear();
}

export function actionMatchesCode(action, code) {
  return ACTIONS[action]?.includes(code) ?? false;
}

export function codeLabel(code) {
  const labels = {
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Space: 'Space',
    Escape: 'Esc',
    Enter: 'Enter',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
  };
  if (labels[code]) return labels[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

export function isDown(action) {
  const codes = ACTIONS[action];
  if (!codes) return false;
  for (const c of codes) if (down.has(c)) return true;
  return false;
}

export function isPressed(action) {
  const codes = ACTIONS[action];
  if (!codes) return false;
  for (const c of codes) if (pressed.has(c)) return true;
  return false;
}

// Da chiamare al termine di ogni tick logico.
export function endTick() {
  pressed.clear();
}
