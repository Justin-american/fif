// goalkeeper.js — keeper positioning + shot-stopping. The GK shades across the
// goal with the ball, narrows the angle, rushes loose balls in the box, dives at
// shots, and — crucially — plays the ball OUT again once he has gathered it so
// possession never stalls (this used to freeze the whole match).
import { V2, clamp } from '../util/mathx.js';
import { PITCH, defendingGoalZ, inPenaltyArea } from './pitch.js';
import { PassType } from './shots.js';

export function updateGK(gk, world, dt) {
  const goalZ = defendingGoalZ(gk.side);
  const dir = gk.side === 'home' ? 1 : -1; // toward opponent
  const ball = world.ball;
  const b2d = ball.ground2D;

  // If the keeper is holding the ball, look to distribute rather than freeze.
  if (world.ballCarrier === gk) { gkDistribute(gk, world, dt); return; }

  // Shade across the goal, biased to the ball's x, staying on/near the line.
  const targetX = clamp(b2d.x * 0.5, -PITCH.goalWidth * 0.6, PITCH.goalWidth * 0.6);
  let targetZ = goalZ + dir * 1.2;

  // Advance to narrow the angle when the ball is close and central.
  const distBall = V2.dist(gk.pos, b2d);
  const ballInBox = inPenaltyArea(b2d, goalZ);
  // Don't chase a ball the keeper has only just released (a distribution): without
  // this guard he re-collects his own kick on the very next tick and the ball can
  // never leave the box (goal kicks / clearances appeared to "reset" forever).
  const justKicked = gk.kickCooldown > 0 && ball.lastTouch === gk;
  if (ballInBox && !justKicked && (!world.ballCarrier || world.ballCarrier.side !== gk.side)) {
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

// Keeper has the ball: hold briefly (settle), then roll/throw it out to a free
// team-mate up the pitch. Without this the GK would carry the ball forever and
// the whole game would appear to "freeze".
function gkDistribute(gk, world, dt) {
  const dir = gk.side === 'home' ? 1 : -1;
  // Stay put while holding the ball at feet.
  gk.driveTo(new V2(0, 0), dt, false);
  world.carryBall(gk, dt);

  if (world._gkHold > 0 || gk.kickCooldown > 0) return; // brief pause before releasing

  // Pick the best outfield team-mate: prefer someone up the pitch, in space.
  const mates = world.players.filter((q) => q.side === gk.side && q !== gk && !q.sentOff && !q.isGK);
  let best = null, bestScore = -Infinity;
  for (const m of mates) {
    const ahead = (m.pos.z - gk.pos.z) * dir;          // up the pitch is good
    const dist = V2.dist(gk.pos, m.pos);
    if (dist < 6 || dist > 55) continue;
    // Penalise team-mates closely marked by an opponent.
    let pressure = 99;
    for (const o of world.players) {
      if (o.side === gk.side || o.sentOff) continue;
      pressure = Math.min(pressure, V2.dist(o.pos, m.pos));
    }
    const score = ahead * 1.2 - dist * 0.15 + clamp(pressure, 0, 8) * 1.5;
    if (score > bestScore) { bestScore = score; best = { player: m, dist }; }
  }

  if (best) {
    const aim = V2.dir(gk.pos, best.player.pos);
    const type = best.dist > 26 ? PassType.Lofted : PassType.Driven;
    world.doPass(gk, type, aim, clamp(best.dist / 40, 0.35, 1), best.player);
  } else {
    // No good option: clear it long up the middle.
    const aim = new V2(0, dir).normalize();
    world.doPass(gk, PassType.Lofted, aim, 1, null);
  }
}

// Called by the match when a shot crosses the keeper plane. Returns true if saved.
export function tryShotStop(gk, world, crossX, crossY) {
  const a = gk.profile;
  // Reach: how far the keeper can plausibly get to. Slightly tighter than before
  // so well-placed shots beat him.
  const reach = 2.2 + (a.diving || a.physical) / 100 * 1.5;
  const dx = Math.abs(crossX - gk.pos.x);
  const dy = clamp(crossY, 0, PITCH.goalHeight);
  const dist = Math.hypot(dx, dy * 0.7);
  if (dist > reach) return false; // beat him
  // Save chance falls off with distance and rises with keeper skill. Lowered base
  // and steeper falloff so the keeper no longer stops ~everything.
  const skill = (a.physical * 0.5 + (a.composure || 60) * 0.5) / 100;
  const chance = clamp(0.72 - dist / reach * 0.62 + skill * 0.18, 0.04, 0.9);
  return world.rng() < chance;
}
