# FIF — an FC 26-style football game (Unity / C#)

A faithful recreation of the **feel and core systems** of a modern football game,
built in Unity (2022.3 LTS) with C#. This is **not** an asset or branding clone —
team and player names are generic (e.g. *Manchester Blue*) while squads, positions
and relative ratings are inspired by the 2025–26 Premier League sides.

> **Status — Parts A–D complete.** Part A delivers the *application flow,
> navigation and data-driven architecture* (BUILD ORDER step 1): the user always
> starts at the Main Menu and never gets thrown straight into a match. Part B
> completes the *data-driven foundation* — formations carry real on-pitch slot
> coordinates and every built-in squad is validated against them. Parts C & D add
> a **headless, deterministic match simulation**: pitch, ball physics, players,
> `PlayStyle`-aware AI, plus the laws layer (referee restarts, fouls, offside,
> penalties) and goalkeeper shot-stopping. The Match scene now runs the engine to
> produce a real scoreline and commentary; the live on-pitch *visual* layer is the
> next build step.

## What's implemented

| Area | Script(s) | Notes |
|------|-----------|-------|
| Persistent state | `Core/GameManager.cs` | Singleton (`DontDestroyOnLoad`) carrying selected teams, `GameMode` and settings between scenes. |
| Game mode | `Core/GameMode.cs` | `FullMatch`, `PracticeAttack`, `PracticePenalty`, `PracticeFreeKick`. |
| Settings + persistence | `Core/GameSettings.cs` | Match length, difficulty, pass assist, audio, camera — saved to `PlayerPrefs`. |
| Scene transitions | `Core/SceneLoader.cs` | Fade-to-black load between `MainMenu`, `TeamSelect`, `Match`. |
| Team / player data | `Data/TeamData.cs`, `Data/PlayerProfile.cs`, `Data/PlayerEnums.cs` | ScriptableObjects; positions, play styles, 0–100 attributes (Part B2). |
| Formations | `Data/FormationLibrary.cs` | Maps each formation string (`4-3-3`, `4-2-3-1`) to 11 normalized slot coordinates + `PlayerPosition` (Part B). |
| Squad validation | `Data/SquadValidator.cs` | Checks each XI is length-11, one GK, one captain, and matches its formation's role bands (Part B). |
| Team database | `Core/TeamDatabase.cs` | 8 PL-inspired squads with full XIs built in code; self-validated against formations (Part B3). |
| Match core | `Match/Vec2.cs`, `Match/Pitch.cs`, `Match/MatchBall.cs`, `Match/MatchPlayer.cs`, `Match/MatchConfig.cs`, `Match/MatchEngine.cs` | Headless, deterministic simulation: pitch model, ball physics, player steering, possession + `PlayStyle`-aware AI (Part C). |
| Laws & keeper | `Match/Referee.cs`, `Match/Goalkeeper.cs` | Goals, restarts (kickoff / throw-in / goal kick / corner), fouls→free kicks/penalties, offside, GK shot-stopping (Part D). |
| Main Menu | `UI/MainMenuController.cs` | Start / Practice / Settings (Part A1). |
| Team Select | `UI/TeamSelectController.cs`, `UI/TeamButton.cs` | Pick your team + opponent, ATK/DEF/MID/OVR + XI preview, centre PLAY (Part A2). |
| Practice submenu | `UI/PracticeMenuController.cs` | Attacking / Penalties / Free Kicks (Part A3). |
| Settings screen | `UI/SettingsController.cs` | Functional, persisted (Part A4). |
| Match scene | `Match/MatchBootstrap.cs` | Reads carried teams/mode/settings and runs the engine, reporting scoreline + commentary. |

## Project layout

```
Assets/Scripts/
  Core/   GameManager, GameMode, GameSettings, SceneLoader, TeamDatabase
  Data/   TeamData, PlayerProfile, PlayerEnums,
          FormationLibrary, SquadValidator                (ScriptableObjects + data)
  UI/     MainMenu, TeamSelect, TeamButton, Practice, Settings controllers
  Match/  Vec2, Pitch, MatchBall, MatchPlayer, MatchConfig (sim primitives)
          MatchEngine, Referee, Goalkeeper               (Parts C & D)
          MatchBootstrap                                 (scene driver)
```

## Match simulation (Parts C & D)

The match runs as a **deterministic, engine-agnostic simulation** with no
`UnityEngine` dependency, so a whole game can be played out and asserted in a
plain test (a given matchup + seed always replays identically).

- **Pitch / ball / players** (`Pitch`, `MatchBall`, `MatchPlayer`) — the surface
  is modelled in metres with the centre spot at the origin; Part B's normalized
  formation slots are denormalized onto it so a full XI spawns from data alone.
  The ball rolls with linear drag; players derive their top speed from the 0–100
  pace/acceleration attributes.
- **`MatchEngine`** — fixed-step loop handling possession, pressing, dribbling,
  passing and shooting. Decisions read each player's `PlayStyle` and attributes,
  so a Poacher and a Playmaker in the same slot behave differently.
- **`Referee`** (Part D) — detects goals and out-of-play, awards the correct
  restart (kick-off, throw-in, goal kick, corner), turns fouls into free kicks or
  penalties, and judges offside at the moment of a pass.
- **`Goalkeeper`** (Part D) — shades across the goal with the ball and stops shots
  with odds driven by the keeper's attributes versus shot quality.
- **Practice drills** — `PracticeAttack` spawns the opponent **keeper only**;
  `PracticePenalty` and `PracticeFreeKick` repeat their set piece and track the
  conversion count. `MatchBootstrap` reports the result and recent commentary.


## Formation data (Part B)

`Data/FormationLibrary.cs` turns each team's `formation` string into positional
data: every known formation (`4-3-3`, `4-2-3-1`) maps to **11 slots** in
starting-XI order (GK first). Each slot carries a `PlayerPosition` and a
**normalized coordinate** in `[0,1]` — `x` runs left→right, `y` runs from a
team's own goal line (0) to the opponent's (1) — so the match spawner (Part C)
can place a full XI from data alone, mirroring/scaling per side.

`Data/SquadValidator.cs` checks each squad is well-formed: exactly 11 players,
one goalkeeper, one captain, a known formation, and each XI slot's broad role
band (defender / midfielder / forward) matching the formation slot at that
index. `TeamDatabase` runs this validation in the Editor and logs any problems,
so bad data is caught before it reaches the pitch. Add new formations by
extending `FormationLibrary`.

## Opening the project

1. Install **Unity 2022.3 LTS** (the version in `ProjectSettings/ProjectVersion.txt`).
2. Open this folder as a project. Unity generates `Library/`, `.meta` files and the
   solution on first import.
3. The `Packages/manifest.json` requests the **Input System**, **TextMeshPro** and
   **uGUI** packages used by the menus.

## Wiring the three scenes (one-time editor setup)

The C# is complete and self-contained; the scenes themselves are authored in the
Editor because Unity generates the canvas/component GUIDs on import. For each scene,
create a `Canvas` + `EventSystem` and drop the matching controller onto a GameObject,
then assign the serialized UI references in the Inspector:

- **MainMenu** — add `MainMenuController` (+ child `PracticeMenuController` and
  `SettingsController` panels). Add a persistent object with `GameManager` and a
  `SceneLoader` (with a full-screen `CanvasGroup` fade overlay).
- **TeamSelect** — add `TeamSelectController`; create a `TeamButton` prefab (Button +
  label + colour image + user/opponent markers) and assign it + a grid parent.
- **Match** — add `MatchBootstrap` with header/detail `Text` and a back `Button`.

Add all three scenes to **File → Build Settings** in this order: `MainMenu`,
`TeamSelect`, `Match`. The scene names are defined as constants in `SceneLoader`.

## Deployment

See **[DEPLOY.md](DEPLOY.md)** for WebGL build + GitHub Pages hosting (Part G),
covering both the manual route and a GitHub Actions route.
