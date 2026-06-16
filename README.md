# FIF — an FC‑style football game in the browser

FIF is a from‑scratch, FC 26‑inspired football (soccer) game that runs entirely in
the browser. It is built with **plain HTML, CSS and vanilla JavaScript (ES modules)**
and renders with **[Three.js](https://threejs.org/)** (WebGL), which is vendored
locally. All audio is synthesised at runtime with the **Web Audio API**.

> **No game engine. No build step. No frameworks. No npm install.**
> Just static files — serve the folder or push it to GitHub Pages.

Originally prototyped in Unity/C#, the whole game was rewritten on this hand‑coded
browser stack so it deploys to GitHub Pages by simply pushing the files.

---

## Play

- **Run locally / host on GitHub Pages:** see **[DEPLOY.md](DEPLOY.md)**.
- Launch always opens the **Main Menu** — you're never dropped straight into a match.

### Controls (keyboard)
| Action | Keys |
|--------|------|
| Move | `WASD` / Arrow keys |
| Sprint | `Shift` |
| Shoot (hold to charge) | `Space` |
| Finesse / Trivela / Chip shot (hold while shooting) | `C` / `V` / `B` |
| Pass (hold to charge) | `J` |
| Cross / lofted pass | `L` |
| Through ball | `K` |
| Trigger teammate run | `E` |
| Switch player (when defending) | `Q` / `Space` |
| Tackle / contain (when defending) | `J` |
| Pause | `Esc` |

Basic gamepad movement (left stick) is also supported when a controller is connected.

---

## Features

- **Application flow:** Main Menu → Start Game / Practice / Settings.
- **Team Select:** Premier League‑inspired rosters with real‑style lineups; live
  **ATK / MID / DEF / OVR** ratings and the starting XI; centre **PLAY** button.
- **Practice modes:** Attacking (goalkeeper only — no outfield defenders),
  Penalties, and Free Kicks.
- **Settings (persisted via `localStorage`):** match length, difficulty, pass
  assistance, volume, camera and controls.
- **Hand‑coded ball physics:** velocity, gravity, bounce, ground roll/friction and
  a **Magnus‑effect curve** so finesse / trivela / curling free kicks bend.
- **Shot types:** Power, Finesse, Trivela, Low Driven, Chip/Lob, Volley, Header.
- **Passing:** ground / through / lofted / driven, charge‑based power, assisted /
  semi / manual, with through balls that lead the runner.
- **Smart defending:** jockeying and containment (defenders contain, they don't
  blindly chase), standing & slide tackles, interceptions, marking and an offside
  line.
- **Teammate AI:** off‑ball through / overlapping / near‑ & far‑post runs, space
  awareness and a manual run trigger.
- **Play styles:** poacher, playmaker, inside forward, speed dribbler, target man,
  finesse specialist, no‑nonsense defender, box‑to‑box, anchor — players behave
  differently.
- **Set pieces:** kick‑off, throw‑ins, corners, goal kicks, FC‑style free kicks
  (aim + curl + power) and penalties, with correct restarts.
- **Referee & cards:** fouls, advantage, verbal warning → yellow → red, second
  yellow = red (team drops to 10), offside.
- **Match flow:** goalkeeper AI, clock, score, halves, stoppage time, player
  switching, broadcast camera, HUD (score / clock / minimap / power bars) and
  stamina.

---

## Project layout

```
index.html               Entry point + import map (resolves "three" → vendored copy)
css/styles.css           Menu and HUD styling
js/
  main.js                Boots audio + UI, always shows the Main Menu
  vendor/three/          Locally vendored Three.js (no CDN)
  util/mathx.js          Vector math, RNG, steering helpers
  core/
    gameState.js         Shared state, enums, settings load/save (localStorage)
    audio.js             Procedural Web Audio SFX
  data/
    formations.js        Positions, play styles, formation templates
    teams.js             Team rosters and player ratings
  ui/ui.js               Menus: Main, Team Select, Practice, Settings, Pause
  match/
    match.js             Match orchestrator: scene, fixed loop, possession, camera
    scene.js             Pitch, goals, nets and stands meshes
    pitch.js             Pitch dimensions and helpers
    ball.js              Ball physics (gravity, bounce, roll, Magnus curve)
    player.js            Player model, attributes, movement, mesh
    shots.js             Shot and pass construction
    ai.js                On/off‑ball AI, defending, play‑style biases
    goalkeeper.js        Goalkeeper positioning and shot‑stopping
    referee.js           Clock/halves, fouls/cards, offside, restarts
    input.js             Keyboard + gamepad input
    hud.js               Scorebug, charge bar, minimap, commentary
```

---

## Tech & licensing

- Three.js is included under the MIT License (`js/vendor/three/`).
- Everything else is hand‑written for this project.
