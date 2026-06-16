// hud.js — DOM overlay for score, clock, charge bars, minimap and commentary.
// Kept as plain DOM (cheap, crisp text) layered over the WebGL canvas.
import { PITCH } from './pitch.js';

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="scorebug">
        <span class="team home"></span>
        <span class="score">0 - 0</span>
        <span class="team away"></span>
        <span class="clock">00:00</span>
        <span class="half">1st</span>
      </div>
      <div id="charge"><div id="chargefill"></div><span id="chargelabel"></span></div>
      <canvas id="minimap" width="180" height="116"></canvas>
      <div id="commentary"></div>
      <div id="toast"></div>
    `;
    this.scoreEl = root.querySelector('.score');
    this.clockEl = root.querySelector('.clock');
    this.halfEl = root.querySelector('.half');
    this.homeEl = root.querySelector('.team.home');
    this.awayEl = root.querySelector('.team.away');
    this.charge = root.querySelector('#charge');
    this.chargeFill = root.querySelector('#chargefill');
    this.chargeLabel = root.querySelector('#chargelabel');
    this.commentary = root.querySelector('#commentary');
    this.toastEl = root.querySelector('#toast');
    this.mini = root.querySelector('#minimap');
    this.mctx = this.mini.getContext('2d');
  }

  setTeams(home, away) {
    this.homeEl.textContent = home.shortName;
    this.homeEl.style.color = home.primary;
    this.awayEl.textContent = away.shortName;
    this.awayEl.style.color = away.primary;
    this._home = home; this._away = away;
  }

  setScore(h, a) { this.scoreEl.textContent = `${h} - ${a}`; }
  setClock(label, half) { this.clockEl.textContent = label; this.halfEl.textContent = half; }

  setCharge(frac, label) {
    if (frac <= 0) { this.charge.style.display = 'none'; return; }
    this.charge.style.display = 'block';
    this.chargeFill.style.width = `${Math.round(frac * 100)}%`;
    this.chargeLabel.textContent = label || '';
  }

  setCommentary(lines) {
    this.commentary.innerHTML = lines.slice(-4).map((l) => `<div>${l}</div>`).join('');
  }

  toast(msg, ms = 1800) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  drawMinimap(world) {
    const c = this.mctx, W = this.mini.width, H = this.mini.height;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#0c5a2a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = 'rgba(255,255,255,0.5)'; c.strokeRect(2, 2, W - 4, H - 4);
    c.beginPath(); c.moveTo(W / 2, 2); c.lineTo(W / 2, H - 2); c.stroke();
    const sx = (x) => W / 2 + (x / PITCH.halfWidth) * (W / 2 - 4);
    const sz = (z) => H / 2 - (z / PITCH.halfLength) * (H / 2 - 4);
    for (const p of world.players) {
      if (p.sentOff) continue;
      c.fillStyle = p.side === 'home' ? world.homeTeam.primary : world.awayTeam.primary;
      c.beginPath(); c.arc(sx(p.pos.x), sz(p.pos.z), p === world.userPlayer ? 3.4 : 2.2, 0, 7); c.fill();
      if (p === world.userPlayer) { c.strokeStyle = '#00e0ff'; c.lineWidth = 1.2; c.stroke(); }
    }
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(sx(world.ball.pos.x), sz(world.ball.pos.z), 2, 0, 7); c.fill();
  }
}
