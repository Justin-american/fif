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

// charge: 0..1 how long the button was held. aim: unit V2 toward target.
export function buildShot(type, aim, charge, player, rng, airborneBall = false) {
  const a = player.profile;
  const dir = aim.clone().normalize();
  // Footedness: shooting across the body with the weak foot adds spin/error.
  const sideSign = a.foot === 'L' ? 1 : -1;
  let power = 16 + charge * 16;          // base 16..32 m/s
  let lift = 2 + charge * 3;
  let spin = 0;
  const shootSkill = a.shooting / 100;

  switch (type) {
    case ShotType.Power:
      power = 22 + charge * 14;
      lift = 3.5 + charge * 4;
      spin = err(rng, a.shooting, 0.9);
      break;
    case ShotType.Finesse:
      power = 16 + charge * 9;
      lift = 3 + charge * 2.5;
      spin = (1.8 + charge * 1.2) * sideSign + err(rng, a.shooting, 0.6);
      break;
    case ShotType.Trivela:
      // Outside-of-the-boot: curves the opposite way to finesse, flatter.
      power = 18 + charge * 10;
      lift = 2.6 + charge * 2;
      spin = -(2.0 + charge * 1.3) * sideSign + err(rng, a.shooting, 0.7);
      break;
    case ShotType.LowDriven:
      power = 20 + charge * 13;
      lift = 1.0 + charge * 0.8;          // stays low
      spin = err(rng, a.shooting, 0.5);
      break;
    case ShotType.Chip:
      power = 11 + charge * 7;
      lift = 6.5 + charge * 3.5;          // high to lob the keeper
      spin = err(rng, a.shooting, 0.4);
      break;
    case ShotType.Volley:
      power = 19 + charge * 12;
      lift = 3 + charge * 3;
      spin = err(rng, a.shooting, 1.0);   // harder to keep down
      break;
    case ShotType.Header:
      power = 12 + charge * 8 + a.heading * 0.06;
      lift = 2 + charge * 2;
      spin = err(rng, a.heading, 0.7);
      break;
  }

  // Accuracy error: lower shooting/composure => more directional spread.
  const spread = (1 - shootSkill) * 0.14 + (airborneBall ? 0.05 : 0);
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
