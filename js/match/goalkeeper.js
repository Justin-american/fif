// goalkeeper.js — keeper positioning + shot-stopping. The GK shades across the
// goal with the ball, narrows the angle, rushes loose balls in the box, and
// dives at shots with a save chance driven by attributes vs shot quality.
import { V2, clamp } from '../util/mathx.js';
import { PITCH, defendingGoalZ, inPenaltyArea } from './pitch.js';

export function updateGK(gk, world, dt) {
  const goalZ = defendingGoalZ(gk.side);
  const dir = gk.side === 'home' ? 1 : -1; // toward opponent
  const ball = world.ball;
  const b2d = ball.ground2D;

  // Shade across the goal, biased to the ball's x, staying on/near the line.
  const targetX = clamp(b2d.x * 0.5, -PITCH.goalWidth * 0.6, PITCH.goalWidth * 0.6);
  let targetZ = goalZ + dir * 1.2;

  // Advance to narrow the angle when the ball is close and central.
  const distBall = V2.dist(gk.pos, b2d);
  const ballInBox = inPenaltyArea(b2d, goalZ);
  if (ballInBox && (!world.ballCarrier || world.ballCarrier.side !== gk.side)) {
    targetZ = goalZ + dir * clamp(4 + (PITCH.penaltyAreaDepth - Math.abs(b2d.z - goalZ)) * 0.2, 1, 7);
    // Rush a loose ball in the box.
    if (world.ballLoose && distBall < 6) {
      const desired = V2.dir(gk.pos, b2d).scale(gk.effectiveTopSpeed(true));
      gk.driveTo(desired, dt, true);
      if (distBall < 1.0) world.gkCollect(gk);
      return;
    }
  }

  const target = new V2(targetX, targetZ);
  const desired = V2.dir(gk.pos, target).scale(gk.effectiveTopSpeed(distBall > 8));
  const d = V2.dist(gk.pos, target);
  if (d < 0.6) desired.scale(d / 0.6);
  gk.driveTo(desired, dt, d > 6);
}

// Called by the match when a shot crosses the keeper plane. Returns true if saved.
export function tryShotStop(gk, world, crossX, crossY) {
  const a = gk.profile;
  // Reach: how far the keeper can plausibly get to.
  const reach = 2.6 + (a.diving || a.physical) / 100 * 1.6;
  const dx = Math.abs(crossX - gk.pos.x);
  const dy = clamp(crossY, 0, PITCH.goalHeight);
  const dist = Math.hypot(dx, dy * 0.7);
  if (dist > reach) return false; // beat him
  // Save chance falls off with distance and rises with keeper skill.
  const skill = (a.physical * 0.5 + (a.composure || 60) * 0.5) / 100;
  const chance = clamp(0.95 - dist / reach * 0.8 + skill * 0.2, 0.05, 0.97);
  return world.rng() < chance;
}
