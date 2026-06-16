// match.js — the live match: Three.js scene + camera, spawning, the fixed-step
// game loop, possession/first-touch, user control, set pieces, goals and the
// referee. The `world` object it builds is what ai.js / goalkeeper.js consume.
import * as THREE from '../vendor/three/three.module.js';
import { V2, clamp, makeRng, lerp } from '../util/mathx.js';
import { getFormation } from '../data/formations.js';
import { groupOf } from '../data/formations.js';
import { PlayStyle } from '../data/formations.js';
import { GameMode, opponentSkill } from '../core/gameState.js';
import { sfx, startCrowd, stopCrowd } from '../core/audio.js';
import { PITCH, fromFormation, inBounds, attackingGoalCentre, defendingGoalZ, attackingPenaltySpot, attackZ } from './pitch.js';
import { Ball, BALL_R } from './ball.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { updateAI } from './ai.js';
import { updateGK, tryShotStop } from './goalkeeper.js';
import { Referee, RestartType, restartForOutOfPlay } from './referee.js';
import { buildPitchMesh } from './scene.js';
import { ShotType, PassType, buildShot, buildPass } from './shots.js';

const DT = 1 / 60;

export class Match {
  constructor(container, hudRoot, opts) {
    this.container = container;
    this.opts = opts;
    this.mode = opts.mode;
    this.settings = opts.settings;
    this.onExit = opts.onExit;

    this.homeTeam = opts.homeTeam;
    this.awayTeam = opts.awayTeam || opts.homeTeam;

    this.rng = makeRng((Date.now() & 0xffff) ^ 0x1234);
    this.opponentSkill = opponentSkill(this.settings.difficulty);

    this.scoreHome = 0; this.scoreAway = 0;
    this.drillGoals = 0; this.drillAttempts = 0;
    this.players = [];
    this.ball = new Ball();
    this.ballCarrier = null;
    this.ballLoose = true;
    this.possessionSide = 'home';
    this.triggeredRunner = null;
    this.paused = false;
    this.restart = { type: RestartType.None };
    this.restartTimer = 0;
    this.running = true;
    this._acc = 0;

    this.referee = new Referee(Math.max(1, this.settings.matchLengthMinutes) * 60);

    this._initThree();
    this._buildScene();
    this._spawn();
    this.hud = new Hud(hudRoot);
    this.hud.setTeams(this.homeTeam, this.awayTeam);
    this.input = new Input();
    startCrowd();

    this._kickoff('home');
    this._lastT = performance.now();
    this._tick = this._tick.bind(this);
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    requestAnimationFrame(this._tick);
  }

  // ---- Three.js setup --------------------------------------------------------
  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7fb6e6);
    this.scene.fog = new THREE.Fog(0x7fb6e6, 120, 240);

    this.camera = new THREE.PerspectiveCamera(55, this.container.clientWidth / this.container.clientHeight, 0.5, 600);
    this.camera.position.set(0, 28, -70);
    this.camera.lookAt(0, 0, 0);
  }

  _buildScene() {
    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = 80;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
    this.scene.add(sun);
    this.scene.add(new THREE.HemisphereLight(0xbfe3ff, 0x3a6b2e, 0.7));

    this.scene.add(buildPitchMesh());

    // Ball mesh.
    const bm = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_R, 16, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
    );
    bm.castShadow = true;
    this.scene.add(bm);
    this.ballMesh = bm;
  }

  // ---- spawning --------------------------------------------------------------
  _spawn() {
    const practice = this.mode !== GameMode.FullMatch;
    // Home (user) full XI.
    this._spawnTeam(this.homeTeam, 'home', false);
    // Away: full XI for a match; GK-only for Practice Attacking; GK(+) for set-piece drills.
    if (this.mode === GameMode.FullMatch) {
      this._spawnTeam(this.awayTeam, 'away', false);
    } else {
      this._spawnTeam(this.awayTeam, 'away', true); // keeper only
    }
    for (const p of this.players) this.scene.add(p.mesh);
    this.userPlayer = this._nearestFieldPlayer('home', new V2(0, 0));
  }

  _spawnTeam(team, side, gkOnly) {
    const form = getFormation(team.formation);
    team.startingXI.forEach((profile, i) => {
      const isGK = groupOf(profile.position) === 'GK';
      if (gkOnly && !isGK) return;
      const slot = form[i] || form[0];
      const p = new Player(profile, side, slot);
      const m = fromFormation(slot, side);
      p.home.copy(m); p.pos.copy(m);
      const col = side === 'home' ? team : this.awayTeam;
      p.buildMesh(team.primary, team.secondary, false);
      this.players.push(p);
    });
  }

  get homePlayers() { return this.players.filter((p) => p.side === 'home'); }
  get awayPlayers() { return this.players.filter((p) => p.side === 'away'); }

  _nearestFieldPlayer(side, point) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (p.side !== side || p.isGK || p.sentOff) continue;
      const d = V2.distSq(p.pos, point);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---- world action API (used by AI/GK) -------------------------------------
  carryBall(p, dt) {
    this.ball.owner = p;
    const ahead = p.heading.clone().scale(0.55);
    this.ball.pos.x = p.pos.x + ahead.x;
    this.ball.pos.z = p.pos.z + ahead.z;
    this.ball.pos.y = BALL_R;
    this.ball.vel.x = this.ball.vel.z = this.ball.vel.y = 0;
    this.ballCarrier = p; this.ballLoose = false; this.possessionSide = p.side;
    this.ball.lastTouch = p;
  }

  doShot(p, type, aim, charge) {
    const ballAir = this.ball.pos.y > 0.6;
    const k = buildShot(type, aim, charge, p, this.rng, ballAir);
    this.ball.kick(k.dir, k.power, k.lift, k.spin);
    this.ball.lastTouch = p; this.ballCarrier = null; this.ballLoose = true;
    p.kickCooldown = 0.4;
    this._pendingShot = { side: p.side };
    sfx.kick(charge);
    if (p === this.userPlayer) this._addCommentary(`${p.profile.name} shoots!`);
  }

  doPass(p, type, aim, charge, target) {
    const dist = target ? V2.dist(p.pos, target.pos) : 15;
    const k = buildPass(type, aim, charge, dist, p, this.rng, this.settings.passAssistance);
    this.ball.kick(k.dir, k.power, k.lift, k.spin);
    this.ball.lastTouch = p; this.ballCarrier = null; this.ballLoose = true;
    this.possessionSide = p.side; // intended
    p.kickCooldown = 0.3;
    this._intendedReceiver = target || null;
    this._passFromSide = p.side;
    this._offsideArmed = (type === PassType.Through || type === PassType.Lofted || type === PassType.Driven || type === PassType.Ground);
    sfx.pass();
  }

  attemptTackle(defender, carrier, winChance, slide) {
    if (this.rng() < winChance) {
      // Clean tackle: knock the ball loose toward the defender's facing.
      const dir = defender.heading.clone().normalize();
      this.ball.kick(dir, 4 + this.rng() * 3, 0.4, 0);
      this.ball.lastTouch = defender; this.ballCarrier = null; this.ballLoose = true;
      this.possessionSide = defender.side;
      sfx.trap();
    } else {
      // Missed: foul. Severity higher for sliding from behind / reckless.
      let severity = slide ? 0.45 : 0.25;
      severity += this.rng() * 0.4;
      if (defender.profile.aggression > 80) severity += 0.05;
      this._awardFoul(defender, carrier, severity);
    }
  }

  gkCollect(gk) {
    this.carryBall(gk, DT);
    this.ball.owner = gk;
    sfx.save();
    // Keeper immediately looks to restart with a throw/short pass.
    this._gkHold = 0.8;
  }

  // ---- fouls / restarts ------------------------------------------------------
  _awardFoul(fouler, victim, severity) {
    sfx.whistleShort();
    const card = this.referee.judgeFoul(fouler, severity);
    if (card === 'red' || card === 'second-yellow-red') {
      fouler.setSelected(false, false);
      if (fouler.mesh) fouler.mesh.visible = false;
      sfx.card();
      this.hud.toast(`🟥 ${fouler.profile.name} sent off!`);
    } else if (card.includes('yellow')) {
      sfx.card();
      this.hud.toast(`🟨 ${fouler.profile.name}`);
    }
    // Free kick (or penalty) to the victim's side at the foul spot.
    const spot = victim.pos.clone();
    const defGoalZ = defendingGoalZ(fouler.side); // fouler defends this line
    const inBox = Math.abs(spot.x) < PITCH.penaltyAreaHalfWidth &&
      Math.abs(spot.z - defGoalZ) < PITCH.penaltyAreaDepth &&
      ((defGoalZ < 0 && spot.z > defGoalZ) || (defGoalZ > 0 && spot.z < defGoalZ));
    if (inBox) {
      this._setupRestart({ type: RestartType.Penalty, side: victim.side, at: attackingPenaltySpot(victim.side) });
      this.referee.emit('Penalty awarded!');
      this.hud.toast('PENALTY!');
    } else {
      this._setupRestart({ type: RestartType.FreeKick, side: victim.side, at: spot });
      this.referee.emit(`Free kick — ${this._sideName(victim.side)}.`);
    }
  }

  _sideName(side) { return side === 'home' ? this.homeTeam.shortName : this.awayTeam.shortName; }

  // ---- kickoff & restarts ----------------------------------------------------
  _kickoff(side) {
    for (const p of this.players) {
      if (p.sentOff) continue;
      p.pos.copy(p.home); p.vel.set(0, 0);
    }
    this.ball.setFromOwnerFoot(0, 0);
    this.ball.owner = null; this.ballLoose = true; this.ballCarrier = null;
    this.possessionSide = side;
    // Give the ball to a central player of the kicking side.
    const taker = this._nearestFieldPlayer(side, new V2(0, 0));
    if (taker) { taker.pos.set(0, side === 'home' ? -1.2 : 1.2); }
    this.restart = { type: RestartType.KickOff, side, at: new V2(0, 0) };
    this.restartTimer = 0.4;
    if (side === 'home') this.userPlayer = taker || this.userPlayer;
  }

  _setupRestart(r) {
    this.restart = r;
    this.restartTimer = 0.6;
    this.ball.setFromOwnerFoot(r.at.x, r.at.z);
    this.ball.owner = null; this.ballLoose = true; this.ballCarrier = null;
    this.possessionSide = r.side;
    // Bring a taker to the ball.
    const taker = this._nearestFieldPlayer(r.side, r.at) || this.players.find((p) => p.side === r.side && !p.sentOff);
    if (taker) {
      taker.pos.set(r.at.x + attackZ(r.side) * -1.0 * 0, r.at.z - attackZ(r.side) * 1.0);
      if (r.side === 'home') this.userPlayer = taker;
    }
    if (this.mode === GameMode.PracticePenalty || this.mode === GameMode.PracticeFreeKick) {
      this.drillAttempts += 1;
    }
  }

  // ---- main loop -------------------------------------------------------------
  _tick(now) {
    if (!this.running) return;
    let frame = (now - this._lastT) / 1000;
    this._lastT = now;
    if (frame > 0.1) frame = 0.1; // clamp big stalls
    this._acc += frame;
    this.input.beginFrame(frame);
    if (!this.paused) {
      while (this._acc >= DT) {
        this._fixedUpdate(DT);
        this._acc -= DT;
      }
    }
    this._updateCamera(frame);
    this._syncMeshes(frame);
    this._updateHud();
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this._tick);
  }

  _fixedUpdate(dt) {
    // Clock / halves.
    if (this.restart.type !== RestartType.GoalCelebration) this.referee.tick(dt);
    if (this.referee.matchOver && this.mode === GameMode.FullMatch) { this._endMatch(); return; }
    if (this.referee.halfOver && this.referee.half === 1 && this.mode === GameMode.FullMatch) {
      this.referee.half = 2; this.referee.clock = 0; this.referee.stoppage = 0;
      this.hud.toast('Half time'); sfx.whistleLong();
      this._kickoff('away');
      return;
    }

    if (this.restartTimer > 0) this.restartTimer -= dt;

    // Input → user player.
    this._handleUserInput(dt);

    // AI for everyone else.
    for (const p of this.players) {
      if (p.sentOff) continue;
      if (p.isGK) { updateGK(p, this, dt); continue; }
      updateAI(p, this, dt);
    }

    // Ball physics + possession.
    this.ball.step(dt);
    this._resolvePossession(dt);
    this._checkBallOutAndGoals(dt);

    // Run trigger decays.
    if (this.triggeredRunner) { this.triggeredRunner.runTimer = (this.triggeredRunner.runTimer || 0); }
  }

  // ---- user control ----------------------------------------------------------
  _handleUserInput(dt) {
    const u = this.userPlayer;
    if (!u || u.sentOff) { this.userPlayer = this._nearestFieldPlayer('home', this.ball.ground2D); return; }
    const inp = this.input;
    const mv = inp.moveAxis();
    const hasBall = this.ballCarrier === u;
    const defending = this.possessionSide !== 'home' || this.ballLoose;

    // Switch player when defending.
    if ((inp.justPressed('KeyQ') || (defending && inp.justPressed('Space'))) && !hasBall) {
      const np = this._nearestFieldPlayer('home', this.ball.ground2D);
      if (np) { this.userPlayer = np; }
    }

    // Movement.
    const move = new V2(mv.x, mv.z);
    const moving = move.lenSq > 0.01;
    if (moving) move.normalize();
    const desired = move.scale(u.effectiveTopSpeed(inp.sprint()));
    u.driveTo(desired, dt, inp.sprint() && moving);

    if (hasBall) {
      this.carryBall(u, dt);
      // Aim: toward attacking goal, nudged by stick for placement.
      const goal = attackingGoalCentre('home');
      let aim = V2.dir(u.pos, goal);
      if (moving) aim = aim.add(move.scale(0.5)).normalize();

      // Shoot (charge on Space).
      if (inp.justReleased('Space')) {
        const charge = clamp(inp_held(inp, 'Space'), 0.15, 1);
        const type = this._userShotType(u, goal);
        this.doShot(u, type, aim, charge);
        this.hud.setCharge(0);
      } else if (inp.isDown('Space')) {
        this.hud.setCharge(clamp(inp.held('Space'), 0, 1), 'Shot');
      }

      // Passes.
      if (inp.justReleased('KeyJ')) { this._userPass(u, PassType.Ground, move, inp.held('KeyJ')); }
      else if (inp.isDown('KeyJ')) this.hud.setCharge(clamp(inp.held('KeyJ'), 0, 1), 'Pass');
      if (inp.justPressed('KeyL')) this._userPass(u, PassType.Lofted, move, 0.6);     // cross / lofted
      if (inp.justPressed('KeyK')) this._userPass(u, PassType.Through, move, 0.5);    // through ball
      // Trigger a teammate run.
      if (inp.justPressed('KeyE')) {
        const mate = this._bestRunner(u);
        if (mate) { this.triggeredRunner = mate; mate.runTimer = 1.5; }
      }
    } else {
      this.hud.setCharge(0);
      // Defensive actions: tackle / contain via J.
      if (inp.justPressed('KeyJ') && this.ballCarrier && this.ballCarrier.side !== 'home') {
        const c = this.ballCarrier;
        if (V2.dist(u.pos, c.pos) < 2.2) {
          const chance = clamp(0.4 + (u.profile.defending - c.profile.dribbling) / 120, 0.05, 0.9);
          this.attemptTackle(u, c, chance, u.vel.len > 4);
          u.tackleCooldown = 0.6;
        }
      }
    }
  }

  _userShotType(u, goal) {
    const inp = this.input;
    const dist = V2.dist(u.pos, goal);
    if (inp.isDown('KeyC')) return ShotType.Finesse;
    if (inp.isDown('KeyV')) return ShotType.Trivela;
    if (inp.isDown('KeyB')) return ShotType.Chip;
    if (this.ball.pos.y > 0.8) return ShotType.Volley;
    if (u.style === PlayStyle.FinesseSpecialist && dist > 14) return ShotType.Finesse;
    return dist > 20 ? ShotType.Power : ShotType.LowDriven;
  }

  _userPass(u, type, move, charge) {
    let aim;
    const moving = move.lenSq > 0.01;
    const target = this._bestPassTarget(u, moving ? move : u.heading, type === PassType.Through);
    if (target) aim = V2.dir(u.pos, type === PassType.Through ? target.pos.clone().addScaled(new V2(0, attackZ('home')), 6) : target.pos);
    else aim = moving ? move.clone().normalize() : u.heading.clone();
    this.doPass(u, type, aim, clamp(charge, 0.2, 1), target);
    this.hud.setCharge(0);
  }

  _bestPassTarget(u, dirHint, through) {
    let best = null, bs = -Infinity;
    const dir = dirHint.clone().normalize();
    for (const m of this.players) {
      if (m.side !== 'home' || m === u || m.sentOff || m.isGK) continue;
      const to = V2.dir(u.pos, m.pos);
      const align = to.dot(dir);
      const dist = V2.dist(u.pos, m.pos);
      if (align < 0.2 || dist > 45) continue;
      let score = align * 2 - dist * 0.02;
      if (through) score += (m.pos.z - u.pos.z) * attackZ('home') * 0.1;
      if (score > bs) { bs = score; best = m; }
    }
    return best;
  }

  _bestRunner(u) {
    let best = null, bd = Infinity;
    for (const m of this.players) {
      if (m.side !== 'home' || m === u || m.sentOff || m.isGK) continue;
      if (groupOf(m.profile.position) === 'DEF') continue;
      const d = V2.distSq(m.pos, u.pos);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  // ---- possession / first touch ---------------------------------------------
  _resolvePossession(dt) {
    if (this._gkHold > 0) { this._gkHold -= dt; }
    const b = this.ball;
    if (b.owner) { this.ballCarrier = b.owner; this.ballLoose = false; return; }
    // Loose ball: nearest player within control radius, ball slow enough, may trap.
    if (this.restartTimer > 0) { this.ballLoose = true; this.ballCarrier = null; return; }
    let cand = null, cd = 1.6;
    for (const p of this.players) {
      if (p.sentOff) continue;
      if (p.kickCooldown > 0.15 && p === b.lastTouch) continue; // don't re-grab own kick instantly
      if (b.pos.y > 1.9 && !p.isGK) continue;                  // can't control a high ball on the floor
      const d = V2.dist(p.pos, b.ground2D);
      if (d < cd) { cd = d; cand = p; }
    }
    if (cand) {
      // First touch: faster ball + lower dribbling => chance to miscontrol.
      const speed = b.speed2D;
      const ctrl = cand.profile.dribbling / 100;
      const trapChance = clamp(0.95 - speed * 0.03 + ctrl * 0.2, 0.25, 0.99);
      if (this.rng() < trapChance || cand.isGK) {
        // Offside check at the moment the pass is received.
        if (this._offsideArmed && this._intendedReceiver === cand && cand.side === this._passFromSide) {
          if (Referee.isOffside(cand, this)) {
            this._offsideArmed = false;
            sfx.whistleShort();
            this.referee.emit(`Offside — ${cand.profile.name}.`);
            this.hud.toast('Offside');
            const gz = defendingGoalZ(cand.side);
            this._setupRestart({ type: RestartType.FreeKick, side: cand.side === 'home' ? 'away' : 'home', at: cand.pos.clone() });
            return;
          }
        }
        this._offsideArmed = false;
        this.carryBall(cand, dt);
        if (cand.side !== this.possessionSide) sfx.trap();
      } else {
        // Miscontrol: deflect the ball a little.
        const away = V2.sub(b.ground2D, cand.pos).normalize();
        b.kick(away, 2 + this.rng() * 2, 0.2, 0);
        b.lastTouch = cand;
      }
    } else {
      this.ballLoose = true; this.ballCarrier = null;
    }
  }

  // ---- goals / out of play ---------------------------------------------------
  _checkBallOutAndGoals(dt) {
    const b = this.ball;
    const hl = PITCH.halfLength, hw = PITCH.halfWidth;
    // Goal-line plane crossing.
    if (Math.abs(b.pos.z) >= hl - 0.02 && Math.abs(b.pos.z) <= hl + 1.2) {
      const withinPosts = Math.abs(b.pos.x) < PITCH.goalWidth / 2;
      const underBar = b.pos.y < PITCH.goalHeight;
      if (withinPosts && underBar) {
        // Whose goal? The defending side of that line concedes.
        const concedeSide = b.pos.z < 0 ? 'home' : 'away';
        // Goalkeeper last chance to save for a shot.
        if (this._pendingShot) {
          const gk = this.players.find((p) => p.side === concedeSide && p.isGK && !p.sentOff);
          if (gk && tryShotStop(gk, this, b.pos.x, b.pos.y)) {
            // Parry: reflect the ball back into play, loose.
            b.pos.z = (concedeSide === 'home' ? -1 : 1) * (hl - 1.5);
            b.vel.z = -b.vel.z * 0.4; b.vel.x *= 0.5; b.vel.y = 1.5; b.spin = 0;
            b.lastTouch = gk; this._pendingShot = null;
            sfx.save(); this.hud.toast('SAVE!');
            this._addCommentary(`Great save by ${gk.profile.name}!`);
            return;
          }
        }
        this._scoreGoal(concedeSide === 'home' ? 'away' : 'home');
        return;
      }
    }
    // Posts/crossbar audio cue (approx).
    if (Math.abs(b.pos.z) >= hl - 0.1 && Math.abs(Math.abs(b.pos.x) - PITCH.goalWidth / 2) < 0.2 && b.pos.y < PITCH.goalHeight) {
      sfx.post();
    }

    // Fully out of play.
    const out = Math.abs(b.pos.x) > hw + BALL_R || Math.abs(b.pos.z) > hl + BALL_R;
    if (out && this.restart.type !== RestartType.GoalCelebration && this.restartTimer <= 0) {
      this._pendingShot = null;
      const lastSide = b.lastTouch ? b.lastTouch.side : this.possessionSide;
      const r = restartForOutOfPlay(b.ground2D, lastSide);
      if (r.type === RestartType.ThrowIn) this.referee.emit(`Throw-in — ${this._sideName(r.side)}.`);
      else if (r.type === RestartType.Corner) { this.referee.emit(`Corner — ${this._sideName(r.side)}.`); }
      else if (r.type === RestartType.GoalKick) this.referee.emit(`Goal kick — ${this._sideName(r.side)}.`);
      this._setupRestart(r);
    }
  }

  _scoreGoal(scoringSide) {
    if (this.mode === GameMode.FullMatch) {
      if (scoringSide === 'home') this.scoreHome++; else this.scoreAway++;
      this.referee.emit(`⚽ GOAL — ${this._sideName(scoringSide)}! ${this.scoreHome}-${this.scoreAway}`);
    } else {
      this.drillGoals++;
      this.referee.emit(`⚽ Scored! (${this.drillGoals}/${this.drillAttempts || this.drillGoals})`);
    }
    sfx.goalHorn();
    this.hud.toast('GOAL!');
    this._pendingShot = null;
    this.restart = { type: RestartType.GoalCelebration };
    // Brief celebration then restart.
    setTimeout(() => {
      if (!this.running) return;
      if (this.mode === GameMode.FullMatch) this._kickoff(scoringSide === 'home' ? 'away' : 'home');
      else this._resetDrill();
    }, 1400);
  }

  _resetDrill() {
    // Practice attacking / penalties / free kicks: re-spawn the drill ball.
    let at = new V2(0, attackZ('home') * 30);
    if (this.mode === GameMode.PracticePenalty) at = attackingPenaltySpot('home');
    else if (this.mode === GameMode.PracticeFreeKick) at = new V2((this.rng() - 0.5) * 24, attackZ('home') * (PITCH.halfLength - 22));
    this.drillAttempts += 1;
    this._setupRestart({ type: this.mode === GameMode.PracticePenalty ? RestartType.Penalty : RestartType.FreeKick, side: 'home', at });
    this.restart = this.restart; // keep
    this.restartTimer = 0.3;
  }

  _endMatch() {
    this.running = false;
    sfx.whistleLong();
    stopCrowd();
    const res = `${this.homeTeam.shortName} ${this.scoreHome} - ${this.scoreAway} ${this.awayTeam.shortName}`;
    setTimeout(() => this.onExit && this.onExit({ result: res }), 600);
  }

  _addCommentary(line) { this.referee.emit(line); }

  // ---- presentation ----------------------------------------------------------
  _updateCamera(frame) {
    const style = this.settings.cameraStyle;
    let height = 30, back = 60, lead = 0.6;
    if (style === 'Tele') { height = 22; back = 48; }
    else if (style === 'Far') { height = 42; back = 85; }
    const b = this.ball.pos;
    const tx = clamp(b.x * 0.6, -20, 20);
    const tz = b.z - back;
    const cam = this.camera.position;
    cam.x = lerp(cam.x, tx, 1 - Math.pow(0.001, frame));
    cam.y = lerp(cam.y, height, 1 - Math.pow(0.001, frame));
    cam.z = lerp(cam.z, tz, 1 - Math.pow(0.001, frame));
    this.camera.lookAt(b.x * 0.4, 1, b.z + lead * 10);
  }

  _syncMeshes(frame) {
    for (const p of this.players) { if (!p.sentOff) p.syncMesh(frame); }
    // Selection ring on the user player.
    for (const p of this.homePlayers) p.setSelected(p === this.userPlayer, true);
    const bm = this.ballMesh, b = this.ball;
    bm.position.set(b.pos.x, b.pos.y, b.pos.z);
    bm.rotation.x += (b.vel.z) * frame * 2;
    bm.rotation.z -= (b.vel.x) * frame * 2;
  }

  _updateHud() {
    this.hud.setScore(this.scoreHome, this.scoreAway);
    const half = this.referee.half === 2 ? '2nd' : '1st';
    this.hud.setClock(this.referee.timeLabel(), this.mode === GameMode.FullMatch ? half : 'Practice');
    this.hud.setCommentary(this.referee.log);
    this.hud.drawMinimap(this);
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  togglePause(p) { this.paused = p; if (p) stopCrowd(); else startCrowd(); }

  dispose() {
    this.running = false;
    stopCrowd();
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose && x.dispose()); }
    });
  }
}

// Helper to read hold time with a sane default for Space charge.
function inp_held(inp, code) { return inp.held(code); }
