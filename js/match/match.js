// match.js — the live match: Three.js scene + camera, spawning, the fixed-step
// game loop, possession/first-touch, user control, set pieces, goals and the
// referee. The `world` object it builds is what ai.js / goalkeeper.js consume.
import * as THREE from '../vendor/three/three.module.js';
import { V2, clamp, makeRng, lerp } from '../util/mathx.js';
import { getFormation } from '../data/formations.js';
import { groupOf } from '../data/formations.js';
import { PlayStyle } from '../data/formations.js';
import { GameMode, opponentSkill } from '../core/gameState.js';
import { sfx } from '../core/audio.js';
import { PITCH, fromFormation, inBounds, attackingGoalCentre, defendingGoalZ, attackingPenaltySpot, attackZ, inPenaltyArea } from './pitch.js';
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
    this.kb = (this.settings && this.settings.keybinds) || undefined;
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

    // Rolling snapshot buffer used to play an instant replay after a goal.
    this._history = [];
    this._historyMax = 210;   // ~3.5s at 60 Hz
    this._replay = null;

    this.referee = new Referee(Math.max(1, this.settings.matchLengthMinutes) * 60);

    this._initThree();
    this._buildScene();
    this._spawn();
    this.hud = new Hud(hudRoot);
    this.hud.setTeams(this.homeTeam, this.awayTeam);
    this.input = new Input(this.kb);

    // Start the correct opening situation: kick-off for a full match, or the
    // relevant set-piece drill for practice modes.
    if (this.mode === GameMode.FullMatch) {
      this._kickoff('home');
    } else {
      this._startDrill();
    }
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
    // Broadcast-style side camera: sit along the near touchline looking across.
    this.camera.position.set(-(PITCH.halfWidth + 14), 30, 0);
    this._camLook = { x: 0, y: 1.2, z: 0 };
    this.camera.lookAt(this._camLook.x, this._camLook.y, this._camLook.z);
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

    const pitch = buildPitchMesh();
    this.scene.add(pitch);
    this.nets = (pitch.userData && pitch.userData.nets) || [];

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
    const dist = V2.dist(p.pos, attackingGoalCentre(p.side));
    const k = buildShot(type, aim, charge, p, this.rng, ballAir, dist);
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
    if (slide) defender.slide();
    if (this.rng() < winChance) {
      // Clean tackle: knock the ball loose toward the defender's facing.
      const dir = defender.heading.clone().normalize();
      this.ball.kick(dir, 4 + this.rng() * 3, 0.4, 0);
      this.ball.lastTouch = defender; this.ballCarrier = null; this.ballLoose = true;
      this.possessionSide = defender.side;
      sfx.trap();
    } else {
      // Missed: foul, but a clean-but-late challenge is just a free kick. Only a
      // reckless slide (fast, from behind) climbs into card territory.
      let severity = slide ? 0.4 : 0.15;
      severity += this.rng() * 0.35;
      // Reckless: sliding in while the carrier is moving quickly.
      if (slide && carrier.vel.len > 5) severity += 0.2;
      if (defender.profile.aggression > 82) severity += 0.05;
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

    // Goal kicks: the keeper takes it. Clear the penalty area of everyone except
    // that keeper and a single covering defender so the opposition can't camp on
    // top of the keeper and steal the restart the instant he plays it.
    if (r.type === RestartType.GoalKick) {
      this._clearBoxForGoalKick(r.side);
      // Hand the ball to the keeper to distribute; user keeps an outfield player.
      const gk = this.players.find((p) => p.side === r.side && p.isGK && !p.sentOff);
      if (gk) { gk.pos.set(r.at.x, r.at.z); this.gkCollect(gk); this.restartTimer = 0; }
      if (r.side === 'home') {
        const np = this._nearestFieldPlayer('home', new V2(0, 0));
        if (np) this.userPlayer = np;
      }
      return;
    }

    // Bring a taker to the ball.
    const taker = this._nearestFieldPlayer(r.side, r.at) || this.players.find((p) => p.side === r.side && !p.sentOff);
    if (taker) {
      taker.pos.set(r.at.x + attackZ(r.side) * -1.0 * 0, r.at.z - attackZ(r.side) * 1.0);
      if (r.side === 'home') this.userPlayer = taker;
    }
  }

  // Push every player out of the defending penalty area for a goal kick, keeping
  // only the keeper and one covering defender inside.
  _clearBoxForGoalKick(side) {
    const goalZ = defendingGoalZ(side);
    const dir = attackZ(side); // toward midfield (out of the box)
    // Keep one defender: the side's outfield player nearest their own goal.
    let keepDef = null, kd = Infinity;
    for (const p of this.players) {
      if (p.side !== side || p.isGK || p.sentOff) continue;
      const d = Math.abs(p.pos.z - goalZ);
      if (d < kd) { kd = d; keepDef = p; }
    }
    const outZ = goalZ + dir * (PITCH.penaltyAreaDepth + 2.5);
    for (const p of this.players) {
      if (p.sentOff) continue;
      if (p.isGK && p.side === side) continue;
      if (p === keepDef) continue;
      if (inPenaltyArea(p.pos, goalZ)) {
        // Move straight out past the penalty-area line, keep lateral position.
        p.pos.set(clamp(p.pos.x, -PITCH.penaltyAreaHalfWidth, PITCH.penaltyAreaHalfWidth), outZ);
        p.vel.set(0, 0);
      }
    }
  }

  // Set up (or reset) the current practice drill so it can be repeated. Counts
  // an attempt each time the ball is placed for the user to strike.
  _startDrill() {
    let at, type;
    if (this.mode === GameMode.PracticePenalty) {
      at = attackingPenaltySpot('home');
      type = RestartType.Penalty;
    } else if (this.mode === GameMode.PracticeFreeKick) {
      at = new V2((this.rng() - 0.5) * 24, attackZ('home') * (PITCH.halfLength - 22));
      type = RestartType.FreeKick;
    } else {
      // Attacking drill: start the user on the ball around the attacking third.
      at = new V2((this.rng() - 0.5) * 16, attackZ('home') * 18);
      type = RestartType.FreeKick;
    }
    this.drillAttempts += 1;
    this._drillHadControl = false;
    this._drillResetT = 0;
    this._setupRestart({ type, side: 'home', at });
  }

  // ---- main loop -------------------------------------------------------------
  _tick(now) {
    if (!this.running) return;
    let frame = (now - this._lastT) / 1000;
    this._lastT = now;
    if (frame > 0.1) frame = 0.1; // clamp big stalls

    // Instant replay takes over the render loop: drive meshes from recorded
    // snapshots instead of simulating.
    if (this._replay) {
      this._runReplay(frame);
      requestAnimationFrame(this._tick);
      return;
    }

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
    this._containBallInNet();
    this._resolvePossession(dt);
    this._checkBallOutAndGoals(dt);

    // Practice drills: respawn the next attempt once it's clearly over.
    if (this.mode !== GameMode.FullMatch) this._updateDrill(dt);

    // Run trigger decays.
    if (this.triggeredRunner) { this.triggeredRunner.runTimer = (this.triggeredRunner.runTimer || 0); }

    // Record a snapshot for instant replay (skip during the goal celebration so
    // the buffer ends at the moment of the goal).
    if (this.restart.type !== RestartType.GoalCelebration) this._recordHistory();
  }

  // Capture the current ball + player state into the rolling replay buffer.
  _recordHistory() {
    const b = this.ball;
    const ps = new Array(this.players.length);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      ps[i] = {
        x: p.pos.x, z: p.pos.z,
        hx: p.heading.x, hz: p.heading.z,
        vx: p.vel.x, vz: p.vel.z,
        off: p.sentOff,
      };
    }
    this._history.push({ bx: b.pos.x, by: b.pos.y, bz: b.pos.z, ps });
    if (this._history.length > this._historyMax) this._history.shift();
  }

  // Begin an instant replay of the passage of play leading up to a goal.
  _startReplay(onDone) {
    if (!this._history.length) { onDone(); return; }
    // Replay roughly the last 3 seconds (or whatever we have).
    const want = Math.min(this._history.length, 180);
    const frames = this._history.slice(this._history.length - want);
    this._replay = { frames, t: 0, speed: 0.85, onDone };
    this.hud.toast('REPLAY', 1600);
  }

  _runReplay(frame) {
    const R = this._replay;
    R.t += frame * R.speed;
    const idx = Math.floor(R.t / DT);
    if (idx >= R.frames.length) {
      this._replay = null;
      const done = R.onDone;
      if (done) done();
      return;
    }
    const f = R.frames[idx];
    this.ball.pos.x = f.bx; this.ball.pos.y = f.by; this.ball.pos.z = f.bz;
    this.ball.vel.x = this.ball.vel.z = 0;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i], s = f.ps[i];
      if (!s) continue;
      p.pos.x = s.x; p.pos.z = s.z;
      p.heading.x = s.hx; p.heading.z = s.hz;
      p.vel.x = s.vx; p.vel.z = s.vz;
    }
    this._updateCamera(frame);
    this._syncMeshes(frame);
    this.renderer.render(this.scene, this.camera);
  }

  // Respawn a practice drill a moment after the keeper/opponent gathers the ball
  // or it comes to rest with the user no longer in possession (e.g. a save) —
  // but only once the user has actually taken their attempt.
  _updateDrill(dt) {
    if (this.restart.type === RestartType.GoalCelebration) { this._drillResetT = 0; return; }
    if (this.restartTimer > 0) { this._drillResetT = 0; return; }
    const homeHas = this.ballCarrier && this.ballCarrier.side === 'home';
    if (homeHas) { this._drillHadControl = true; this._drillResetT = 0; return; }
    if (!this._drillHadControl) { this._drillResetT = 0; return; }
    const awayHas = this.ballCarrier && this.ballCarrier.side === 'away';
    const settled = this.ballLoose && this.ball.speed2D < 0.15;
    if (awayHas || settled) {
      this._drillResetT = (this._drillResetT || 0) + dt;
      if (this._drillResetT > 1.4) { this._drillResetT = 0; this._startDrill(); }
    } else {
      this._drillResetT = 0;
    }
  }

  // ---- user control ----------------------------------------------------------
  _handleUserInput(dt) {
    const u = this.userPlayer;
    if (!u || u.sentOff) { this.userPlayer = this._nearestFieldPlayer('home', this.ball.ground2D); return; }
    const inp = this.input;
    const kb = inp.kb;
    // Screen-space axis → world-space using the current camera orientation so
    // WASD always feels correct (fixes the inverted controls on side cameras).
    const ax = inp.moveAxis();
    const basis = this._cameraGroundBasis();
    const move = new V2(
      basis.right.x * ax.x + basis.fwd.x * ax.z,
      basis.right.z * ax.x + basis.fwd.z * ax.z,
    );
    const hasBall = this.ballCarrier === u;
    const defending = this.possessionSide !== 'home' || this.ballLoose;

    // Switch player when defending.
    if ((inp.justPressed(kb.switchPlayer) || (defending && inp.justPressed(kb.shoot))) && !hasBall) {
      const np = this._nearestFieldPlayer('home', this.ball.ground2D);
      if (np) { this.userPlayer = np; }
    }

    // Movement.
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

      // Shoot (charge on the shoot key).
      if (inp.justReleased(kb.shoot)) {
        const charge = clamp(inp.held(kb.shoot), 0.15, 1);
        const type = this._userShotType(u, goal);
        this.doShot(u, type, aim, charge);
        this.hud.setCharge(0);
      } else if (inp.isDown(kb.shoot)) {
        this.hud.setCharge(clamp(inp.held(kb.shoot), 0, 1), 'Shot');
      }

      // Passes.
      if (inp.justReleased(kb.pass)) { this._userPass(u, PassType.Ground, move, inp.held(kb.pass)); }
      else if (inp.isDown(kb.pass)) this.hud.setCharge(clamp(inp.held(kb.pass), 0, 1), 'Pass');
      if (inp.justPressed(kb.cross)) this._userPass(u, PassType.Lofted, move, 0.6);     // cross / lofted
      if (inp.justPressed(kb.throughBall)) this._userPass(u, PassType.Through, move, 0.5); // through ball
      // Trigger a teammate run.
      if (inp.justPressed(kb.triggerRun)) {
        const mate = this._bestRunner(u);
        if (mate) { this.triggeredRunner = mate; mate.runTimer = 1.5; }
      }
    } else {
      this.hud.setCharge(0);
      // Defensive actions: standing tackle (tackle key) or slide tackle (E).
      if (inp.justPressed(kb.tackle) && this.ballCarrier && this.ballCarrier.side !== 'home') {
        const c = this.ballCarrier;
        if (V2.dist(u.pos, c.pos) < 2.2) {
          const chance = clamp(0.4 + (u.profile.defending - c.profile.dribbling) / 120, 0.05, 0.9);
          this.attemptTackle(u, c, chance, u.vel.len > 4);
          u.tackleCooldown = 0.6;
        }
      }
      // Slide tackle: longer reach, but a mistimed lunge concedes a free kick
      // (and only a card if it's reckless).
      if (inp.justPressed(kb.slideTackle) && u.tackleCooldown <= 0) {
        const c = this.ballCarrier;
        if (c && c.side !== 'home' && V2.dist(u.pos, c.pos) < 3.8) {
          const chance = clamp(0.45 + (u.profile.defending - c.profile.dribbling) / 120, 0.05, 0.92);
          this.attemptTackle(u, c, chance, true);
        } else {
          u.slide(); // committed lunge that finds nothing
        }
        u.tackleCooldown = 1.4;
      }
    }
  }

  _userShotType(u, goal) {
    const inp = this.input;
    const kb = inp.kb;
    const dist = V2.dist(u.pos, goal);
    if (inp.isDown(kb.finesse)) return ShotType.Finesse;
    if (inp.isDown(kb.trivela)) return ShotType.Trivela;
    if (inp.isDown(kb.chip)) return ShotType.Chip;
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
    // Remember who the user aimed at so the receiver runs onto the ball and we
    // can hand control to them the moment they gather it.
    this._userPassReceiver = target || null;
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
        // If the user just passed to this player, hand them control on reception.
        if (this._userPassReceiver) {
          if (cand === this._userPassReceiver && cand.side === 'home' && !cand.isGK) {
            this.userPlayer = cand;
          }
          this._userPassReceiver = null;
        }
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
    // Once a goal is celebrating (or being replayed) the ball still sits beyond
    // the line for a moment — never re-count it as another goal.
    if (this.restart.type === RestartType.GoalCelebration) return;
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
          if (gk) {
            // Always throw himself at an on-target shot (dive animation), even if
            // he doesn't reach it.
            gk.dive(Math.sign(b.pos.x - gk.pos.x) || 1);
            if (tryShotStop(gk, this, b.pos.x, b.pos.y)) {
              // Parry: reflect the ball back into play, loose.
              b.pos.z = (concedeSide === 'home' ? -1 : 1) * (hl - 1.5);
              b.vel.z = -b.vel.z * 0.4; b.vel.x *= 0.5; b.vel.y = 1.5; b.spin = 0;
              b.lastTouch = gk; this._pendingShot = null;
              sfx.save(); this.hud.toast('SAVE!');
              this._addCommentary(`Great save by ${gk.profile.name}!`);
              return;
            }
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
      // In practice drills a miss simply re-spawns the next attempt.
      if (this.mode !== GameMode.FullMatch) { this._startDrill(); return; }
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
    // Brief celebration (ball billows the net), then an instant replay, then the
    // restart. Drills just respawn the ball without a replay.
    if (this.mode === GameMode.FullMatch) {
      const frames = this._history.slice();
      setTimeout(() => {
        if (!this.running) return;
        this._history = frames; // replay the build-up captured up to the goal
        this._startReplay(() => {
          if (!this.running) return;
          this._kickoff(scoringSide === 'home' ? 'away' : 'home');
        });
      }, 1100);
    } else {
      setTimeout(() => {
        if (!this.running) return;
        this._resetDrill();
      }, 1400);
    }
  }

  _resetDrill() {
    // Practice attacking / penalties / free kicks: re-spawn the drill ball.
    this._startDrill();
  }

  _endMatch() {
    this.running = false;
    sfx.whistleLong();
    const res = `${this.homeTeam.shortName} ${this.scoreHome} - ${this.scoreAway} ${this.awayTeam.shortName}`;
    setTimeout(() => this.onExit && this.onExit({ result: res }), 600);
  }

  _addCommentary(line) { this.referee.emit(line); }

  // ---- presentation ----------------------------------------------------------
  _updateCamera(frame) {
    const style = this.settings.cameraStyle;
    // Broadcast-style side camera: it sits along the near touchline (-x) and
    // tracks play up and down the pitch (z). Tele is closer/lower, Far pulls back.
    let extra = 14, height = 30, pan = 0.28;
    if (style === 'Tele') { extra = 8; height = 23; pan = 0.34; }
    else if (style === 'Far') { extra = 30; height = 44; pan = 0.2; }
    const b = this.ball.pos;
    const camX = -(PITCH.halfWidth + extra);
    const tz = clamp(b.z, -PITCH.halfLength + 4, PITCH.halfLength - 4);
    const cam = this.camera.position;
    const k = 1 - Math.pow(0.0016, frame);
    cam.x = lerp(cam.x, camX, k);
    cam.y = lerp(cam.y, height, k);
    cam.z = lerp(cam.z, tz, k);
    // Look across the pitch toward the play, panning slightly with the ball's x.
    const lx = clamp(b.x * pan, -10, 10);
    this._camLook.x = lerp(this._camLook.x, lx, k);
    this._camLook.y = 1.2;
    this._camLook.z = lerp(this._camLook.z, tz, k);
    this.camera.lookAt(this._camLook.x, this._camLook.y, this._camLook.z);
  }

  // Ground-plane camera basis so movement is camera-relative (W = away from the
  // camera/up the screen, D = screen-right) regardless of the camera angle.
  _cameraGroundBasis() {
    const cam = this.camera.position;
    const look = this._camLook;
    let fx = look.x - cam.x, fz = look.z - cam.z;
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl; fz /= fl;
    // World right = forward × up (up = +y) projected on the ground.
    return { fwd: new V2(fx, fz), right: new V2(-fz, fx) };
  }

  _syncMeshes(frame) {
    for (const p of this.players) { if (!p.sentOff) p.syncMesh(frame); }
    // Selection ring on the user player.
    for (const p of this.homePlayers) p.setSelected(p === this.userPlayer, true);
    const bm = this.ballMesh, b = this.ball;
    bm.position.set(b.pos.x, b.pos.y, b.pos.z);
    bm.rotation.x += (b.vel.z) * frame * 2;
    bm.rotation.z -= (b.vel.x) * frame * 2;
    this._updateNets(frame);
  }

  // Keep the ball inside the goal netting: once it's in the goal mouth and past
  // the back of the net, clamp it and let the net soak up the pace (so a shot
  // nestles in the net instead of flying straight through it).
  _containBallInNet() {
    if (!this.nets || !this.nets.length) return;
    const b = this.ball;
    const gw = PITCH.goalWidth, gh = PITCH.goalHeight, hl = PITCH.halfLength;
    for (const zSign of [1, -1]) {
      const line = zSign * hl;
      const into = (b.pos.z - line) * zSign;           // how far past the goal line
      if (into <= 0) continue;                          // not past the line yet
      if (b.pos.y > gh + 0.2) continue;                 // over the crossbar / roof net
      const backPlane = (this.nets.find((n) => n.zSign === zSign) || {}).depth || 2.0;
      if (into > backPlane + 0.3) continue;             // beyond the netting entirely
      // Back panel: stop the ball at the back of the net and absorb the pace.
      if (Math.abs(b.pos.x) <= gw / 2 + 0.2 && into > backPlane - 0.08) {
        b.pos.z = line + zSign * (backPlane - 0.08);
        if (b.vel.z * zSign > 0) b.vel.z *= -0.18;
        b.vel.x *= 0.4; b.vel.y *= 0.4; b.spin = 0;
      }
      // Side panels: once the ball is inside the goal it can't escape sideways
      // past the posts — the side netting catches it instead of letting it run
      // out of play.
      if (Math.abs(b.pos.x) > gw / 2 - BALL_R && Math.abs(b.pos.x) < gw / 2 + BALL_R + 0.3) {
        const sx = Math.sign(b.pos.x) || 1;
        b.pos.x = sx * (gw / 2 - BALL_R);
        if (b.vel.x * sx > 0) b.vel.x *= -0.18;
        b.vel.y *= 0.5; b.spin = 0;
      }
    }
  }

  // Ease each net's back panel toward the ball (bulge on impact) and spring it
  // back to rest otherwise.
  _updateNets(frame) {
    if (!this.nets || !this.nets.length) return;
    const b = this.ball;
    const gw = PITCH.goalWidth, gh = PITCH.goalHeight;
    const k = 1 - Math.pow(0.0008, Math.max(1e-3, frame)); // springy easing
    const sigma = 1.0, sig2 = 2 * sigma * sigma;
    for (const net of this.nets) {
      const zSign = net.zSign;
      const into = (b.pos.z - net.line) * zSign;
      const inGoal = Math.abs(b.pos.x) < gw / 2 + 0.3 && b.pos.y < gh + 0.4 &&
        into > -0.2 && into < net.depth + 0.6;
      const speed = Math.hypot(b.vel.x, b.vel.y, b.vel.z);
      const strength = inGoal ? clamp(speed / 26 + 0.35, 0.3, 1.2) : 0;
      const pos = net.geom.attributes.position;
      let changed = false;
      for (let i = 0; i < pos.count; i++) {
        const lx = net.rest[i * 3];
        const ly = net.rest[i * 3 + 1];
        const wy = net.yOffset + ly;
        let target = 0;
        if (strength > 0) {
          const d2 = (b.pos.x - lx) * (b.pos.x - lx) + (b.pos.y - wy) * (b.pos.y - wy);
          target = zSign * strength * Math.exp(-d2 / sig2);
        }
        const cz = pos.getZ(i);
        const nz = cz + (target - cz) * k;
        if (Math.abs(nz - cz) > 1e-4) { pos.setZ(i, nz); changed = true; }
      }
      if (changed) pos.needsUpdate = true;
    }
  }

  _updateHud() {
    this.hud.setScore(this.scoreHome, this.scoreAway);
    const half = this.referee.half === 2 ? '2nd' : '1st';
    this.hud.setClock(this.referee.timeLabel(), this.mode === GameMode.FullMatch ? half : 'Practice');
    this.hud.setCommentary(this.referee.log);
    this.hud.setPlayerInfo(this.userPlayer);
    this.hud.drawMinimap(this);
  }

  _resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  togglePause(p) { this.paused = p; }

  dispose() {
    this.running = false;
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose && x.dispose()); }
    });
  }
}
