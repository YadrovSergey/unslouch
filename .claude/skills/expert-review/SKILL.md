---
name: expert-review
description: Review a plan, the current diff, a PR or files of Unslouch through a panel of specialists (engineer, eye doctor, physiotherapist, coach, sleep doctor, occupational health, habit psychologist, medical editor and privacy, ordinary user, accessibility and translation). Use before implementing a plan, before a commit or release, or when asked to "check as a specialist / expert review / проверь как специалисты".
---

# Expert review for Unslouch

Unslouch tells people when to rest their eyes, stand up, move, breathe and stop work. A wrong exercise, a
pushy screen or a medical promise harms a real person, and a bug in the scheduler or the tray hangs their
computer. So every change is looked at by the specialists whose field it touches, not only by a programmer.

## 1. What to review

Arguments (`$ARGUMENTS`), first word:

- `plan <path>`: a plan file (Markdown). Review the idea, not code style.
- `diff` or nothing: uncommitted changes plus commits on this branch not in `main`
  (`git diff main...HEAD` and `git diff HEAD`). If both are empty, the last commit.
- `pr <n>`: `gh pr diff <n>` and `gh pr view <n>`.
- `files <paths…>`: these files as they are now.
- `all`: add anywhere to call every specialist, not only the matching ones.
- `--fix`: after the report, apply the findings the user agrees with. Without it, change nothing.

## 2. Gather context once

Read and keep short notes to pass to every specialist:

- `CLAUDE.md` (rules: no data collection, health wording, eye rule wording, Russian text rules, translations,
  tray deadlock rule, scheduler tests, changelog).
- The target (plan text or diff, with enough surrounding code to understand it).
- From `docs/science.ru.md` (or `.en.md`), the sections of body parts the change touches, with their
  "Когда к врачу" parts. The source list is `docs/sources.json`.
- For UI changes: the affected `src/locales/ru.json` and `en.json` keys.

## 3. Pick the specialists

The panel is in [experts.md](experts.md). Always call **engineer** for code and **user** for anything a person
sees. Add the others when the change touches their field:

| Change touches | Specialists |
|---|---|
| eyes, far look, blink cue, screen brightness, 20 s rule | eye |
| exercises (`src/exercises*`, gallery), neck, back, hands, legs, posture cue | physio, coach |
| movement / long breaks, durations, intervals, presets, streaks, achievements | coach, occupational |
| end of day, work hours, evening, breathing, night shifts, notifications late in the day | sleep |
| break schedule, idle detection, natural breaks, focus mode, calls, fullscreen | occupational, engineer |
| skip / postpone / done buttons, reminders, stats, wellbeing questions, achievements, wording that motivates | habit |
| any health text, `docs/science.*`, site pages, store texts, changelog, `legal/*`, network, files on disk | editor |
| UI layout, colours, keyboard, new strings, locales | a11y |

Call at most 6 at once (one message, several Agent calls, they run in parallel). With `all`, call the rest in a
second wave.

## 4. Brief each specialist

Use the Agent tool (`subagent_type: general-purpose`, read-only work). Prompt for each:

1. The specialist's role and checklist from `experts.md`, verbatim.
2. What is reviewed (plan path or diff command, or the text pasted in) and the notes from step 2.
3. "Read whatever code or docs you need. Do not edit files. Stay in your field; say 'not my field' rather
   than guess. Every health claim you make needs a source (guideline, review or trial) or is marked as your
   professional opinion."
4. Output format:

```
### <Specialist>
Verdict: ok | ok with changes | needs rework
- [blocker|major|minor|idea] <where: plan section or file:line> — <what is wrong, for whom, what happens>.
  Fix: <concrete change>. Source: <if a health claim>.
What is good: <1-3 lines, only what should not be lost>
```

## 5. Bring it together

Write the report in the user's language (Russian for this user):

1. One line per specialist: verdict.
2. Blockers and major findings, merged when several specialists say the same, ranked. Mark who raised each.
3. Disagreements between specialists (e.g. coach wants harder, physio safer): state both and recommend one.
4. Minor findings and ideas, short.
5. For code: also run `npm test`, `npx tsc --noEmit`, `npm run check:locales`, and for changed Russian texts
   `python3 ~/develop/mzr_js_app/.claude/skills/my-live-text-check/check.py <file>`; report failures with output.

Check findings before you report them: drop those that contradict the code or the project rules, and say
which you dropped and why. Do not edit anything unless `--fix` was given; then apply only what the user
accepted and run the checks again.
