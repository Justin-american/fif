// input.js — keyboard (and basic gamepad) state with edge detection.
// The match layer interprets these against game context (attack vs defend).
export class Input {
  constructor() {
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
    return [
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK', 'KeyL', 'KeyE', 'KeyQ',
      'ShiftLeft', 'ShiftRight', 'KeyC', 'KeyV', 'KeyB',
    ].includes(code);
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

  // Movement vector from WASD/Arrows, plus gamepad left stick if present.
  moveAxis() {
    let x = 0, z = 0;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) z += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) z -= 1;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[0];
    if (gp) {
      const gx = gp.axes[0] || 0, gy = gp.axes[1] || 0;
      if (Math.abs(gx) > 0.2) x += gx;
      if (Math.abs(gy) > 0.2) z -= gy;
    }
    return { x, z };
  }

  sprint() { return this.isDown('ShiftLeft') || this.isDown('ShiftRight'); }
}
