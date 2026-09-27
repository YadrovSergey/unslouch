# Unslouch · Засиделся

A free, open-source app for people who spend the whole day at a computer. It reminds you to look into the
distance, blink, stand up, stretch your neck, shoulders and hands, and drink water, following what research
and doctors recommend. macOS, Windows and Linux. 15 languages. No accounts, no ads, no data collection.

[Русский ниже](#засиделся)

## What it does

- **Micro-break every 20 minutes, about half a minute.** One short exercise (blinking, hands or neck, in turn),
  then look more than 6 metres away for 20 seconds. A soft chime tells you when to look back.
- **Stand up every 45 minutes, 3 minutes.** A back exercise, a legs exercise, a short walk, water.
- **Gentle cues with no windows to close.** The screen edges darken for a second to remind you to blink.
  A small banner asks you to change position. A corner card reminds you to drink water.
- **Once a day, if you want.** Two minutes for neck and shoulders, a minute of slow breathing, an end-of-day
  reminder.
- **Doesn't get in the way.** Reminders wait during calls (when another app uses the camera or microphone),
  in fullscreen video, in Do Not Disturb, outside work hours, and during Focus 25/50. Being away counts as a break.
- **Statistics.** Time at the computer, the longest stretch of sitting, streaks, a year heatmap, achievements,
  a weekly self-check for eyes, neck, back and hands, and time per program (program names only).
- **Honest health texts.** Every section has "Why this", its sources and "when to see a doctor".
  See [docs/science.en.md](docs/science.en.md).

Presets: Recommended, Pomodoro (25/5), Hourly, Custom.

## Privacy

Nothing leaves your computer. No analytics, telemetry, crash reports or accounts. The only network request
is the daily update check, and you can turn it off. Details: [legal/privacy.en.md](legal/privacy.en.md).

The app does not treat anything and does not replace a doctor: [legal/terms.en.md](legal/terms.en.md).

## Development

Requirements: Node 20, Rust (`rustup`). Linux also needs `libwebkit2gtk-4.1-dev libayatana-appindicator3-dev libxss-dev`.

```sh
npm install
npm run hooks                         # secret scan before every commit (needs `brew install gitleaks`)
UNSLOUCH_FAST=1 npm run tauri dev     # one settings minute = 5 seconds, handy for testing
npm test                              # translations + Rust tests (scheduler, usage, settings, i18n)
npm run tauri build                   # installer for the current OS
```

Browser previews without the Rust side: `npx vite` and open
`http://localhost:1420/index.html?view=gallery&lang=en` (all exercises, animated).

Code map:

- `src-tauri/src/scheduler.rs`: when to show which break or cue. Pure logic, covered by tests.
- `src-tauri/src/lib.rs`: tick once a second, tray menu, statistics, commands for the interface.
- `src-tauri/src/overlay.rs`: break windows on every monitor, gentle cues.
- `src-tauri/src/{fullscreen,calls,dnd,frontmost}.rs`: system state per OS.
- `src-tauri/src/usage.rs`: time per program.
- `src/exercises/`: the exercise catalog and the animated figure, hand and eye.
- `src/views/`: break screen, cues, settings window.
- `src/locales/`: translations. The tray menu reads the same files.

## Releases and deploy

Everything is built and published by GitHub Actions. Nothing is uploaded from a developer machine.

| Workflow | When it runs | What it does |
|---|---|---|
| `ci.yml` | push to `main`, pull requests | translations check, type check, Rust tests, debug build on macOS, Windows, Linux |
| `secrets.yml` | every push | gitleaks scan of the history |
| `release.yml` | a pushed tag `v*` | signed installers for all platforms, a **draft** GitHub release with `latest.json` for updates |
| `cdn.yml` | a release is published (not a pre-release) | copies the installers and `latest.json` to Selectel, rewrites download links to the CDN |
| `site.yml` | push to `main` touching `site/`, `docs/`, `legal/`, shared `src/` code; or by hand | builds the website and uploads it to Selectel |

### Releasing a new version

1. Bump the version in three places: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
2. Go through [docs/testing.md](docs/testing.md) (manual checks on macOS, Windows, Linux).
3. Commit, then `git tag vX.Y.Z && git push && git push --tags`.
4. Wait for **Release** in Actions (about 20 minutes). A draft release appears with `.dmg`, `.exe`, AppImage,
   `.deb`, `.rpm`, signatures and `latest.json`.
5. Open the draft, write what's new, press **Publish**. `cdn.yml` then copies the files to Selectel and
   installed apps see the update within a day.

### Secrets (GitHub → Settings → Secrets and variables → Actions)

Values are kept by the maintainer outside the repository. Names:

| Secret | What for |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | signs updates; the public key is in `tauri.conf.json`. **If the private key is lost, installed apps can no longer update.** |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | Developer ID Application certificate (.p12, base64) |
| `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID` | which certificate and team sign the macOS build |
| `APPLE_ID`, `APPLE_PASSWORD` | notarization (an app-specific password, not the account password) |
| `SELECTEL_S3_ACCESS_KEY`, `SELECTEL_S3_SECRET_KEY`, `SELECTEL_S3_BUCKET` | uploads of the website and installers |

Variable (not a secret): `CDN_BASE_URL`, the public address of the bucket; download links in `latest.json` point there.

Things with an expiry date:

- the Developer ID certificate is valid until February 2027. Issue a new one from the same certificate signing
  request, rebuild the `.p12`, update `APPLE_CERTIFICATE` and `APPLE_CERTIFICATE_PASSWORD`;
- the app-specific password lives until it is revoked on account.apple.com.

The Windows installer is not code-signed yet: SmartScreen asks "More info → Run anyway". SignPath Foundation
signs open-source projects for free, that's the next step.

### Website

`site/` (Astro, Node 22.12+). It goes live by itself after a push to `main`; to redeploy by hand use
**Actions → Site → Run workflow**. Without the Selectel secrets the workflow only builds. Details and the one-time
Selectel setup: [site/README.md](site/README.md).

Selectel bucket `unslouch` (region ru-1) is public and in website mode (`/index.html`, error page `/404.html`).
The site deploy never deletes `releases/`, where `cdn.yml` keeps the installers.

When the domains `unslouch.app` and `zasidelsya.ru` are connected to the Selectel CDN:

1. set the `CDN_BASE_URL` variable to `https://unslouch.app`;
2. check the update endpoints in `src-tauri/tauri.conf.json` (the first one is `https://unslouch.app/releases/latest.json`,
   GitHub releases is the fallback);
3. switch `RU_ORIGIN` in `site/src/i18n/index.ts` and the TODO in `site/astro.config.mjs` to `https://zasidelsya.ru`.

## Contributing

Translations and fixes are welcome: [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

## License

MIT. Third-party components: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

---

# Засиделся

Бесплатное приложение с открытым кодом для тех, кто весь день за компьютером. Напоминает смотреть вдаль, моргать,
вставать, разминать шею, плечи и кисти, пить воду. Всё по рекомендациям врачей и исследованиям. macOS, Windows и
Linux, 15 языков. Без аккаунтов, без сбора данных.

- **Каждые 20 минут микропауза на полминуты:** одно короткое упражнение (моргание, кисти или шея по очереди), потом
  20 секунд смотреть дальше 6 метров. Тихий звук скажет, когда можно вернуться к экрану.
- **Каждые 45 минут встать на 3 минуты:** упражнение для спины, упражнение для ног, пройтись, выпить воды.
- **Тихие сигналы без окон:**
  - края экрана на секунду темнеют: пора моргнуть;
  - плашка сверху просит сменить позу;
  - карточка в углу напоминает о воде.
- **Раз в день по желанию:** две минуты для шеи и плеч, минута медленного дыхания, напоминание о конце рабочего дня.
- **Не мешает.** Напоминания ждут:
  - на созвоне;
  - при видео на весь экран;
  - в режиме «Не беспокоить»;
  - вне рабочего времени;
  - в «Фокусе».

  Если отошли от компьютера, это считается перерывом.
- **Статистика:**
  - время за компьютером и самый долгий отрезок сидя;
  - серии дней, карта года, достижения;
  - самочувствие по неделям;
  - время по программам (только названия).
- **Честные тексты о здоровье:** у каждого раздела «Зачем это», источники и «когда к врачу».
  Подробно: [docs/science.ru.md](docs/science.ru.md).

Мы не собираем никаких данных: [политика конфиденциальности](legal/privacy.ru.md).
Приложение не лечит и не заменяет врача: [условия использования](legal/terms.ru.md).


## Как выпустить новую версию и выложить сайт

Всё собирает и выкладывает GitHub Actions, с компьютера ничего загружать не нужно.

**Новая версия приложения:**

1. Поднять версию в трёх файлах: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`.
2. Пройти ручные проверки из [docs/testing.md](docs/testing.md) на macOS, Windows и Linux.
3. Закоммитить и отправить тег: `git tag vX.Y.Z && git push && git push --tags`.
4. Подождать, пока в Actions пройдёт **Release** (около 20 минут). Появится черновик релиза:
   `.dmg`, `.exe`, AppImage, `.deb`, `.rpm`, подписи и `latest.json`.
5. Открыть черновик, написать, что нового, нажать **Publish**. После этого `cdn.yml` сам скопирует файлы
   в Selectel, а установленные приложения увидят обновление в течение суток.

**Сайт** выкладывается сам после push в `main`, если менялись `site/`, `docs/`, `legal/` или общий код
упражнений и переводов. Выложить вручную: **Actions → Site → Run workflow**. Подробности в
[site/README.md](site/README.md).

**Секреты** хранятся в GitHub (Settings → Secrets and variables → Actions), их значения у владельца вне
репозитория. Список и назначение каждого есть в таблице выше, в английском разделе «Secrets».

**Что нужно продлевать:**

- сертификат Developer ID действует до февраля 2027. Выпустить новый по тому же запросу, собрать `.p12`
  и обновить секреты `APPLE_CERTIFICATE` и `APPLE_CERTIFICATE_PASSWORD`;
- ключ подписи обновлений не продлевается, но его нельзя терять: без него установленные приложения
  больше не смогут обновиться.

**Когда подключим домены** `unslouch.app` и `zasidelsya.ru`:

1. поменять переменную `CDN_BASE_URL` на `https://unslouch.app`;
2. проверить адреса обновлений в `src-tauri/tauri.conf.json`;
3. переключить `RU_ORIGIN` в `site/src/i18n/index.ts` на `https://zasidelsya.ru`.
