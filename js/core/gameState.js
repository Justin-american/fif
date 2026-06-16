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

const DEFAULTS = {
  matchLengthMinutes: 5,
  difficulty: 'SemiPro',
  passAssistance: 'Assisted',
  masterVolume: 1.0,
  sfxVolume: 1.0,
  musicVolume: 0.7,
  cameraStyle: 'Broadcast',
};

export function loadSettings() {
  let s = { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) s = { ...s, ...JSON.parse(raw) };
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
