// ai.js — all non-user player behaviour: attacking on the ball, off-ball runs,
// and defending (jockey / contain / mark / intercept / tackle). Play styles
// bias decisions so two players in the same slot behave differently.
import { V2, clamp } from '../util/mathx.js';
import { PlayStyle, groupOf } from '../data/formations.js';
import { PITCH, attackingGoalCentre, defendingGoalCentre, inPenaltyArea, defendingGoalZ } from './pitch.js';
import { ShotType, PassType } from './shots.js';

// ---- shared helpers ----------------------------------------------------------
function teammates(world, p) { return world.players.filter((q) => q.side === p.side && q !== p && !q.sentOff); }
function opponents(world, p) { return world.players.filter((q) => q.side !== p.side && !q.sentOff); }
function nearest(list, point) {
  let best = null, bd = Infinity;
  for (const q of list) { const d = V2.distSq(q.pos, point); if (d < bd) { bd = d; best = q; } }
  return best;
}
function attackZ(side) { return side === 'home' ? 1 : -1; }

// ---- top-level dispatch ------------------------------------------------------
export function updateAI(p, world, dt) {
  if (p.isGK) return; // goalkeeper handled separately
  if (p === world.userPlayer) return;

  const hasBall = world.ballCarrier === p;
  const teamHasBall = world.possessionSide === p.side;

  // A genuinely loose ball (nobody carrying it): the closest couple of players
  // from BOTH sides should sprint to win it rather than standing in shape.
  if (!world.ballCarrier && world.ballLoose) {
    if (chaseLooseBall(p, world, dt)) return;
  }

  if (hasBall) onBallAI(p, world, dt);
  else if (teamHasBall) offBallAttackAI(p, world, dt);
  else defendAI(p, world, dt);
}

// Returns true (and drives the player) if this player is one of the nearest of
// his side to a loose ball and close enough to realistically contest it. This
// makes both teams fight for 50/50s instead of leaving it to a single defender.
function chaseLooseBall(p, world, dt) {
  const ball2d = world.ball.ground2D;
  // The player the user just passed to always chases onto the ball.
  const isReceiver = world._userPassReceiver === p || world._intendedReceiver === p;
  // Rank own-side outfield players by distance to the ball.
  const mine = world.players
    .filter((q) => q.side === p.side && !q.isGK && !q.sentOff)
    .map((q) => ({ q, d: V2.dist(q.pos, ball2d) }))
    .sort((a, b) => a.d - b.d);
  const myDist = V2.dist(p.pos, ball2d);
  const rank = mine.findIndex((e) => e.q === p);
  // Only the two closest of each side commit; and only when it's actually
  // reachable (otherwise hold shape). The very closest will commit from further.
  const reach = (rank === 0 || isReceiver) ? 40 : 14;
  if (!isReceiver && (rank > 1 || myDist > reach)) return false;
  // High balls can't be controlled on the floor — don't sprint under them.
  if (world.ball.pos.y > 2.4 && !isReceiver) return false;
  const aim = ballPredict(world, p);
  const desired = V2.dir(p.pos, aim).scale(p.effectiveTopSpeed(true));
  p.driveTo(desired, dt, true);
  return true;
}

// ---- on the ball -------------------------------------------------------------
function onBallAI(p, world, dt) {
  const a = p.profile;
  const dir = attackZ(p.side);
  const goal = attackingGoalCentre(p.side);
  const distGoal = V2.dist(p.pos, goal);
  const opp = opponents(world, p);
  const marker = nearest(opp, p.pos);
  const pressure = marker ? V2.dist(marker.pos, p.pos) : 99;
  const skill = world.opponentSkill;

  // Shoot if in range and reasonable angle.
  const inRange = distGoal < 26 + skill * 6;
  const shootBias = a.shooting / 100;
  if (inRange && p.kickCooldown <= 0 && (pressure < 3.5 || distGoal < 14)) {
    let type = ShotType.LowDriven;
    if (p.style === PlayStyle.FinesseSpecialist || (p.style === PlayStyle.InsideForward && distGoal > 14)) type = ShotType.Finesse;
    else if (distGoal > 20) type = ShotType.Power;
    else if (p.style === PlayStyle.Poacher) type = ShotType.LowDriven;
    const charge = clamp(distGoal / 30, 0.3, 1);
    const aim = aimAtGoalCorner(world, p, goal);
    world.doShot(p, type, aim, charge);
    return;
  }

  // Look for a forward pass; play style influences willingness.
  const mates = teammates(world, p);
  const target = pickPassTarget(p, mates, world, dir);
  const wantsPass = pressure < 2.6 || p.style === PlayStyle.Playmaker || p.style === PlayStyle.AnchorHolding;
  if (target && p.kickCooldown <= 0 && (wantsPass || target.throughOpen)) {
    const type = target.through ? PassType.Through : (target.dist > 24 ? PassType.Lofted : PassType.Ground);
    const lead = target.through ? target.player.pos.clone().addScaled(new V2(0, dir), 6) : target.player.pos;
    const aim = V2.dir(p.pos, lead);
    world.doPass(p, type, aim, clamp(target.dist / 30, 0.2, 0.9), target.player);
    return;
  }

  // Otherwise dribble toward goal, steering around the nearest defender.
  let desired = V2.dir(p.pos, goal);
  if (marker && pressure < 4) {
    const away = V2.sub(p.pos, marker.pos).normalize();
    const blend = clamp(1 - pressure / 4, 0, 1);
    desired = desired.scale(1 - blend * 0.7).add(away.scale(blend)).normalize();
    // Inside forwards cut inside; speed dribblers knock it into space.
    if (p.style === PlayStyle.InsideForward) desired.x += (p.side === 'home' ? -0.3 : 0.3);
  }
  const sprint = p.style === PlayStyle.SpeedDribbler || pressure > 5;
  p.driveTo(desired.scale(p.effectiveTopSpeed(sprint)), dt, sprint);
  world.carryBall(p, dt);
}

function aimAtGoalCorner(world, p, goal) {
  // Aim toward the far post-ish corner, away from the keeper.
  const gk = world.players.find((q) => q.side !== p.side && q.isGK);
  let targetX = p.pos.x > 0 ? -PITCH.goalWidth * 0.35 : PITCH.goalWidth * 0.35;
  if (gk) targetX = gk.pos.x > 0 ? -PITCH.goalWidth * 0.35 : PITCH.goalWidth * 0.35;
  return V2.dir(p.pos, new V2(targetX, goal.z));
}

function pickPassTarget(p, mates, world, dir) {
  let best = null, bestScore = -Infinity;
  for (const m of mates) {
    if (m.isGK) continue;
    const ahead = (m.pos.z - p.pos.z) * dir;
    const dist = V2.dist(p.pos, m.pos);
    if (dist < 4 || dist > 45) continue;
    // Lane safety: penalise opponents near the passing line.
    const lane = laneBlocked(p.pos, m.pos, world, p.side);
    let score = ahead * 1.4 - lane * 8 - dist * 0.1;
    const through = ahead > 6 && !lane;
    if (through) score += 5;
    if (score > bestScore) { bestScore = score; best = { player: m, dist, through, throughOpen: through, blocked: lane }; }
  }
  return best && !best.blocked ? best : (best && best.dist < 18 ? best : null);
}

function laneBlocked(from, to, world, side) {
  const seg = V2.sub(to, from); const len = seg.len; if (len < 1e-3) return 1;
  const dirn = seg.clone().scale(1 / len);
  let worst = 0;
  for (const o of world.players) {
    if (o.side === side || o.sentOff) continue;
    const rel = V2.sub(o.pos, from);
    const t = clamp(rel.dot(dirn), 0, len);
    const proj = from.clone().addScaled(dirn, t);
    const d = V2.dist(proj, o.pos);
    if (d < 1.6) worst = Math.max(worst, 1.6 - d);
  }
  return worst;
}

// ---- off-ball attacking ------------------------------------------------------
function offBallAttackAI(p, world, dt) {
  const dir = attackZ(p.side);
  const carrier = world.ballCarrier;
  let target = p.home.clone();

  // Push the line up relative to the ball and shift laterally with it so players
  // keep adjusting their support position instead of standing still.
  const ball2d = world.ball.ground2D;
  const carrierZ = carrier ? carrier.pos.z : ball2d.z;
  const advance = carrier ? V2.dist(carrier.pos, attackingGoalCentre(p.side)) : 60;
  const lateral = clamp(p.home.x + (ball2d.x - p.home.x) * 0.25, -PITCH.halfWidth + 4, PITCH.halfWidth - 4);
  const support = new V2(lateral, clamp(p.home.z + dir * 8, -PITCH.halfLength + 6, PITCH.halfLength - 6));

  if (p.group === 'FWD' || p.style === PlayStyle.BoxToBox || p.style === PlayStyle.Poacher) {
    p.runTimer -= dt;
    const goal = attackingGoalCentre(p.side);
    if (p.style === PlayStyle.Poacher) {
      // Near/far-post run, but only commit into the box once the attack is in the
      // final third. Otherwise hold a wider high line so we don't camp centrally
      // in front of goal and drag a centre-back into a wall.
      const post = (p.id % 2 === 0 ? 1 : -1) * PITCH.goalWidth * 0.45;
      if (advance < 30) {
        // Stay level with the deepest defender (onside) and attack a post.
        const lastLine = lastDefenderZ(world, p.side);
        const runZ = clamp(lastLine - dir * 0.5, goal.z - dir * 16, goal.z - dir * 1);
        target = new V2(post, runZ);
      } else {
        target = new V2(clamp(post * 0.8 + ball2d.x * 0.2, -PITCH.halfWidth + 5, PITCH.halfWidth - 5),
                        clamp(carrierZ + dir * 6, -PITCH.halfLength + 8, PITCH.halfLength - 8));
      }
    } else if (carrier && advance < 35) {
      // Overlapping / channel run beyond the carrier.
      const wing = clamp(p.home.x * 1.1, -PITCH.halfWidth + 4, PITCH.halfWidth - 4);
      target = new V2(wing, clamp(carrierZ + dir * 10, -PITCH.halfLength + 5, PITCH.halfLength - 5));
    } else {
      target = support;
    }
  } else if (p.group === 'MID') {
    target = support;
  } else {
    // Defenders hold a higher line but don't bomb forward; shift across with the ball.
    target = new V2(lateral, clamp(p.home.z + dir * 4, -PITCH.halfLength + 6, PITCH.halfLength - 6));
  }

  // Manual run trigger: the user can fling the nearest attacker forward.
  if (p === world.triggeredRunner) {
    target = new V2(p.pos.x, clamp(p.pos.z + dir * 16, -PITCH.halfLength + 5, PITCH.halfLength - 5));
  }

  const desired = V2.dir(p.pos, target).scale(p.effectiveTopSpeed(false));
  const arrive = V2.dist(p.pos, target);
  if (arrive < 1.0) desired.scale(arrive / 1.0);
  p.driveTo(desired, dt, p.group === 'FWD' && arrive > 8);
}

// Z of the opponents' deepest outfield defender (used to keep runs onside).
function lastDefenderZ(world, side) {
  const dir = attackZ(side);
  let deepest = null;
  for (const o of world.players) {
    if (o.side === side || o.sentOff || o.isGK) continue;
    const z = o.pos.z * dir;
    if (deepest === null || z > deepest) deepest = z;
  }
  return deepest === null ? attackingGoalCentre(side).z : deepest * dir;
}

// ---- defending ---------------------------------------------------------------
function defendAI(p, world, dt) {
  const ball2d = world.ball.ground2D;
  const carrier = world.ballCarrier;
  const ownGoal = defendingGoalCentre(p.side);
  const mates = teammates(world, p).filter((m) => !m.isGK);

  // Decide who is the primary presser: the closest defender to the carrier.
  const defenders = world.players.filter((q) => q.side === p.side && !q.isGK && !q.sentOff);
  const presser = carrier ? nearest(defenders, carrier.pos) : null;

  if (carrier && p === presser) {
    containAndTackle(p, carrier, world, ownGoal, dt);
    return;
  }

  // Interception: if the ball is loose and we're closest, go win it.
  if (!carrier && world.ballLoose) {
    const closest = nearest(defenders, ball2d);
    if (closest === p && V2.dist(p.pos, ball2d) < 18) {
      const desired = V2.dir(p.pos, ballPredict(world, p)).scale(p.effectiveTopSpeed(true));
      p.driveTo(desired, dt, true);
      return;
    }
  }

  // Otherwise: hold a defensive shape, mark space goal-side of the ball.
  const dir = attackZ(p.side);
  const lineZ = clamp(ball2d.z - dir * 6, ownGoal.z + dir * 4, ownGoal.z + dir * (PITCH.length * 0.6));
  // Mark the nearest dangerous attacker if close, else cover zone.
  const atk = opponents(world, p).filter((o) => !o.isGK);
  const mark = nearest(atk, p.pos);
  let target;
  if (mark && V2.dist(mark.pos, p.pos) < 12 && (mark.pos.z - ownGoal.z) * dir < (p.home.z - ownGoal.z) * dir + 20) {
    // Goal-side marking position.
    const gside = V2.dir(mark.pos, ownGoal).scale(1.6);
    target = mark.pos.clone().add(gside);
  } else {
    target = new V2(clamp(p.home.x * 0.6 + ball2d.x * 0.4, -PITCH.halfWidth + 2, PITCH.halfWidth - 2), lineZ);
  }
  const desired = V2.dir(p.pos, target).scale(p.effectiveTopSpeed(false));
  const d = V2.dist(p.pos, target);
  if (d < 1.2) desired.scale(d / 1.2);
  p.driveTo(desired, dt, d > 9);
}

// Jockey/contain: stay goal-side, shepherd the carrier, only lunge when safe.
function containAndTackle(p, carrier, world, ownGoal, dt) {
  const toGoal = V2.dir(carrier.pos, ownGoal);
  // Stand-off point a little goal-side of the carrier (jockey, don't dive in).
  const standoff = carrier.pos.clone().addScaled(toGoal, 1.8);
  const dist = V2.dist(p.pos, carrier.pos);
  const a = p.profile;

  // Close down quickly when far, jockey when near.
  let sprint = dist > 4;
  let desired;
  if (dist > 3) {
    desired = V2.dir(p.pos, standoff).scale(p.effectiveTopSpeed(sprint));
  } else {
    // Mirror the carrier's lateral movement while backpedalling slightly.
    const lateral = new V2(-toGoal.z, toGoal.x);
    const side = carrier.vel.dot(lateral) > 0 ? 1 : -1;
    desired = lateral.scale(side * p.effectiveTopSpeed(false) * 0.7)
      .addScaled(toGoal, p.effectiveTopSpeed(false) * 0.15);
  }
  p.driveTo(desired, dt, sprint);

  // ---- Tackle decision -------------------------------------------------------
  // Jockey by default. Only commit to a challenge when it's actually worth it,
  // otherwise the AI dives in constantly and concedes fouls/cards. The decision
  // weighs the odds of winning the ball, how dangerous the situation is, whether
  // there's cover behind, and the angle/speed of the challenge.
  if (dist < 1.6 && p.tackleCooldown <= 0) {
    const winChance = clamp(0.35 + (a.defending - carrier.profile.dribbling) / 120 + (p.style === PlayStyle.NoNonsenseDefender ? 0.1 : 0), 0.05, 0.9);

    // Closer to our own goal => a challenge is more justified even at some risk.
    const goalDist = V2.dist(carrier.pos, ownGoal);
    const dangerZone = goalDist < PITCH.length * 0.3;

    // Are we goal-side of the carrier (between them and our goal)? Lunging from
    // here is far safer than diving in from behind a running attacker.
    const goalSide = V2.dir(carrier.pos, p.pos).dot(toGoal) > 0.25;

    // A teammate already covering behind us means there's no need to gamble.
    const haveCover = coverBehind(p, carrier, world, ownGoal);

    // Sliding into a fast runner from a poor angle is what gives away reckless
    // fouls and cards.
    const fast = carrier.vel.len > 4;

    // Patience: composed players hold off, aggressive players dive in sooner.
    const patience = clamp((a.composure || 60) - a.aggression, -30, 30) / 100; // -0.3..0.3

    // Worth-it score: positive => commit, negative => keep jockeying.
    let worth = winChance - 0.45 - patience;
    if (dangerZone) worth += 0.25;
    if (!haveCover) worth += 0.15;
    if (!goalSide) worth -= 0.4;            // don't dive in from behind
    if (fast && !goalSide) worth -= 0.2;    // chasing a fast runner is reckless

    if (worth > 0) {
      // Prefer a safe standing tackle. Only slide as a last resort: the carrier
      // is breaking past us toward goal, we're a touch too far for a standing
      // poke, the situation is dangerous, and the odds are reasonable.
      const slide = dist >= 1.2 && fast && goalSide && winChance > 0.4 && (dangerZone || !haveCover);
      world.attemptTackle(p, carrier, winChance, slide);
      p.tackleCooldown = slide ? 1.6 : 0.9;
    } else {
      // Hold off and keep containing; re-evaluate again shortly.
      p.tackleCooldown = 0.35;
    }
  }
}

// True if a teammate (not the GK) is already covering goal-side of the carrier,
// so the presser doesn't need to gamble on a risky challenge.
function coverBehind(p, carrier, world, ownGoal) {
  const toGoal = V2.dir(carrier.pos, ownGoal);
  for (const q of world.players) {
    if (q.side !== p.side || q === p || q.sentOff || q.isGK) continue;
    const rel = V2.dir(carrier.pos, q.pos);
    if (rel.dot(toGoal) > 0.4 && V2.dist(q.pos, carrier.pos) < 14) return true;
  }
  return false;
}

// Predict where to intercept a moving loose ball.
function ballPredict(world, p) {
  const b = world.ball;
  const lead = clamp(V2.dist(p.pos, b.ground2D) / Math.max(4, p.topSpeed), 0, 1.2);
  return new V2(b.pos.x + b.vel.x * lead, b.pos.z + b.vel.z * lead);
}
