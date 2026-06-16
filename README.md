# FIF — an FC 26-style football game (Unity / C#)

A faithful recreation of the **feel and core systems** of a modern football game,
built in Unity (2022.3 LTS) with C#. This is **not** an asset or branding clone —
team and player names are generic (e.g. *Manchester Blue*) while squads, positions
and relative ratings are inspired by the 2025–26 Premier League sides.

> **Status — Part A complete.** This branch delivers the *application flow,
> navigation and data-driven architecture* (BUILD ORDER step 1). The user always
> starts at the Main Menu and never gets thrown straight into a match. Gameplay
> systems (ball physics, players, AI, set pieces, referee, GK) are scoped for the
> following build steps and are represented here by a placeholder Match scene that
> reads the carried state.

## What's implemented

| Area | Script(s) | Notes |
|------|-----------|-------|
| Persistent state | `Core/GameManager.cs` | Singleton (`DontDestroyOnLoad`) carrying selected teams, `GameMode` and settings between scenes. |
| Game mode | `Core/GameMode.cs` | `FullMatch`, `PracticeAttack`, `PracticePenalty`, `PracticeFreeKick`. |
| Settings + persistence | `Core/GameSettings.cs` | Match length, difficulty, pass assist, audio, camera — saved to `PlayerPrefs`. |
| Scene transitions | `Core/SceneLoader.cs` | Fade-to-black load between `MainMenu`, `TeamSelect`, `Match`. |
| Team / player data | `Data/TeamData.cs`, `Data/PlayerProfile.cs`, `Data/PlayerEnums.cs` | ScriptableObjects; positions, play styles, 0–100 attributes (Part B2). |
| Team database | `Core/TeamDatabase.cs` | 8 PL-inspired squads with full XIs built in code (Part B3). |
| Main Menu | `UI/MainMenuController.cs` | Start / Practice / Settings (Part A1). |
| Team Select | `UI/TeamSelectController.cs`, `UI/TeamButton.cs` | Pick your team + opponent, ATK/DEF/MID/OVR + XI preview, centre PLAY (Part A2). |
| Practice submenu | `UI/PracticeMenuController.cs` | Attacking / Penalties / Free Kicks (Part A3). |
| Settings screen | `UI/SettingsController.cs` | Functional, persisted (Part A4). |
| Placeholder match | `Match/MatchBootstrap.cs` | Reads carried teams/mode/settings to prove the flow end-to-end. |

## Project layout

```
Assets/Scripts/
  Core/   GameManager, GameMode, GameSettings, SceneLoader, TeamDatabase
  Data/   TeamData, PlayerProfile, PlayerEnums   (ScriptableObjects)
  UI/     MainMenu, TeamSelect, TeamButton, Practice, Settings controllers
  Match/  MatchBootstrap (placeholder)
```

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
