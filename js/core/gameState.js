// gameState.js — persistent state carried between screens + settings storage.
// Replaces Unity's GameManager singleton (carried teams/mode) and the
// PlayerPrefs-backed GameSettings with a localStorage-backed equivalent.

export const GameMode = {
  FullMatch: 'FullMatch',
  PracticeAttack: 'PracticeAttack',
  PracticePenalty: 'PracticePenalty',
  PracticeFreeKick: 'PracticeFreeKick',
};

export const Difficulty = ['Beginner', 'SemiPro', 'Pro', 'Legendary'];
export const PassAssistance = ['Assisted', 'Semi', 'Manual'];
export const CameraStyle = ['Broadcast', 'Tele', 'Far'];

const STORAGE_KEY = 'fif.settings.v1';

// Default key bindings (KeyboardEvent.code values). Movement, shots and passing
// are all rebindable from Settings → Controls. Arrow keys always work for
// movement as a fixed secondary mapping.
export const DEFAULT_KEYBINDS = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  sprint: 'ShiftLeft',
  shoot: 'Space',
  finesse: 'KeyC',
  trivela: 'KeyV',
  chip: 'KeyB',
  pass: 'KeyJ',
  throughBall: 'KeyK',
  cross: 'KeyL',
  triggerRun: 'KeyE',
  switchPlayer: 'KeyQ',
  tackle: 'KeyJ',
};

const DEFAULTS = {
  matchLengthMinutes: 5,
  difficulty: 'SemiPro',
  passAssistance: 'Assisted',
  masterVolume: 1.0,
  sfxVolume: 1.0,
  musicVolume: 0.7,
  cameraStyle: 'Broadcast',
  keybinds: { ...DEFAULT_KEYBINDS },
};

export function loadSettings() {
  let s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      s = { ...s, ...parsed };
      // Always re-merge keybinds so newly added actions get a default.
      s.keybinds = { ...DEFAULT_KEYBINDS, ...(parsed.keybinds || {}) };
    }
  } catch (e) {
    /* localStorage unavailable (private mode) — use defaults */
  }
  return s;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    /* ignore persistence failures */
  }
}

// Difficulty → opponent skill (mirrors MatchConfig.FromSettings).
export function opponentSkill(difficulty) {
  switch (difficulty) {
    case 'Beginner': return 0.35;
    case 'Pro': return 0.7;
    case 'Legendary': return 0.9;
    default: return 0.5;
  }
}

// The single mutable game state shared across screens.
export const state = {
  settings: loadSettings(),
  mode: GameMode.FullMatch,
  userTeam: null,
  opponentTeam: null,
};
