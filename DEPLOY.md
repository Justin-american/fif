# DEPLOY.md — Run locally & host on GitHub Pages

FIF is now a **plain static web game** (HTML + CSS + vanilla JavaScript ES modules
+ a locally‑vendored copy of Three.js). There is **no build step, no bundler, no
npm install, and no Unity**. Deploying is just pushing the files and turning on
GitHub Pages.

---

## Run it locally

Because the game uses ES modules and an import map, you must serve the folder over
HTTP (opening `index.html` directly with `file://` will be blocked by the browser).
Any tiny static server works — pick one:

```bash
# Python 3 (already on most machines)
python3 -m http.server 8000

# …or Node
npx serve .

# …or PHP
php -S localhost:8000
```

Then open <http://localhost:8000/> and you'll land on the **Main Menu**.

> No internet connection is needed at runtime — Three.js is vendored in
> `js/vendor/three/` and resolved through the import map in `index.html`.

---

## Put it on GitHub Pages

### Option A — serve from the repository root (simplest)
1. Commit and push these files to your default branch (e.g. `main`).
2. On GitHub: **Repo → Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Select **Branch: `main`** and **Folder: `/ (root)`**, then **Save**.
5. Wait ~1 minute and open:

   ```
   https://<your-username>.github.io/<your-repo-name>/
   ```

   For this repository that is:

   ```
   https://justin-american.github.io/fif/
   ```

### Option B — serve from a `/docs` folder
If you'd rather keep the site separate from source, copy `index.html`, `css/` and
`js/` into a `docs/` folder, push, and in **Settings → Pages** pick
**Branch: `main`**, **Folder: `/docs`**.

### Option C — `gh-pages` branch
Create a `gh-pages` branch with these files at its root, push it, and select
**Branch: `gh-pages`**, **Folder: `/ (root)`** in **Settings → Pages**.

That's it — no CI, no secrets, no Unity license.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Blank page; console says *"Failed to resolve module specifier 'three'"* | Make sure `js/vendor/three/three.module.js` was pushed and the import map in `index.html` is intact. |
| Blank page when double‑clicking `index.html` | Serve over HTTP (see above) — ES modules don't load from `file://`. |
| 404 at the Pages URL | Confirm the branch/folder in **Settings → Pages** and that `index.html` is at the served root. |
| No sound | Browsers require a click/keypress before audio starts — interact with the page. |
| Choppy on a low‑end machine | Pick the **Far** camera in Settings, or use a Practice mode (fewer players). |
