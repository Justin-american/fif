// setpieces.js — interactive dead-ball situations (free kicks, penalties and
// corners). Instead of the players collapsing into a "moshpit" on a restart,
// this controller takes over the match for the duration of the set piece:
//   • Free kick: a third-person view behind the taker, an aim reticle, a
//     hold-to-power strike, a defensive wall whose size grows closer to goal,
//     and a "call a 2nd player" option so you can pass instead of shoot.
//   • Penalty: the ball on the spot with the box cleared except the keeper and
//     taker, a pulsing accuracy ring, WASD aiming (e.g. A+W = top-left), and a
//     timed power bar (hold too long and you sail it over). When the opponent
//     takes a penalty the user controls the keeper and picks the dive with A/D.
//   • Corner: free-kick-style aiming with no wall and a lofted-cross power meter.
//
// The match calls begin() from _setupRestart, update()/updateCamera() from the
// fixed loop, and otherwise stays out of the way while a set piece is live.
import * as THREE from '../vendor/three/three.module.js';
import { V2, clamp, lerp } from '../util/mathx.js';
import { GameMode } from '../core/gameState.js';
import { RestartType } from './referee.js';
import { ShotType, PassType } from './shots.js';
import {
  PITCH, attackZ, attackingGoalZ, attackingGoalCentre, defendingGoalCentre,
} from './pitch.js';

const KEY_ARROWS = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' };

export class SetPieceController {
  constructor(match) {
    this.m = match;
    this.sp = null;          // active set-piece state (null when idle)
  }

  get active() { return !!this.sp && !this.sp.done; }

  // Decide whether this restart should become an interactive set piece. Throw-ins,
  // goal kicks and kick-offs keep their existing lightweight handling.
  begin(r) {
    const m = this.m;
    const interactiveType = r.type === RestartType.FreeKick ||
      r.type === RestartType.Penalty || r.type === RestartType.Corner;
    if (!interactiveType) return false;
    // The "attacking" practice drill reuses the FreeKick restart only as a way to
    // place the ball at the user's feet — it should stay a normal dribble, not a
    // dead-ball routine. Engage only for real matches and the set-piece drills.
    const okMode = m.mode === GameMode.FullMatch ||
      m.mode === GameMode.PracticeFreeKick || m.mode === GameMode.PracticePenalty;
    if (!okMode) return false;
    if (r.type === RestartType.FreeKick && m.mode === GameMode.PracticePenalty) return false;

    const side = r.side;
    const defSide = side === 'home' ? 'away' : 'home';
    const goalZ = attackingGoalZ(side);
    const goal = attackingGoalCentre(side);
    const at = new V2(r.at.x, r.at.z);

    // Park the ball on the spot.
    m.ball.setFromOwnerFoot(at.x, at.z);
    m.ball.owner = null; m.ballLoose = true; m.ballCarrier = null;
    m.possessionSide = side;
    m._pendingShot = null; m._penaltyShot = null;
    m.restartTimer = 0;

    const dirToGoal = V2.dir(at, goal);
    const taker = m._nearestFieldPlayer(side, at) ||
      m.players.find((p) => p.side === side && !p.isGK && !p.sentOff);

    const sp = {
      type: r.type, side, defSide, goalZ, goal: goal.clone(), at: at.clone(),
      dirToGoal, taker,
      userInvolved: false,         // does the human interact at all?
      userTaking: false,           // human strikes the ball
      userKeeper: false,           // human controls the keeper (defending a pen)
      t: 0, done: false, struck: false,
      aimX: 0, aimY: 0,            // aim offsets (metres / fraction)
      power: 0, holdT: 0, charging: false,
      pulseT: 0,
      secondCalled: false, second: null,
      wall: [],
      keeper: m.players.find((p) => p.side === defSide && p.isGK && !p.sentOff),
      keeperGuess: (m.rng() < 0.5 ? -1 : 1),   // AI keeper's committed dive guess
      aiDelay: 0.9 + m.rng() * 0.7,            // pause before an AI taker strikes
      cam: null,
    };
    this.sp = sp;

    // Position the taker just behind the ball, facing goal.
    if (taker) {
      const behind = at.clone().addScaled(dirToGoal, -1.4);
      taker.pos.set(behind.x, behind.z);
      taker.vel.set(0, 0);
      taker.heading.copy(dirToGoal);
    }

    if (r.type === RestartType.FreeKick) this._setupFreeKick(sp);
    else if (r.type === RestartType.Corner) this._setupCorner(sp);
    else if (r.type === RestartType.Penalty) this._setupPenalty(sp);

    // Who does the human control?
    if (r.type === RestartType.Penalty && side !== 'home') {
      sp.userInvolved = true; sp.userKeeper = true;
      if (sp.keeper) m.userPlayer = sp.keeper;     // control our keeper
    } else if (side === 'home') {
      sp.userInvolved = true; sp.userTaking = true;
      if (taker) m.userPlayer = taker;
    }

    this._setCameraTarget(sp);
    return true;
  }

  // ---- positioning -----------------------------------------------------------
  _setupFreeKick(sp) {
    const m = this.m;
    const dist = V2.dist(sp.at, sp.goal);
    // 3–4 in the wall, growing closer to goal (a long-range kick barely gets two).
    let count = dist > 32 ? 2 : dist > 24 ? 3 : 4;
    const defenders = m.players
      .filter((p) => p.side === sp.defSide && !p.isGK && !p.sentOff)
      .map((p) => ({ p, d: V2.distSq(p.pos, sp.at) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, count)
      .map((e) => e.p);
    // Place the wall on the ball→goal line, ~9.15 m off the ball, spread laterally.
    const wallCentre = sp.at.clone().addScaled(sp.dirToGoal, 9.15);
    const perp = new V2(-sp.dirToGoal.z, sp.dirToGoal.x);
    const spacing = 0.95;
    defenders.forEach((d, i) => {
      const off = (i - (defenders.length - 1) / 2) * spacing;
      const pos = wallCentre.clone().addScaled(perp, off);
      d.pos.set(clamp(pos.x, -PITCH.halfWidth + 1, PITCH.halfWidth - 1), pos.z);
      d.vel.set(0, 0);
      d.heading.copy(sp.dirToGoal.clone().scale(-1));
    });
    sp.wall = defenders;
    this._parkKeeperOnLine(sp);
    // Pre-pick a second attacker (kept out wide until called over).
    sp.second = this._nearestMate(sp.taker, sp.side);
  }

  _setupCorner(sp) {
    const m = this.m;
    this._parkKeeperOnLine(sp);
    // Taker stands over the ball at the flag, facing into the box.
    if (sp.taker) {
      const inField = sp.at.clone().addScaled(sp.dirToGoal, -0.6);
      sp.taker.pos.set(inField.x, inField.z);
      sp.taker.heading.copy(V2.dir(sp.at, new V2(0, sp.goalZ)));
    }
    // Pull a few attackers into the box around the penalty spot.
    const penZ = sp.goalZ - attackZ(sp.side) * 11;
    const mates = m.players
      .filter((p) => p.side === sp.side && !p.isGK && !p.sentOff && p !== sp.taker)
      .slice(0, 4);
    mates.forEach((mte, i) => {
      const x = (i - (mates.length - 1) / 2) * 4.5;
      mte.pos.set(clamp(x, -16, 16), penZ + (i % 2 ? 2.5 : -2.5));
      mte.vel.set(0, 0);
    });
    sp.second = mates[0] || null;
  }

  _setupPenalty(sp) {
    const m = this.m;
    this._parkKeeperOnLine(sp, 0.4);
    // Clear the box: everyone except the two keepers and the taker waits outside
    // the penalty area, behind the spot.
    const edgeZ = sp.goalZ - attackZ(sp.side) * PITCH.penaltyAreaDepth;
    const outfield = m.players.filter((p) => !p.isGK && !p.sentOff && p !== sp.taker);
    outfield.forEach((p, i) => {
      const x = (i - (outfield.length - 1) / 2) * 3.6;
      p.pos.set(clamp(x, -22, 22), edgeZ - attackZ(sp.side) * (2.5 + (i % 2) * 1.5));
      p.vel.set(0, 0);
      p.heading.set(0, attackZ(sp.side));
    });
    // The user's own keeper (when attacking) stays in his own goal — nothing to do,
    // he is already there. The defending keeper is on his line via _parkKeeperOnLine.
  }

  _parkKeeperOnLine(sp, frontOffset = 0.8) {
    const gk = sp.keeper;
    if (!gk) return;
    gk.pos.set(clamp(sp.at.x * 0.15, -PITCH.goalWidth * 0.4, PITCH.goalWidth * 0.4),
      sp.goalZ - attackZ(sp.side) * frontOffset);
    gk.vel.set(0, 0);
    gk.heading.set(0, -attackZ(sp.side));
  }

  _nearestMate(taker, side) {
    if (!taker) return null;
    let best = null, bd = Infinity;
    for (const p of this.m.players) {
      if (p.side !== side || p === taker || p.isGK || p.sentOff) continue;
      const d = V2.distSq(p.pos, taker.pos);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---- per-frame update ------------------------------------------------------
  // Returns true while still in the pre-strike phase (the match should skip its
  // normal simulation), false once the ball has been struck / the piece is over.
  update(dt) {
    const sp = this.sp;
    if (!sp || sp.done) return false;
    sp.t += dt;
    sp.pulseT += dt;

    if (sp.type === RestartType.Penalty) this._updatePenalty(dt, sp);
    else this._updateFreeKickOrCorner(dt, sp);

    if (sp.struck) { this._finish(); return false; }
    this._updateHud(sp);
    return true;
  }

  _updateFreeKickOrCorner(dt, sp) {
    const m = this.m, inp = m.input;
    const isCorner = sp.type === RestartType.Corner;
    if (!sp.userTaking) { this._aiTakeOpen(dt, sp, isCorner); return; }

    // Aim: A/D sweep the target across the goal (or box, for a corner). "Attacker
    // left" maps to world -x when attacking +z, and +x when attacking -z.
    const leftWorld = sp.side === 'home' ? -1 : 1;
    const dirH = (this._down(inp, 'left') ? leftWorld : 0) + (this._down(inp, 'right') ? -leftWorld : 0);
    const range = isCorner ? 16 : PITCH.goalWidth * 0.55;
    sp.aimX = clamp(sp.aimX + dirH * 14 * dt, -range, range);

    // Call a second player over (one time) for a pass option.
    if (!isCorner && !sp.secondCalled && inp.justPressed(inp.kb.triggerRun)) {
      sp.secondCalled = true;
      if (sp.second) {
        const perp = new V2(-sp.dirToGoal.z, sp.dirToGoal.x);
        const side = m.rng() < 0.5 ? 1 : -1;
        const pos = sp.at.clone().addScaled(perp, 4.5 * side).addScaled(sp.dirToGoal, 1.5);
        sp.second.pos.set(clamp(pos.x, -PITCH.halfWidth + 1, PITCH.halfWidth - 1), pos.z);
        sp.second.vel.set(0, 0);
      }
    }

    // Charge & strike. Space = shoot/cross; J = pass (free kicks only).
    const shootKey = inp.kb.shoot, passKey = inp.kb.pass;
    if (inp.isDown(shootKey)) { sp.charging = true; sp.holdT += dt; sp.power = clamp(sp.holdT, 0.15, 1); }
    if (inp.justReleased(shootKey) && sp.charging) {
      if (isCorner) this._strikeCorner(sp);
      else this._strikeFreeKick(sp, false);
      return;
    }
    if (!isCorner && inp.justReleased(passKey)) {
      sp.power = clamp(inp.held(passKey), 0.25, 1);
      this._strikeFreeKick(sp, true);
    }
  }

  _updatePenalty(dt, sp) {
    const m = this.m, inp = m.input;
    // Pulsing ring: a triangle-ish wave so it eases in and out around the ball.
    sp.pulseFrac = 0.5 - 0.5 * Math.cos(sp.pulseT * 3.4);   // 0 (tight) .. 1 (wide)

    if (sp.userKeeper) { this._updatePenaltyKeeper(dt, sp); return; }
    if (!sp.userTaking) { this._aiTakePenalty(dt, sp); return; }

    // Direction held by the user (A/D + W/S). Attacker-left mapping as above.
    const leftWorld = sp.side === 'home' ? -1 : 1;
    sp.dirH = (this._down(inp, 'left') ? leftWorld : 0) + (this._down(inp, 'right') ? -leftWorld : 0);
    sp.dirV = (this._down(inp, 'up') ? 1 : 0) + (this._down(inp, 'down') ? -1 : 0);

    const shootKey = inp.kb.shoot;
    if (inp.isDown(shootKey)) { sp.charging = true; sp.holdT += dt; sp.power = clamp(sp.holdT / 1.1, 0.1, 1.3); }
    if (inp.justReleased(shootKey) && sp.charging) this._strikePenalty(sp);
  }

  _updatePenaltyKeeper(dt, sp) {
    const m = this.m, inp = m.input;
    // The user leans the keeper to pick a dive side; commit it for the AI strike.
    const lean = (this._down(inp, 'left') ? -1 : 0) + (this._down(inp, 'right') ? 1 : 0);
    if (lean !== 0) sp.keeperGuess = lean;
    if (sp.keeper) {
      // Small pre-dive shuffle for feedback.
      const tx = clamp(sp.keeperGuess * 0.8, -PITCH.goalWidth * 0.4, PITCH.goalWidth * 0.4);
      sp.keeper.pos.x = lerp(sp.keeper.pos.x, tx, 0.08);
    }
    this._aiTakePenalty(dt, sp);
  }

  // ---- AI takers -------------------------------------------------------------
  _aiTakeOpen(dt, sp, isCorner) {
    if (sp.t < sp.aiDelay) return;
    const m = this.m;
    if (isCorner) { sp.power = 0.85; this._strikeCorner(sp); return; }
    const dist = V2.dist(sp.at, sp.goal);
    const central = Math.abs(sp.at.x) < 16;
    if (dist < 28 && central) {
      // Have a go: aim for a top corner.
      sp.aimX = (m.rng() < 0.5 ? -1 : 1) * PITCH.goalWidth * (0.32 + m.rng() * 0.12);
      sp.power = 0.85 + m.rng() * 0.15;
      this._strikeFreeKick(sp, false);
    } else {
      // Whip it into the box.
      sp.power = 0.8;
      this._strikeCorner(sp); // reuse: a lofted ball into the danger area
    }
  }

  _aiTakePenalty(dt, sp) {
    if (sp.t < sp.aiDelay) return;
    const m = this.m;
    sp.dirH = (m.rng() < 0.5 ? -1 : 1) * (0.55 + m.rng() * 0.4);
    sp.dirV = m.rng() < 0.45 ? (0.3 + m.rng() * 0.5) : 0.0;
    sp.power = 0.6 + m.rng() * 0.4;
    // The AI keeper (when the user is taking) keeps its pre-committed guess.
    this._strikePenalty(sp);
  }

  // ---- strikes ---------------------------------------------------------------
  _aimTargetPoint(sp, depthIntoBox) {
    // World point the kick is aimed at: across the goal line for shots, or a spot
    // inside the box for crosses.
    const z = depthIntoBox ? sp.goalZ - attackZ(sp.side) * depthIntoBox : sp.goalZ;
    return new V2(clamp(sp.aimX, -PITCH.halfWidth + 1, PITCH.halfWidth - 1), z);
  }

  _strikeFreeKick(sp, asPass) {
    const m = this.m;
    if (sp.struck) return;
    const taker = sp.taker;
    if (asPass) {
      const target = (sp.secondCalled && sp.second) ? sp.second
        : m._bestPassTarget(taker, sp.dirToGoal, false);
      const aim = target ? V2.dir(taker.pos, target.pos) : sp.dirToGoal.clone();
      m.doPass(taker, PassType.Driven, aim, clamp(sp.power, 0.3, 1), target || null);
    } else {
      const target = this._aimTargetPoint(sp, 0);
      const aim = V2.dir(taker.pos, target);
      const type = this._shotType(sp);
      m.doShot(taker, type, aim, clamp(sp.power, 0.4, 1));
    }
    sp.struck = true;
  }

  _strikeCorner(sp) {
    const m = this.m;
    if (sp.struck) return;
    const taker = sp.taker;
    const target = this._aimTargetPoint(sp, 8);  // drop it ~8 m off the line
    const aim = V2.dir(taker.pos, target);
    m.doPass(taker, PassType.Lofted, aim, clamp(sp.power, 0.5, 1), sp.second || null);
    sp.struck = true;
  }

  _strikePenalty(sp) {
    const m = this.m;
    if (sp.struck) return;
    const taker = sp.taker;
    const a = taker ? taker.profile : { shooting: 70, composure: 70 };
    // Placement target on the goal.
    const half = PITCH.goalWidth / 2;
    let tx = clamp(sp.dirH, -1, 1) * half * 0.92;
    let ty = clamp(0.45 + (sp.dirV || 0) * 0.5, 0.12, 1.05) * PITCH.goalHeight;
    // Accuracy: tighter ring (small pulseFrac) and a composed taker = less spread.
    const ringErr = (sp.pulseFrac == null ? 0.5 : sp.pulseFrac);
    const skill = ((a.shooting || 70) * 0.5 + (a.composure || 70) * 0.5) / 100;
    const spread = (0.4 + ringErr * 1.6) * (1.3 - skill);
    tx += (m.rng() - 0.5) * 2 * spread;
    ty += (m.rng() - 0.5) * 1.2 * spread;
    // Power/timing: holding too long sails it over the bar.
    const over = Math.max(0, sp.power - 0.85);
    ty += over * PITCH.goalHeight * 1.4;

    const goalZ = sp.goalZ;
    const ball = m.ball;
    const flatDir = V2.dir(new V2(ball.pos.x, ball.pos.z), new V2(tx, goalZ));
    const dist = Math.abs(goalZ - ball.pos.z);
    const Ph = 22 + clamp(sp.power, 0.1, 1) * 6;       // horizontal pace
    const tFlight = dist / Ph;
    // Vertical launch so the ball is ~ty high as it reaches the line.
    const vy = ty / Math.max(0.18, tFlight) + 0.5 * 9.81 * tFlight;

    ball.owner = null;
    ball.vel.x = flatDir.x * Ph;
    ball.vel.z = flatDir.z * Ph;
    ball.vel.y = vy;
    ball.spin = (m.rng() - 0.5) * 1.2;
    ball.lastTouch = taker;
    m.ballCarrier = null; m.ballLoose = true; m.possessionSide = sp.side;
    if (taker) taker.kickCooldown = 0.5;
    m._pendingShot = { side: sp.side };
    // The defending keeper commits the (already chosen) dive guess.
    m._penaltyShot = { diveDir: sp.keeperGuess };
    sp.struck = true;
  }

  _shotType(sp) {
    const inp = this.m.input, kb = inp.kb;
    if (inp.isDown(kb.finesse)) return ShotType.Finesse;
    if (inp.isDown(kb.trivela)) return ShotType.Trivela;
    if (inp.isDown(kb.chip)) return ShotType.Chip;
    return ShotType.Power;
  }

  // ---- finish ----------------------------------------------------------------
  _finish() {
    const m = this.m;
    m.restart = { type: RestartType.None };
    m.restartTimer = 0;
    if (this.sp) this.sp.done = true;
    this.sp = null;
    this._clearHud();
  }

  // ---- camera ----------------------------------------------------------------
  _setCameraTarget(sp) {
    const m = this.m;
    const up = 0;
    if (sp.userKeeper) {
      // Defending a penalty: sit behind our own goal looking out at the taker.
      const og = defendingGoalCentre('home');
      const behind = new V2(0, og.z + Math.sign(og.z) * 9);
      sp.cam = { pos: new THREE.Vector3(behind.x, 4.5, behind.z),
        look: new THREE.Vector3(0, 1.2, sp.at.z) };
    } else {
      // Behind the taker, looking toward goal.
      const behind = sp.at.clone().addScaled(sp.dirToGoal, -9);
      sp.cam = { pos: new THREE.Vector3(behind.x, 5.0, behind.z),
        look: new THREE.Vector3(sp.goal.x, 1.4, sp.goal.z) };
    }
  }

  updateCamera(frame) {
    const sp = this.sp;
    if (!sp || !sp.cam) return false;
    const cam = this.m.camera.position;
    const k = 1 - Math.pow(0.0009, frame);
    cam.x = lerp(cam.x, sp.cam.pos.x, k);
    cam.y = lerp(cam.y, sp.cam.pos.y, k);
    cam.z = lerp(cam.z, sp.cam.pos.z, k);
    const cl = this.m._camLook;
    cl.x = lerp(cl.x, sp.cam.look.x, k);
    cl.y = lerp(cl.y, sp.cam.look.y, k);
    cl.z = lerp(cl.z, sp.cam.look.z, k);
    this.m.camera.lookAt(cl.x, cl.y, cl.z);
    return true;
  }

  // ---- HUD -------------------------------------------------------------------
  _project(x, y, z) {
    const m = this.m;
    const v = new THREE.Vector3(x, y, z).project(m.camera);
    const el = m.renderer.domElement;
    const w = el.clientWidth, h = el.clientHeight;
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
  }

  _updateHud(sp) {
    const hud = this.m.hud;
    if (sp.type === RestartType.Penalty) {
      // Pulsing ring centred on the ball.
      const b = this.m.ball.pos;
      const c = this._project(b.x, b.y, b.z);
      const edge = this._project(b.x + 2.4, b.y, b.z);
      const baseR = Math.max(14, Math.hypot(edge.x - c.x, edge.y - c.y));
      const frac = sp.pulseFrac == null ? 0.5 : sp.pulseFrac;
      const r = baseR * (0.45 + frac * 1.0);
      const color = frac < 0.25 ? '#4ad06a' : frac < 0.6 ? '#ffd54a' : '#ff5a3c';
      hud.setPenaltyCircle({ x: c.x, y: c.y, r, color });
      hud.setAimReticle(null);
      if (sp.userKeeper) {
        hud.setSetPiecePrompt(
          'Opponent penalty — <b>you are in goal</b><br>' +
          'Move <span class="key">A</span>/<span class="key">D</span> to pick your dive');
        hud.setCharge(0);
      } else if (sp.userTaking) {
        hud.setSetPiecePrompt(
          'Penalty — aim with <span class="key">W</span><span class="key">A</span>' +
          '<span class="key">S</span><span class="key">D</span> · hold <span class="key">Space</span> on the tight ring<br>' +
          '<b>Don\'t over-hold</b> or you\'ll blaze it over');
        hud.setCharge(sp.charging ? clamp(sp.power, 0, 1) : 0, 'Power');
      }
      return;
    }

    // Free kick / corner: reticle at the aim target + power meter below the taker.
    const isCorner = sp.type === RestartType.Corner;
    const target = this._aimTargetPoint(sp, isCorner ? 8 : 0);
    const ty = isCorner ? 0.2 : PITCH.goalHeight * 0.5;
    const proj = this._project(target.x, ty, target.z);
    if (sp.userTaking && !proj.behind) {
      const label = isCorner ? 'CROSS' : this._shotLabel(sp);
      hud.setAimReticle({ x: proj.x, y: proj.y, label });
      // Power meter under the taker.
      const t = sp.taker;
      const pp = t ? this._project(t.pos.x, 0.1, t.pos.z) : null;
      const pos = pp && !pp.behind ? { x: pp.x, y: pp.y + 14 } : null;
      hud.setCharge(sp.charging ? clamp(sp.power, 0, 1) : 0.001, isCorner ? 'Cross' : 'Shot', pos);
      if (isCorner) {
        hud.setSetPiecePrompt(
          'Corner — aim with <span class="key">A</span>/<span class="key">D</span> · ' +
          'hold <span class="key">Space</span> to float the cross');
      } else {
        const callTxt = sp.secondCalled ? '2nd player over — <span class="key">J</span> to pass'
          : 'Press <span class="key">E</span> to call a 2nd player over';
        hud.setSetPiecePrompt(
          'Free kick — aim <span class="key">A</span>/<span class="key">D</span> · ' +
          'curl <span class="key">C</span>/<span class="key">V</span> · hold <span class="key">Space</span> to shoot<br>' +
          callTxt);
      }
    } else {
      hud.setAimReticle(null);
      hud.setSetPiecePrompt(null);
      hud.setCharge(0);
    }
  }

  _shotLabel(sp) {
    const inp = this.m.input, kb = inp.kb;
    if (inp.isDown(kb.finesse)) return 'FINESSE';
    if (inp.isDown(kb.trivela)) return 'TRIVELA';
    if (inp.isDown(kb.chip)) return 'CHIP';
    return 'SHOT';
  }

  _clearHud() {
    const hud = this.m.hud;
    hud.setAimReticle(null);
    hud.setPenaltyCircle(null);
    hud.setSetPiecePrompt(null);
    hud.setCharge(0);
  }

  // Direction helper: bound key OR the fixed arrow-key fallback.
  _down(inp, dir) {
    const map = { left: inp.kb.moveLeft, right: inp.kb.moveRight, up: inp.kb.moveUp, down: inp.kb.moveDown };
    return inp.isDown(map[dir]) || inp.isDown(KEY_ARROWS[dir]);
  }
}
