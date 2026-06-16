// referee.js — laws of the game: clock/halves/stoppage, fouls + advantage,
// the warning → yellow → red escalation (and second-yellow = red), offside
// judged at the moment of the pass, and which restart a stoppage produces.
import { V2, clamp } from '../util/mathx.js';
import { PITCH, inBounds, attackZ } from './pitch.js';

export const RestartType = {
  None: 'None', KickOff: 'KickOff', ThrowIn: 'ThrowIn', GoalKick: 'GoalKick',
  Corner: 'Corner', FreeKick: 'FreeKick', Penalty: 'Penalty', GoalCelebration: 'Goal',
};

export class Referee {
  constructor(halfLengthSeconds) {
    this.halfLength = halfLengthSeconds;
    this.clock = 0;          // seconds elapsed in current half
    this.half = 1;
    this.stoppage = 0;
    this.warnings = {};      // playerId -> count of verbal warnings
    this.log = [];
  }

  emit(msg) {
    this.log.push(`${this.timeLabel()}  ${msg}`);
    if (this.log.length > 60) this.log.shift();
  }

  timeLabel() {
    const base = this.half === 2 ? this.halfLength : 0;
    const total = base + this.clock;
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  tick(dt) {
    this.clock += dt;
  }

  get halfOver() { return this.clock >= this.halfLength + this.stoppage; }
  get matchOver() { return this.half >= 2 && this.halfOver; }

  // Foul severity 0..1 -> card decision. Ordinary tackles that mistime the ball
  // are just free kicks (no card). Only genuinely rough/reckless challenges
  // (high severity — typically a bad slide) are cautioned or sent off.
  judgeFoul(fouler, severity) {
    this.warnings[fouler.id] = this.warnings[fouler.id] || 0;
    let card = 'none';
    if (severity > 0.85) card = 'red';
    else if (severity > 0.6) card = 'yellow';
    else card = 'none'; // clean-but-mistimed challenge: free kick only

    if (card === 'yellow') {
      fouler.cardState = (fouler.cardState || 0) + 1;
      if (fouler.cardState >= 2) {
        card = 'second-yellow-red';
        fouler.sentOff = true;
        this.emit(`🟨🟥 Second yellow — ${fouler.profile.name} is SENT OFF!`);
      } else {
        this.emit(`🟨 Yellow card — ${fouler.profile.name}.`);
      }
    } else if (card === 'red') {
      fouler.cardState = 3;
      fouler.sentOff = true;
      this.emit(`🟥 Straight red — ${fouler.profile.name} is SENT OFF!`);
    }
    return card;
  }

  // Offside: attacker beyond second-last defender AND the ball at moment of pass.
  static isOffside(receiver, world) {
    const side = receiver.side;
    const dir = attackZ(side);
    const defenders = world.players.filter((q) => q.side !== side && !q.sentOff);
    // Find second-last defender line (includes GK).
    const zs = defenders.map((d) => d.pos.z * dir).sort((a, b) => b - a);
    if (zs.length < 2) return false;
    const secondLast = zs[1];
    const recv = receiver.pos.z * dir;
    const ballZ = world.ball.pos.z * dir;
    // Onside if level/behind second-last defender or not beyond the ball.
    if (recv <= secondLast + 0.4) return false;
    if (recv <= ballZ + 0.4) return false;
    // Only in the attacking half.
    if (receiver.pos.z * dir <= 0) return false;
    return true;
  }
}

// Decide the restart when the ball leaves the field. lastTouchSide is the side
// of the player who touched it last.
export function restartForOutOfPlay(ballPos, lastTouchSide) {
  const hw = PITCH.halfWidth, hl = PITCH.halfLength;
  if (Math.abs(ballPos.x) > hw) {
    return { type: RestartType.ThrowIn, side: lastTouchSide === 'home' ? 'away' : 'home',
             at: new V2(Math.sign(ballPos.x) * hw, clamp(ballPos.z, -hl + 2, hl - 2)) };
  }
  if (Math.abs(ballPos.z) > hl) {
    const endZ = Math.sign(ballPos.z) * hl;
    // Did the ball go off the end the 'home' or 'away' team defends?
    const defendingSide = endZ < 0 ? 'home' : 'away';
    if (lastTouchSide === defendingSide) {
      // Attacker last touched it going over their opponent's line => corner.
      return { type: RestartType.Corner, side: defendingSide === 'home' ? 'away' : 'home',
               at: new V2(Math.sign(ballPos.x || 1) * (hw - 0.5), endZ) };
    }
    // Attacker put it out => goal kick to the defending side.
    return { type: RestartType.GoalKick, side: defendingSide,
             at: new V2(Math.sign(ballPos.x || 1) * 8, endZ + (defendingSide === 'home' ? 5.5 : -5.5)) };
  }
  return { type: RestartType.None };
}
