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
      <div id="sp-circle"></div>
      <div id="sp-aim"><span class="sp-aim-label"></span></div>
      <div id="sp-prompt"></div>
      <div id="playerbar"></div>
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
    this.spCircle = root.querySelector('#sp-circle');
    this.spAim = root.querySelector('#sp-aim');
    this.spAimLabel = root.querySelector('#sp-aim .sp-aim-label');
    this.spPrompt = root.querySelector('#sp-prompt');
    this.commentary = root.querySelector('#commentary');
    this.toastEl = root.querySelector('#toast');
    this.playerbar = root.querySelector('#playerbar');
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

  // Bottom bar showing the player you currently control: name, foot, stamina.
  setPlayerInfo(player) {
    if (!this.playerbar) return;
    if (!player) { this.playerbar.style.display = 'none'; return; }
    this.playerbar.style.display = 'flex';
    const foot = player.profile.foot === 'L' ? 'Left footed' : 'Right footed';
    const stam = Math.round(player.stamina);
    this.playerbar.innerHTML =
      `<span class="pb-name">${player.profile.name}</span>` +
      `<span class="pb-sep">—</span>` +
      `<span class="pb-foot">${foot}</span>` +
      `<span class="pb-stam"><i style="width:${stam}%"></i></span>` +
      `<span class="pb-stamv">${stam}</span>`;
  }

  setCharge(frac, label, pos) {
    if (frac <= 0) { this.charge.style.display = 'none'; return; }
    this.charge.style.display = 'block';
    this.chargeFill.style.width = `${Math.round(frac * 100)}%`;
    this.chargeLabel.textContent = label || '';
    // Optional screen-space placement (e.g. a power meter below the taker). When
    // omitted we fall back to the CSS default (bottom-centre).
    if (pos) {
      this.charge.style.left = `${Math.round(pos.x)}px`;
      this.charge.style.bottom = 'auto';
      this.charge.style.top = `${Math.round(pos.y)}px`;
      this.charge.style.transform = 'translateX(-50%)';
    } else {
      this.charge.style.left = '50%';
      this.charge.style.top = 'auto';
      this.charge.style.bottom = '26px';
      this.charge.style.transform = 'translateX(-50%)';
    }
  }

  // ---- set-piece overlays ----------------------------------------------------
  // Aiming reticle (free kicks / corners): a marker at the projected target with
  // an optional label (shot type).
  setAimReticle(p) {
    if (!p) { this.spAim.style.display = 'none'; return; }
    this.spAim.style.display = 'block';
    this.spAim.style.left = `${Math.round(p.x)}px`;
    this.spAim.style.top = `${Math.round(p.y)}px`;
    this.spAimLabel.textContent = p.label || '';
  }

  // Pulsing penalty accuracy ring centred on the ball; r is the radius in px.
  setPenaltyCircle(p) {
    if (!p) { this.spCircle.style.display = 'none'; return; }
    const d = Math.max(8, Math.round(p.r * 2));
    this.spCircle.style.display = 'block';
    this.spCircle.style.width = `${d}px`;
    this.spCircle.style.height = `${d}px`;
    this.spCircle.style.left = `${Math.round(p.x)}px`;
    this.spCircle.style.top = `${Math.round(p.y)}px`;
    if (p.color) this.spCircle.style.borderColor = p.color;
  }

  // Instructional prompt block (controls / "call 2nd player").
  setSetPiecePrompt(html) {
    if (!html) { this.spPrompt.style.display = 'none'; return; }
    this.spPrompt.style.display = 'block';
    this.spPrompt.innerHTML = html;
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
