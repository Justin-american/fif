// shots.js — translate intent (shot/pass type, aim, charge) into ball kicks.
// Implements the FC-style shot palette and pass palette. Each returns
// {dir, power, lift, spin} consumed by Ball.kick. Player attributes scale the
// outcome and add error; play styles bias the chosen shot elsewhere (ai/input).
import { V2, clamp } from '../util/mathx.js';

export const ShotType = {
  Power: 'Power',
  Finesse: 'Finesse',
  Trivela: 'Trivela',
  LowDriven: 'LowDriven',
  Chip: 'Chip',
  Volley: 'Volley',
  Header: 'Header',
};

export const PassType = {
  Ground: 'Ground',
  Through: 'Through',
  Lofted: 'Lofted',
  Driven: 'Driven',
};

// Small deterministic-ish error based on an attribute (higher attr => less error).
function err(rng, attr, scale) {
  const e = (1 - attr / 100) * scale;
  return (rng() * 2 - 1) * e;
}

// Physics constants mirrored from ball.js so we can aim shots to a target height.
const G = 9.81;
const BALL_R = 0.11;

// Launch vertical velocity needed for the ball to be passing through `height`
// (metres) after travelling `dist` at horizontal speed `power`. Because the ball
// rises above this height mid-flight and falls back to it, aiming at ~80% of the
// crossbar makes a finesse shot climb and then dip into the top corner.
function liftForTarget(height, dist, power) {
  const t = clamp(dist / Math.max(6, power), 0.25, 1.4);
  return clamp((height - BALL_R) / t + 0.5 * G * t, 0.6, 9.0);
}

// charge: 0..1 how long the button was held. aim: unit V2 toward target.
// dist: metres to goal so the shot can be lofted to actually hit the target.
export function buildShot(type, aim, charge, player, rng, airborneBall = false, dist = 18) {
  const a = player.profile;
  const dir = aim.clone().normalize();
  // Footedness: shooting across the body with the weak foot adds spin/error.
  const sideSign = a.foot === 'L' ? 1 : -1;
  let power = 16 + charge * 16;          // base 16..32 m/s
  let lift = 2 + charge * 3;
  let spin = 0;
  const shootSkill = a.shooting / 100;
  const gh = 2.8; // crossbar height (PITCH.goalHeight)

  switch (type) {
    case ShotType.Power:
      power = 26 + charge * 16;
      lift = liftForTarget(gh * 0.45, dist, power);
      spin = err(rng, a.shooting, 0.7);
      break;
    case ShotType.Finesse:
      // Climbs and dips toward the top corner.
      power = 19 + charge * 9;
      lift = liftForTarget(gh * 0.82, dist, power);
      spin = (2.6 + charge * 1.6) * sideSign + err(rng, a.shooting, 0.4);
      break;
    case ShotType.Trivela:
      // Outside-of-the-boot: curves the OPPOSITE way to a finesse, flatter.
      power = 21 + charge * 11;
      lift = liftForTarget(gh * 0.6, dist, power);
      spin = -(2.8 + charge * 1.6) * sideSign + err(rng, a.shooting, 0.5);
      break;
    case ShotType.LowDriven:
      power = 24 + charge * 14;
      lift = liftForTarget(gh * 0.18, dist, power); // stays low
      spin = err(rng, a.shooting, 0.4);
      break;
    case ShotType.Chip:
      power = 12 + charge * 7;
      lift = 6.5 + charge * 3.5;          // high to lob the keeper
      spin = err(rng, a.shooting, 0.35);
      break;
    case ShotType.Volley:
      power = 22 + charge * 13;
      lift = liftForTarget(gh * 0.5, dist, power);
      spin = err(rng, a.shooting, 0.8);   // harder to keep down
      break;
    case ShotType.Header:
      power = 13 + charge * 8 + a.heading * 0.06;
      lift = liftForTarget(gh * 0.4, dist, power);
      spin = err(rng, a.heading, 0.6);
      break;
  }

  // Accuracy error: lower shooting/composure => more directional spread. Tighter
  // than before so a skilled player's shots are genuinely on target.
  const spread = (1 - shootSkill) * 0.06 + (airborneBall ? 0.03 : 0);
  const ang = (rng() * 2 - 1) * spread;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const rd = new V2(dir.x * cos - dir.z * sin, dir.x * sin + dir.z * cos);
  return { dir: rd, power, lift, spin };
}

export function buildPass(type, aim, charge, dist, player, rng, assist = 'Assisted') {
  const a = player.profile;
  const dir = aim.clone().normalize();
  const passSkill = a.passing / 100;
  let power = clamp(6 + dist * 0.6 + charge * 6, 6, 30);
  let lift = 0.4;
  let spin = 0;

  switch (type) {
    case PassType.Ground:
      lift = 0.3; break;
    case PassType.Through:
      power = clamp(7 + dist * 0.5 + charge * 5, 7, 22);
      lift = 0.3; break;
    case PassType.Lofted:
      power = clamp(9 + dist * 0.5 + charge * 6, 9, 26);
      lift = 4.5 + charge * 2.5; break;
    case PassType.Driven:
      power = clamp(10 + dist * 0.7 + charge * 7, 10, 30);
      lift = 1.2; break;
  }

  // Pass assistance affects error: Assisted ~ tiny, Semi ~ some, Manual ~ raw.
  let assistScale = 0.04;
  if (assist === 'Semi') assistScale = 0.09;
  else if (assist === 'Manual') assistScale = 0.16;
  const spread = (1 - passSkill) * assistScale + assistScale * 0.5;
  const ang = (rng() * 2 - 1) * spread;
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const rd = new V2(dir.x * cos - dir.z * sin, dir.x * sin + dir.z * cos);
  spin += err(rng, a.passing, 0.4);
  return { dir: rd, power, lift, spin };
}
