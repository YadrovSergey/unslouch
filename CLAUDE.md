# Unslouch / «Засиделся»

Free, open-source (MIT) desktop app for people who sit at a computer all day: micro-breaks, stand-up breaks,
gentle cues, statistics. Tauri 2 (Rust) + React 19 + i18next, 15 languages. Website in `site/` (Astro).
The repository is public: https://github.com/YadrovSergey/unslouch

## Commands

```sh
npm install && npm run hooks        # gitleaks pre-commit hook (brew install gitleaks)
UNSLOUCH_FAST=1 npm run tauri dev   # 1 settings minute = 5 s. Breaks cover the screen: warn the user first
npm test                            # locales + Rust tests (scheduler, usage, settings, i18n)
npx tsc --noEmit
cd site && npm run build            # Node 22.12+ (nvm use 24)
```

Browser preview without Rust: `npx vite --port 1420`, then `index.html?view=gallery&lang=ru` (exercises),
`?view=break&kind=micro&dur=20&rot=0&primary=1&lang=ru`, `?view=settings` (needs a mock of `window.__TAURI_INTERNALS__`).

Linux build check without Linux: Docker `rust:1-bookworm` with `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
librsvg2-dev libxdo-dev libxss-dev libx11-dev`, copy sources into the container (tauri-build writes into the tree).
Windows is checked only by CI.

## Rules

- **The app collects no data, ever.** No analytics, telemetry, crash reports, accounts. Its only network request is
  the update check. The website has one exception: Yandex Metrica (counter 113120121) in
  `site/src/components/CookieConsent.astro`, loaded only after "Accept" in the cookie notice (152-FZ and GDPR),
  no `<noscript>` pixel. Any change here must be reflected in `legal/privacy.*.md` and `legal/consent.*.md`.
- **Health texts:** "reduces discomfort/fatigue", never "treats", "prevents carpal tunnel/thrombosis", "fixes
  posture", no blue-light glasses. Every section has "when to see a doctor". No neck circles, nothing through pain.
  New claims need a source in `docs/science.*.md`.
- **Eye rule wording:** Russian «20 минут, 20 секунд, 6 метров» (never «20-20-20», never feet). Feet only in English.
- **Russian texts** for users: natural language, no em dashes, no «обратите внимание», «стало удобнее» and the like.
  Check with `python3 ~/develop/mzr_js_app/.claude/skills/live-text-check/check.py <file>`.
- **Translations:** `src/locales/<code>.json`, the tray menu reads the same files. After changes: `npm run check:locales`.
  New keys go into all 15 languages (ru and en first, then the rest).
- **MZR diary promo** is shown only for CIS languages (ru, uk, kk, be, uz, hy, ka, az) and never on the break screen.
- **Secrets never go into the repository.** They live in GitHub Actions Secrets; `.gitignore` covers keys and certificates.
  Commits use the GitHub noreply email set in this repo's git config.
- **Commit and push only when the user asks.**
- Tray menu calls only on the main thread and never while `AppState.0` is locked (see `refresh_tray` / `apply_tray`
  in `lib.rs`): a menu call waits for the main thread and would deadlock.
- Scheduler logic lives in `src-tauri/src/scheduler.rs` as pure functions with tests: add a test for every rule change.

## Releases and deploy

See "Releases and deploy" in README.md. Short version: bump the version in `package.json`, `src-tauri/Cargo.toml`,
`src-tauri/tauri.conf.json`, tag `vX.Y.Z`, publish the draft release; `cdn.yml` copies it to Selectel.
The site deploys by itself on push to `main`. Manual checks before a release: `docs/testing.md`.
