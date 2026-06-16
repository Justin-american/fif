// mathx.js — hand-written vector math + small numeric helpers.
// All gameplay math (ball physics, steering, Magnus curve) is built on these,
// independent of Three.js so the simulation stays testable and lightweight.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const deg2rad = (d) => (d * Math.PI) / 180;
export const rad2deg = (r) => (r * 180) / Math.PI;
export const randRange = (rng, lo, hi) => lo + (hi - lo) * rng();
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);

// A small, seedable PRNG (mulberry32) so set-piece variety can be deterministic.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D ground-plane vector (x = across pitch, z = along pitch length).
export class V2 {
  constructor(x = 0, z = 0) {
    this.x = x;
    this.z = z;
  }
  set(x, z) { this.x = x; this.z = z; return this; }
  copy(o) { this.x = o.x; this.z = o.z; return this; }
  clone() { return new V2(this.x, this.z); }
  add(o) { this.x += o.x; this.z += o.z; return this; }
  sub(o) { this.x -= o.x; this.z -= o.z; return this; }
  scale(s) { this.x *= s; this.z *= s; return this; }
  addScaled(o, s) { this.x += o.x * s; this.z += o.z * s; return this; }
  dot(o) { return this.x * o.x + this.z * o.z; }
  get len() { return Math.hypot(this.x, this.z); }
  get lenSq() { return this.x * this.x + this.z * this.z; }
  normalize() {
    const l = this.len;
    if (l > 1e-6) { this.x /= l; this.z /= l; }
    return this;
  }
  // Perpendicular (rotate +90° on ground plane). Used for Magnus side force.
  perp() { return new V2(-this.z, this.x); }
  static sub(a, b) { return new V2(a.x - b.x, a.z - b.z); }
  static add(a, b) { return new V2(a.x + b.x, a.z + b.z); }
  static dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
  static distSq(a, b) { const dx = a.x - b.x, dz = a.z - b.z; return dx * dx + dz * dz; }
  static dir(from, to) { return V2.sub(to, from).normalize(); }
  static lerp(a, b, t) { return new V2(lerp(a.x, b.x, t), lerp(a.z, b.z, t)); }
}

export function moveToward(cur, target, maxDelta) {
  const d = target - cur;
  if (Math.abs(d) <= maxDelta) return target;
  return cur + Math.sign(d) * maxDelta;
}

// Steer a V2 velocity toward a desired velocity with a max acceleration.
export function steer(vel, desired, maxAccel, dt) {
  const dvx = desired.x - vel.x;
  const dvz = desired.z - vel.z;
  const dl = Math.hypot(dvx, dvz);
  const m = maxAccel * dt;
  if (dl <= m || dl < 1e-6) { vel.x = desired.x; vel.z = desired.z; return vel; }
  vel.x += (dvx / dl) * m;
  vel.z += (dvz / dl) * m;
  return vel;
}
