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

## Releases

Bump the version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`, then
`git tag vX.Y.Z && git push --tags`. GitHub Actions builds signed macOS, Windows and Linux installers and a draft
release with `latest.json` for updates. Secrets live only in GitHub Actions Secrets.

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
