# Contributing to Unslouch

Thanks for helping. Russian version below.

## Translations

- Texts live in `src/locales/<code>.json` (for example `de.json`, `pt-BR.json`). Russian (`ru.json`)
  is the source language.
- To fix a translation, edit the file and open a pull request. Not comfortable with Git? Open a
  "Translation" issue instead.
- To add a language, copy `en.json` to `src/locales/<code>.json` and translate the values, keeping
  the keys unchanged.
- Run `npm run check:locales` before sending: it verifies that all languages have the same keys.
- The app is called «Засиделся» in Russian and "Unslouch" in every other language.

## Code

Requirements: Node 20 and Rust (`rustup`).

```sh
npm install
UNSLOUCH_FAST=1 npm run tauri dev   # one settings minute = 5 seconds
npm test                            # locale check + scheduler tests
npx tsc --noEmit                    # type check
```

- Keep pull requests small and focused. Describe what changes for the user.
- Make sure `npm test` and `npx tsc --noEmit` pass.
- Do not add analytics, telemetry, crash reporting or any network request beyond the update
  check. See [legal/privacy.en.md](legal/privacy.en.md). A change that needs a new request must
  update the privacy policy in the same pull request.

## Health texts

Any text about eyes, posture, exercises, water or breathing must follow these rules:

- Say "reduces discomfort" or "reduces fatigue". Never "treats", "prevents carpal tunnel",
  "prevents thrombosis" or "fixes posture".
- Do not promote blue-light glasses.
- No neck circles. Nothing done through pain.
- Include when to see a doctor where it applies.
- The distance-gaze rule is written as "every 20 minutes, 20 seconds, more than 6 metres
  (20 feet)". In Russian: «20 минут, 20 секунд, 6 метров», without feet and without "20-20-20".
- Back every claim with a source listed in [docs/science.en.md](docs/science.en.md) /
  [docs/science.ru.md](docs/science.ru.md). New source? Add it there in the same pull request,
  with an honest note on how strong the evidence is.

## Code of Conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

---

# Как помочь проекту

## Переводы

- Тексты лежат в `src/locales/<код>.json`. Исходный язык русский (`ru.json`).
- Нашли ошибку в переводе: поправьте файл и пришлите pull request. Если с Git неудобно,
  откройте issue «Translation».
- Новый язык: скопируйте `en.json` в `src/locales/<код>.json` и переведите значения,
  ключи не меняйте.
- Перед отправкой запустите `npm run check:locales`: он проверяет, что во всех языках
  одинаковые ключи.
- По-русски приложение называется «Засиделся», на всех остальных языках Unslouch.

## Код

Нужны Node 20 и Rust. Перед pull request должны проходить `npm test` и `npx tsc --noEmit`.
Аналитику, телеметрию, отчёты о сбоях и новые сетевые запросы не добавляем. Если без нового
запроса никак, в том же pull request обновите политику конфиденциальности.

## Тексты о здоровье

- Пишем «уменьшает дискомфорт», «снижает усталость». Не пишем «лечит», «предотвращает
  туннельный синдром», «предотвращает тромбоз», «исправляет осанку».
- Очки с фильтром синего света не советуем.
- Никаких круговых движений головой. Ничего через боль.
- Где уместно, пишем, когда идти к врачу.
- Правило про взгляд вдаль по-русски: «20 минут, 20 секунд, 6 метров». Без футов и без «20-20-20».
- Каждое утверждение опирается на источник из [docs/science.ru.md](docs/science.ru.md).
  Новый источник добавляйте туда в том же pull request и пишите, насколько сильны доказательства.
