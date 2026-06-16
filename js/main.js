// main.js — application entry point. Wires the procedural audio and the UI flow,
// always starting on the Main Menu (never straight into a match).
import { state } from './core/gameState.js';
import { initAudio } from './core/audio.js';
import { UI } from './ui/ui.js';

function boot() {
  const menuRoot = document.getElementById('menu');
  const sceneHost = document.getElementById('scene');
  const hudHost = document.getElementById('hud');

  initAudio(state.settings);

  const ui = new UI(menuRoot, sceneHost, hudHost);
  ui.showMainMenu();

  // Expose for debugging in the console.
  window.__fif = { state, ui };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
