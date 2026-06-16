// ui.js — screen flow built as plain DOM: Main Menu → Team Select / Practice /
// Settings, carrying state in gameState. Launches the Three.js Match when ready.
import { TEAMS } from '../data/teams.js';
import { state, GameMode, Difficulty, PassAssistance, CameraStyle, DEFAULT_KEYBINDS, saveSettings, loadSettings } from '../core/gameState.js';
import { sfx, applyVolumes } from '../core/audio.js';
import { Match } from '../match/match.js';

export class UI {
  constructor(root, sceneHost, hudHost) {
    this.root = root;          // menu overlay container
    this.sceneHost = sceneHost; // div for the WebGL canvas
    this.hudHost = hudHost;    // div for the in-match HUD
    this.match = null;
    this.userPick = null;
    this.oppPick = null;
  }

  _clear() { this.root.innerHTML = ''; this.root.style.display = 'flex'; }
  _hideMenus() { this.root.style.display = 'none'; this.root.innerHTML = ''; }

  _btn(label, cls = '') {
    const b = document.createElement('button');
    b.className = `btn ${cls}`;
    b.textContent = label;
    b.addEventListener('click', () => sfx.uiClick());
    return b;
  }

  // ---- Main Menu -------------------------------------------------------------
  showMainMenu() {
    this._clear();
    const card = document.createElement('div');
    card.className = 'panel menu';
    card.innerHTML = `<h1 class="logo">FIF</h1><p class="tagline">An FC-style football game · Three.js</p>`;
    const start = this._btn('Start Game', 'primary');
    const practice = this._btn('Practice');
    const settings = this._btn('Settings');
    start.addEventListener('click', () => this.showTeamSelect());
    practice.addEventListener('click', () => this.showPractice());
    settings.addEventListener('click', () => this.showSettings(() => this.showMainMenu()));
    card.append(start, practice, settings);
    const foot = document.createElement('p');
    foot.className = 'foot';
    foot.textContent = 'Move WASD/Arrows · Sprint Shift · Shoot Space · Pass J · Through K · Cross L · Run E · Switch/Tackle Q/J · Rebind & full guide in Settings → Controls';
    card.append(foot);
    this.root.append(card);
  }

  // ---- Team Select -----------------------------------------------------------
  showTeamSelect() {
    this._clear();
    this.userPick = this.userPick || TEAMS[0];
    this.oppPick = this.oppPick || TEAMS[1];
    const panel = document.createElement('div');
    panel.className = 'panel select';
    panel.innerHTML = `<h2>Select Teams</h2>`;

    const cols = document.createElement('div');
    cols.className = 'select-cols';
    const userCol = this._teamColumn('Your Team', 'user');
    const oppCol = this._teamColumn('Opponent', 'opp');
    cols.append(userCol, oppCol);
    panel.append(cols);

    const playRow = document.createElement('div');
    playRow.className = 'play-row';
    const back = this._btn('Back');
    back.addEventListener('click', () => this.showMainMenu());
    const play = this._btn('▶ PLAY', 'primary play');
    play.addEventListener('click', () => {
      if (this.userPick === this.oppPick) { this.flash(panel, 'Pick two different teams'); return; }
      state.userTeam = this.userPick; state.opponentTeam = this.oppPick; state.mode = GameMode.FullMatch;
      this.launchMatch();
    });
    playRow.append(back, play);
    panel.append(playRow);
    this.root.append(panel);
    this._refreshTeamColumns();
  }

  _teamColumn(title, which) {
    const col = document.createElement('div');
    col.className = 'team-col';
    col.innerHTML = `<h3>${title}</h3>`;
    const list = document.createElement('div');
    list.className = 'team-list';
    TEAMS.forEach((t) => {
      const item = document.createElement('button');
      item.className = 'team-item';
      item.innerHTML = `<span class="swatch" style="background:${t.primary};border-color:${t.secondary}"></span>
        <span class="tname">${t.name}</span><span class="tovr">${t.ovr}</span>`;
      item.addEventListener('click', () => {
        sfx.uiClick();
        if (which === 'user') this.userPick = t; else this.oppPick = t;
        this._refreshTeamColumns();
      });
      item.dataset.team = t.name;
      list.append(item);
    });
    col.append(list);
    const stats = document.createElement('div');
    stats.className = 'team-stats';
    col.append(stats);
    col._list = list; col._stats = stats; col._which = which;
    this[`_col_${which}`] = col;
    return col;
  }

  _refreshTeamColumns() {
    for (const which of ['user', 'opp']) {
      const col = this[`_col_${which}`];
      const pick = which === 'user' ? this.userPick : this.oppPick;
      col._list.querySelectorAll('.team-item').forEach((it) => {
        it.classList.toggle('selected', it.dataset.team === pick.name);
      });
      col._stats.innerHTML = this._statsHtml(pick);
    }
  }

  _statsHtml(t) {
    const bar = (label, v) => `<div class="stat"><span>${label}</span><div class="bar"><i style="width:${v}%"></i></div><b>${v}</b></div>`;
    const xi = t.startingXI.map((p) => `${p.number} ${p.name}`).join(' · ');
    return `<div class="formation">${t.formation}</div>
      ${bar('ATK', t.attack)}${bar('MID', t.midfield)}${bar('DEF', t.defense)}${bar('OVR', t.ovr)}
      <div class="xi">${xi}</div>`;
  }

  // ---- Practice --------------------------------------------------------------
  showPractice() {
    this._clear();
    const panel = document.createElement('div');
    panel.className = 'panel menu';
    panel.innerHTML = `<h2>Practice</h2><p class="tagline">Pick a drill (uses your selected team)</p>`;
    const opts = [
      ['Attacking (keeper only)', GameMode.PracticeAttack],
      ['Penalties', GameMode.PracticePenalty],
      ['Free Kicks', GameMode.PracticeFreeKick],
    ];
    opts.forEach(([label, mode]) => {
      const b = this._btn(label);
      b.addEventListener('click', () => {
        state.userTeam = this.userPick || TEAMS[0];
        state.opponentTeam = this.oppPick || TEAMS[1];
        state.mode = mode;
        this.launchMatch();
      });
      panel.append(b);
    });
    const back = this._btn('Back');
    back.addEventListener('click', () => this.showMainMenu());
    panel.append(back);
    this.root.append(panel);
  }

  // ---- Settings --------------------------------------------------------------
  showSettings(onBack, tab = 'game') {
    this._clear();
    const panel = document.createElement('div');
    panel.className = 'panel settings';
    panel.innerHTML = `<h2>Settings</h2>`;

    // Tab bar: Game options vs Controls (reference + rebinding).
    const tabs = document.createElement('div');
    tabs.className = 'tabs';
    const gameTab = this._btn('Game', 'tab');
    const ctrlTab = this._btn('Controls', 'tab');
    tabs.append(gameTab, ctrlTab);
    panel.append(tabs);

    const body = document.createElement('div');
    body.className = 'settings-body';
    panel.append(body);

    const setActive = (name) => {
      gameTab.classList.toggle('active', name === 'game');
      ctrlTab.classList.toggle('active', name === 'controls');
      body.innerHTML = '';
      if (name === 'game') this._renderGameSettings(body);
      else this._renderControls(body);
    };
    gameTab.addEventListener('click', () => setActive('game'));
    ctrlTab.addEventListener('click', () => setActive('controls'));

    const back = this._btn('Back', 'primary');
    back.addEventListener('click', () => { this._persist(); onBack ? onBack() : this.showMainMenu(); });
    panel.append(back);
    const note = document.createElement('p');
    note.className = 'foot'; note.textContent = 'Settings save automatically (localStorage).';
    panel.append(note);
    this.root.append(panel);

    setActive(tab === 'controls' ? 'controls' : 'game');
  }

  _renderGameSettings(body) {
    const s = state.settings;
    const select = (label, options, value, onChange) => {
      const row = document.createElement('label');
      row.className = 'setting';
      row.innerHTML = `<span>${label}</span>`;
      const sel = document.createElement('select');
      options.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o; opt.textContent = o; if (String(o) === String(value)) opt.selected = true;
        sel.append(opt);
      });
      sel.addEventListener('change', () => { onChange(sel.value); this._persist(); });
      row.append(sel);
      body.append(row);
    };
    const slider = (label, key) => {
      const row = document.createElement('label');
      row.className = 'setting';
      row.innerHTML = `<span>${label}</span>`;
      const input = document.createElement('input');
      input.type = 'range'; input.min = 0; input.max = 100; input.value = Math.round(s[key] * 100);
      const val = document.createElement('b'); val.textContent = input.value;
      input.addEventListener('input', () => {
        s[key] = input.value / 100; val.textContent = input.value;
        applyVolumes(); this._persist();
      });
      row.append(input, val);
      body.append(row);
    };

    select('Match length (min)', [3, 5, 7, 10], s.matchLengthMinutes, (v) => s.matchLengthMinutes = parseInt(v, 10));
    select('Difficulty', Difficulty, s.difficulty, (v) => s.difficulty = v);
    select('Pass assistance', PassAssistance, s.passAssistance, (v) => s.passAssistance = v);
    select('Camera', CameraStyle, s.cameraStyle, (v) => s.cameraStyle = v);
    slider('Master volume', 'masterVolume');
    slider('SFX volume', 'sfxVolume');
  }

  _renderControls(body) {
    const s = state.settings;
    const kb = s.keybinds;
    const K = (a) => `<kbd>${UI.humanKey(kb[a])}</kbd>`;

    // ---- Reference: how to shoot / pass with the current bindings. ----
    const ref = document.createElement('div');
    ref.className = 'controls-ref';
    ref.innerHTML = `
      <h3>How to shoot</h3>
      <ul>
        <li>Power shot — hold ${K('shoot')} (longer hold = more power)</li>
        <li>Finesse / curl — hold ${K('finesse')} + ${K('shoot')}</li>
        <li>Trivela (outside boot) — hold ${K('trivela')} + ${K('shoot')}</li>
        <li>Chip / lob the keeper — hold ${K('chip')} + ${K('shoot')}</li>
        <li>Low driven — short tap of ${K('shoot')} near goal</li>
        <li>Volley — press ${K('shoot')} while the ball is in the air</li>
      </ul>
      <h3>How to pass</h3>
      <ul>
        <li>Ground pass — hold ${K('pass')} (longer hold = more power)</li>
        <li>Through ball — ${K('throughBall')}</li>
        <li>Cross / lofted pass — ${K('cross')}</li>
      </ul>
      <h3>Movement &amp; more</h3>
      <ul>
        <li>Move — ${K('moveUp')} ${K('moveLeft')} ${K('moveDown')} ${K('moveRight')} (Arrow keys always work too)</li>
        <li>Sprint — hold ${K('sprint')}</li>
        <li>Switch player — ${K('switchPlayer')} · Tackle — ${K('tackle')} · Trigger run — ${K('triggerRun')}</li>
      </ul>`;
    body.append(ref);

    // ---- Rebinding rows, grouped. ----
    const groups = [
      ['Movement', [
        ['moveUp', 'Move up'], ['moveDown', 'Move down'], ['moveLeft', 'Move left'],
        ['moveRight', 'Move right'], ['sprint', 'Sprint'],
      ]],
      ['Shooting', [
        ['shoot', 'Shoot'], ['finesse', 'Finesse modifier'], ['trivela', 'Trivela modifier'], ['chip', 'Chip modifier'],
      ]],
      ['Passing', [
        ['pass', 'Pass'], ['throughBall', 'Through ball'], ['cross', 'Cross / lofted'],
      ]],
      ['Other', [
        ['switchPlayer', 'Switch player'], ['tackle', 'Tackle'], ['triggerRun', 'Trigger run'],
      ]],
    ];

    const heading = document.createElement('h3');
    heading.textContent = 'Change key bindings';
    heading.className = 'rebind-title';
    body.append(heading);

    groups.forEach(([title, actions]) => {
      const gh = document.createElement('div');
      gh.className = 'rebind-group';
      gh.textContent = title;
      body.append(gh);
      actions.forEach(([action, label]) => body.append(this._rebindRow(action, label)));
    });

    const reset = this._btn('Reset to defaults', 'reset');
    reset.addEventListener('click', () => {
      state.settings.keybinds = { ...DEFAULT_KEYBINDS };
      this._persist();
      body.innerHTML = '';
      this._renderControls(body);
    });
    body.append(reset);
  }

  _rebindRow(action, label) {
    const kb = state.settings.keybinds;
    const row = document.createElement('div');
    row.className = 'setting rebind';
    row.innerHTML = `<span>${label}</span>`;
    const btn = document.createElement('button');
    btn.className = 'keycap';
    btn.textContent = UI.humanKey(kb[action]);
    btn.addEventListener('click', () => {
      if (this._capturing) return;
      this._capturing = true;
      btn.classList.add('listening');
      btn.textContent = 'Press a key…';
      const onKey = (e) => {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.removeEventListener('keydown', onKey, true);
        this._capturing = false;
        btn.classList.remove('listening');
        if (e.code !== 'Escape') { kb[action] = e.code; this._persist(); }
        btn.textContent = UI.humanKey(kb[action]);
      };
      window.addEventListener('keydown', onKey, true);
    });
    row.append(btn);
    return row;
  }

  // Human-readable label for a KeyboardEvent.code.
  static humanKey(code) {
    if (!code) return '—';
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    const map = {
      Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
      ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
      AltLeft: 'L-Alt', AltRight: 'R-Alt', Enter: 'Enter', Tab: 'Tab', Backquote: '`',
      Minus: '-', Equal: '=', Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
      Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', CapsLock: 'Caps',
    };
    return map[code] || code;
  }

  _persist() { saveSettings(state.settings); }

  flash(panel, msg) {
    let el = panel.querySelector('.flash');
    if (!el) { el = document.createElement('div'); el.className = 'flash'; panel.append(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(this._flashT);
    this._flashT = setTimeout(() => el.classList.remove('show'), 1600);
  }

  // ---- launch / exit ---------------------------------------------------------
  launchMatch() {
    this._hideMenus();
    this.sceneHost.style.display = 'block';
    this.hudHost.style.display = 'block';
    if (this.match) { this.match.dispose(); this.match = null; }
    this.match = new Match(this.sceneHost, this.hudHost, {
      homeTeam: state.userTeam,
      awayTeam: state.opponentTeam,
      mode: state.mode,
      settings: state.settings,
      onExit: (info) => this.exitMatch(info),
    });
    this._installPauseControls();
  }

  _installPauseControls() {
    if (this._pauseHandler) window.removeEventListener('keydown', this._pauseHandler);
    this._pauseHandler = (e) => {
      if (e.code === 'Escape') {
        if (!this.match) return;
        this.match.togglePause(true);
        this.showPauseMenu();
      }
    };
    window.addEventListener('keydown', this._pauseHandler);
  }

  showPauseMenu() {
    this._clear();
    this.root.classList.add('overlay');
    const panel = document.createElement('div');
    panel.className = 'panel menu';
    panel.innerHTML = `<h2>Paused</h2>`;
    const resume = this._btn('Resume', 'primary');
    resume.addEventListener('click', () => { this.root.classList.remove('overlay'); this._hideMenus(); this.match.togglePause(false); });
    const settings = this._btn('Settings');
    settings.addEventListener('click', () => this.showSettings(() => this.showPauseMenu()));
    const quit = this._btn('Quit to Menu');
    quit.addEventListener('click', () => this.exitMatch({ quit: true }));
    panel.append(resume, settings, quit);
    this.root.append(panel);
  }

  exitMatch(info) {
    this.root.classList.remove('overlay');
    if (this.match) { this.match.dispose(); this.match = null; }
    this.sceneHost.style.display = 'none';
    this.hudHost.style.display = 'none';
    this.hudHost.innerHTML = '';
    this.showMainMenu();
    if (info && info.result) this.flashGlobal(`Full time: ${info.result}`);
  }

  flashGlobal(msg) {
    const panel = this.root.querySelector('.panel');
    if (panel) this.flash(panel, msg);
  }
}
