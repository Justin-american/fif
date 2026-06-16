// pitch.js — pitch dimensions + helpers (ported from Unity Pitch.cs).
// Coordinate system on the ground plane: x across the pitch (-halfWidth..+halfWidth),
// z along the length (-halfLength..+halfLength). +y is up (height of the ball).
// Home defends -z and attacks +z; Away is the mirror.
import { V2 } from '../util/mathx.js';

export const PITCH = {
  length: 105,
  width: 68,
  goalWidth: 9.0,
  goalHeight: 2.8,
  penaltyAreaDepth: 16.5,
  penaltyAreaHalfWidth: 20.16,
  goalAreaDepth: 5.5,
  centreCircleR: 9.15,
  get halfLength() { return this.length / 2; },
  get halfWidth() { return this.width / 2; },
};

// Side: 'home' attacks +z, 'away' attacks -z.
export function attackZ(side) { return side === 'home' ? 1 : -1; }
export function attackingGoalZ(side) {
  return side === 'home' ? PITCH.halfLength : -PITCH.halfLength;
}
export function defendingGoalZ(side) {
  return side === 'home' ? -PITCH.halfLength : PITCH.halfLength;
}
export function attackingGoalCentre(side) {
  return new V2(0, attackingGoalZ(side));
}
export function defendingGoalCentre(side) {
  return new V2(0, defendingGoalZ(side));
}
export function attackingPenaltySpot(side) {
  const gl = attackingGoalZ(side);
  const dir = side === 'home' ? -1 : 1;
  return new V2(0, gl + dir * 11);
}

// Map a normalized formation slot (x 0..1 left→right, y 0..1 own→opp goal) to metres.
export function fromFormation(slot, side) {
  const px = (slot.x - 0.5) * PITCH.width;
  const own = defendingGoalZ(side);
  const opp = attackingGoalZ(side);
  const pz = own + (opp - own) * slot.y;
  return new V2(px, pz);
}

export function inBounds(p) {
  return p.x >= -PITCH.halfWidth && p.x <= PITCH.halfWidth &&
         p.z >= -PITCH.halfLength && p.z <= PITCH.halfLength;
}

export function inPenaltyArea(p, goalLineZ) {
  if (Math.abs(p.x) > PITCH.penaltyAreaHalfWidth) return false;
  const sameHalf = (goalLineZ < 0 && p.z >= goalLineZ) || (goalLineZ > 0 && p.z <= goalLineZ);
  return sameHalf && Math.abs(p.z - goalLineZ) <= PITCH.penaltyAreaDepth;
}

export function clampToPitch(p) {
  p.x = Math.max(-PITCH.halfWidth, Math.min(PITCH.halfWidth, p.x));
  p.z = Math.max(-PITCH.halfLength, Math.min(PITCH.halfLength, p.z));
  return p;
}
