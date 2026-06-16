// input.js — keyboard (and basic gamepad) state with edge detection.
// The match layer interprets these against game context (attack vs defend).
// Key bindings are user-configurable (Settings → Controls); arrow keys always
// work for movement as a fixed secondary mapping.
import { DEFAULT_KEYBINDS } from '../core/gameState.js';

export class Input {
  constructor(keybinds) {
    this.kb = keybinds || { ...DEFAULT_KEYBINDS };
    this.down = new Set();
    this.pressed = new Set();   // edge: became down this frame
    this.released = new Set();  // edge: became up this frame
    this._pendingDown = new Set();
    this._pendingUp = new Set();
    this.holdTime = {};         // code -> seconds held

    window.addEventListener('keydown', (e) => {
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this._pendingDown.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this._pendingUp.add(e.code);
    });
    window.addEventListener('blur', () => { this.down.clear(); });
  }

  _isGameKey(code) {
    // Built from the current bindings plus the fixed arrow keys. Rebuilt each
    // call so runtime rebinds take effect immediately.
    if (code.startsWith('Arrow')) return true;
    return Object.values(this.kb).includes(code);
  }

  beginFrame(dt) {
    this.pressed.clear();
    this.released.clear();
    for (const c of this._pendingDown) {
      if (!this.down.has(c)) { this.down.add(c); this.pressed.add(c); this.holdTime[c] = 0; }
    }
    for (const c of this._pendingUp) {
      if (this.down.has(c)) { this.down.delete(c); this.released.add(c); }
    }
    this._pendingDown.clear();
    this._pendingUp.clear();
    for (const c of this.down) this.holdTime[c] = (this.holdTime[c] || 0) + dt;
  }

  isDown(c) { return this.down.has(c); }
  justPressed(c) { return this.pressed.has(c); }
  justReleased(c) { return this.released.has(c); }
  held(c) { return this.holdTime[c] || 0; }

  // Movement vector in screen/camera space: x = right, z = forward (toward the
  // far side of the pitch). The match converts this to world space using the
  // current camera orientation so controls feel correct from any camera angle.
  // Reads the bound movement keys plus arrows and the gamepad left stick.
  moveAxis() {
    const kb = this.kb;
    let x = 0, z = 0;
    if (this.isDown(kb.moveLeft) || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown(kb.moveRight) || this.isDown('ArrowRight')) x += 1;
    if (this.isDown(kb.moveUp) || this.isDown('ArrowUp')) z += 1;
    if (this.isDown(kb.moveDown) || this.isDown('ArrowDown')) z -= 1;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (gp) {
      const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
      if (Math.abs(gx) > 0.2) x += gx;
      if (Math.abs(gy) > 0.2) z -= gy;
    }
    return { x, z };
  }

  sprint() {
    const c = this.kb.sprint;
    if (this.isDown(c)) return true;
    // If bound to a Shift key, accept either physical Shift for convenience.
    if (c === 'ShiftLeft' || c === 'ShiftRight') return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
    return false;
  }
}
