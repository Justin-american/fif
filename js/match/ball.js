// ball.js — hand-coded ball physics: velocity, gravity, bounce, ground roll
// with rolling friction, air drag, and a Magnus-effect curve driven by spin.
// Position/velocity are full 3D (x across, y up, z along). Spin is a vertical-axis
// scalar (sidespin) that bends ground/air travel — this is what makes finesse,
// trivela and curling free kicks bend.
import { V2, clamp } from '../util/mathx.js';
import { PITCH } from './pitch.js';

const G = 9.81;
const BALL_R = 0.11;

export class Ball {
  constructor() {
    this.pos = { x: 0, y: BALL_R, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.spin = 0;          // sidespin (rad/s-ish), + curls one way, - the other
    this.owner = null;      // player currently controlling, or null when loose
    this.lastTouch = null;  // last player to touch (for restarts/own goals)
    this.radius = BALL_R;
  }

  get ground2D() { return new V2(this.pos.x, this.pos.z); }
  get speed2D() { return Math.hypot(this.vel.x, this.vel.z); }

  setFromOwnerFoot(x, z) {
    this.pos.x = x; this.pos.y = BALL_R; this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0; this.spin = 0;
  }

  // Apply a struck kick: horizontal direction (V2, unit), 2D power (m/s),
  // launch height factor (0 flat .. 1 high), and spin (sidespin).
  kick(dir2d, power2d, lift, spin) {
    this.owner = null;
    this.vel.x = dir2d.x * power2d;
    this.vel.z = dir2d.z * power2d;
    this.vel.y = lift;
    this.spin = spin;
  }

  step(dt) {
    if (this.owner) return; // carried by a dribbler; controller positions it
    const p = this.pos, v = this.vel;
    const onGround = p.y <= BALL_R + 1e-3;

    // --- Magnus curve: sideways force perpendicular to horizontal velocity. ---
    const horiz = new V2(v.x, v.z);
    const hs = horiz.len;
    if (hs > 0.5 && Math.abs(this.spin) > 1e-3) {
      const perp = horiz.perp().normalize();
      const magnus = this.spin * hs * 0.45;
      v.x += perp.x * magnus * dt;
      v.z += perp.z * magnus * dt;
    }

    // --- Gravity + air drag (only meaningful in flight). ---
    if (!onGround) {
      v.y -= G * dt;
      const drag = 0.06;
      v.x -= v.x * drag * dt;
      v.z -= v.z * drag * dt;
      v.y -= v.y * drag * dt;
    }

    // Integrate.
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // --- Ground collision + bounce. ---
    if (p.y < BALL_R) {
      p.y = BALL_R;
      if (v.y < 0) {
        const restitution = 0.55;
        v.y = -v.y * restitution;
        if (v.y < 1.2) v.y = 0; // settle
      }
    }

    // --- Rolling friction when on the ground. ---
    if (p.y <= BALL_R + 1e-3 && v.y === 0) {
      const roll = 0.86; // per-second retention
      const f = Math.pow(roll, dt * 60);
      v.x *= f; v.z *= f;
      if (Math.hypot(v.x, v.z) < 0.05) { v.x = 0; v.z = 0; }
    }

    // Spin decays over time.
    this.spin *= Math.pow(0.9, dt * 60);
    if (Math.abs(this.spin) < 1e-3) this.spin = 0;

    // Soft side/standing-wall handling is done by the match (out of play).
    // Keep height sane.
    if (p.y > 40) p.y = 40;
  }
}

export { BALL_R };
