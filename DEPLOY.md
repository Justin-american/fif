# DEPLOY.md — Putting the game in a web browser (GitHub Pages)

This guide explains, step by step, how to build the game for the **web (WebGL)** and
host it for free on **GitHub Pages**. It assumes you have **never** done Unity web
builds or GitHub Pages before. Take it slowly — you only set most of this up once.

There are **two ways** to deploy. Start with **Option 1 (Manual)** for your first try.

---

## Before you build: WebGL settings (do this once)

1. Open the project in **Unity 2022.3 LTS**.
2. Go to **File → Build Settings**.
3. In the platform list, select **WebGL**, then click **Switch Platform**.
   (Do this **early**, not at the end — it surfaces compatibility issues sooner.)
4. Click **Add Open Scenes** so `MainMenu`, `TeamSelect` and `Match` are all listed.
   Make sure **MainMenu is first** in the list (the game must launch on the menu).
5. Click **Player Settings…** (bottom-left of the Build Settings window) and set,
   under **Publishing Settings**:
   - **Compression Format** = **Gzip** (or Brotli).
   - **Decompression Fallback** = **ON**.
     (This lets it run on GitHub Pages without special server headers.)
6. Keep the build lean: compress textures and strip unused assets. Avoid
   WebGL-incompatible APIs (no threads, no `System.IO` file access).

---

## Option 1 — Manual deploy (simplest, no CI; best for first try)

### Step 1 — Build the game
1. **File → Build Settings → WebGL → Build**.
2. When asked for an output folder, create and choose one, e.g. `Build/WebGL`.
3. Wait for Unity to finish. The folder will contain:
   - `index.html`
   - a `Build/` folder
   - a `TemplateData/` folder

### Step 2 — Put the build on GitHub
Pick **one** of these two layouts:

**A) `docs/` folder on `main` (easiest):**
1. Copy the **contents** of `Build/WebGL` (the `index.html`, `Build/` and
   `TemplateData/` items) into a new `docs/` folder at the repository root.
2. Commit and push to `main`.

**B) `gh-pages` branch:**
1. Create a branch named `gh-pages`.
2. Put the **contents** of `Build/WebGL` at the **root** of that branch
   (so `index.html` is at the top level).
3. Push the `gh-pages` branch.

### Step 3 — Turn on GitHub Pages
1. On GitHub: **Repo → Settings → Pages**.
2. Under **Source**, choose **Deploy from a branch**.
3. Select either:
   - **Branch: `main`**, **Folder: `/docs`** (if you used layout A), or
   - **Branch: `gh-pages`**, **Folder: `/ (root)`** (if you used layout B).
4. Click **Save**.

### Step 4 — Open your game
Wait about a minute, then open:

```
https://<your-username>.github.io/<your-repo-name>/
```

For this repository that is:

```
https://justin-american.github.io/fif/
```

If you see a blank page, hard-refresh (Ctrl/Cmd+Shift+R). If it still fails, confirm
**Decompression Fallback** was ON when you built (see settings above).

---

## Option 2 — Automated deploy with GitHub Actions (after the manual route works)

This builds the WebGL player automatically on every push using
[GameCI](https://game.ci) and publishes it to GitHub Pages.

> **One-time requirement:** Unity must be activated in CI with a (free Personal)
> license. Follow GameCI's *Activation* guide and add the resulting
> `UNITY_LICENSE` (and, if you use a Pro seat, `UNITY_EMAIL` / `UNITY_PASSWORD`)
> as **repository secrets** under **Settings → Secrets and variables → Actions**.

This repository already ships the workflow at
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) — you do **not**
need to create it. It is reproduced here for reference:

```yaml
name: Build WebGL and Deploy to Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - uses: actions/cache@v4
        with:
          path: Library
          key: Library-WebGL-${{ hashFiles('Assets/**','Packages/**','ProjectSettings/**') }}
          restore-keys: |
            Library-WebGL-
            Library-

      - name: Build WebGL
        uses: game-ci/unity-builder@v4
        env:
          UNITY_LICENSE: ${{ secrets.UNITY_LICENSE }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        with:
          targetPlatform: WebGL

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: build/WebGL   # GameCI's default output path

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Then set **Settings → Pages → Source = GitHub Actions** (the workflow above is the
one already committed at `.github/workflows/deploy.yml`). Every push to `main`
rebuilds and republishes the game automatically.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank page / stuck on loading bar | Rebuild with **Decompression Fallback ON**; hard-refresh. |
| 404 at the Pages URL | Confirm the correct **branch/folder** in Settings → Pages and that `index.html` is at the served root. |
| Huge build / slow load | Compress textures, strip unused assets, enable code stripping. |
| CI build fails on license | Re-check the `UNITY_LICENSE` secret from GameCI activation. |
