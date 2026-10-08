# Changelog

Everything noticeable that changes in Unslouch. Russian version: [CHANGELOG.ru.md](CHANGELOG.ru.md).

## Unreleased

- Fixed: after "Keep working" on the "Work day is over" screen, breaks and cues stopped until morning. Now they go on all evening, until the next work day starts.

## 0.1.15 · 6 October 2026

- After "Done" a short summary appears at the bottom of the screen for a few seconds. After an eye or breathing break it's one line: breaks today. After the neck minutes or a stand-up break there's more, at most three times a day: neck minutes this week, days to the next step, how many times you stood up today. If your evening answers show something bothers you less, the summary says so. Turn it off right on it or in the settings.
- Fixed: on Mac, after an update from the menu the app closed and didn't start again, so you had to open it by hand. The fix takes effect from the next update on.

## 0.1.14 · 6 October 2026

- After a break the app asks "Did it work out?": "Done" (or Enter) or "Not this time" (or Esc). Only what you mark goes into the statistics, so the numbers may drop, but they show what you really did. With no answer in 5 minutes, the break is recorded as "Away". You can turn the question off in the settings.
- If you step away from the computer, a break no longer opens in an empty room. If you were away for more than two minutes and longer than the break lasts, the absence counts as rest and the timer starts over, though it is not counted as done. If not, the break comes when you are back.
- The wellbeing questions come every evening at the end of the work day instead of once a week. One tap on "Nothing bothers me" answers them, and rows that were fine or a little yesterday come preselected. You can switch back to weekly in the settings, and if you put the questions off several times in a row, the app offers it. The questions are gone from the break screen.
- New tray item: "How was your day?".
- New "Result" page in the statistics: breaks of each kind done, time spent on them, days with neck minutes, and how you felt week by week. After six weeks with answers, it compares weeks with more and fewer breaks.
- If your eyes, neck, back or wrists keep bothering you, a hint after your answer says when to see a doctor.
- Neck minutes or breathing missed because you were away come back once later that day.
- Each dot in the wellbeing chart now shows a number: not everyone can tell the colors apart.
- The 2-minute neck routine grows with you: done regularly, it adds a few repetitions, and the screen suggests holding an elastic band or a bottle of water.
- Neck minutes and the breathing minute follow your shift: on a night shift they come two and six hours into it, not at its start.
- The longest sitting stretch is counted more honestly: when you step away, the stretch ends when you left, not when you came back.
- Fixed: "Statistics" in the menu opened only on the second click.

## 0.1.13 · 29 September 2026

- Fixed: the blink cue darkened only part of the screen without its label, and the screen flashed at first. The edges now darken across the whole screen, smoothly.

## 0.1.12 · 29 September 2026

- Fixed: the blink and posture cues didn't appear on Mac, only their sound played.

## 0.1.11 · 29 September 2026

- In statistics, the "usual working day" time no longer spills out of its tile.
- Start and end of work show for days before the update too: they come from time per program, to the hour.
- "Wellbeing" and "Journal" are one tab now: the chart on top, the entries under it.

## 0.1.10 · 29 September 2026

- An own reminder card no longer disappears when a break or a blink cue comes: it hides during the break and comes back.
- Own reminders wait during a call, Do Not Disturb, focus, a pause or fullscreen.
- A reminder just added doesn't go off at once if its time today has already passed.
- "Show" on an own reminder no longer shifts its real schedule.
- The "every N minutes of work" counter starts again each day.
- The wellbeing journal warns when the chosen day already has an entry.
- Own reminders "every N minutes of work" count only time at the computer: away for lunch, the counter waits. Intervals go up to 4 hours, or type your own number of minutes.

## 0.1.8 · 29 September 2026

- Your own reminders: pills, lunch or anything else, at set times on chosen days or every few minutes. A card appears in the corner with "Done" and "In 10 min".
- Statistics for a week, a month, 3 months and a year: time at the computer by day, your usual working day, start and end of work, breaks by day.
- Time per program for a month and 3 months too.
- A wellbeing journal: add an entry for any day, fix or delete it, add a note.
- Settings are split into pages: breaks, body, cues, reminders, schedule, general. It used to be one long page.
- About has the changelog.

## 0.1.7 · 29 September 2026

- Fixed a sharp screen flash when a gentle cue appeared: the edges now darken smoothly.
- The food diary card is no longer on the Settings tab; it stays in About.

## 0.1.6 · 28 September 2026

- "Check for updates" in the tray menu answers in a window: it offers the update or says you have the latest version.
- While updating, the menu shows how much is downloaded. If the install fails, a window explains it.
- The blink cue is easier to notice. Settings let you choose how long it stays: 2 to 10 seconds, 4 by default.
- A "Sound" option for the gentle cues: blink, posture, water. Off by default.
- A "Show" button next to each gentle cue in the settings, to see right away what it looks like.

## 0.1.3 · 28 September 2026

- About tells why I made Unslouch.
- Break screens have a "Say thanks" button in the top right corner. It opens the support page and puts the break off for a few minutes.

## 0.1.2 · 28 September 2026

- "Check for updates" in the tray menu.
- A "Say thanks" button in the settings window and the tray menu.
- About has "Found a bug?" and "Write to the author".
- The breathing circle no longer spills out of its card.

## 0.1.0 · 28 September 2026

The first version.

- Every 20 minutes a short break: one exercise for the eyes, hands or neck, and 20 seconds of looking more than 6 metres (20 feet) away.
- Every 45 minutes a reminder to stand up: exercises for the back and legs, a short walk, some water.
- Gentle cues without windows: blink, change position, drink water.
- Stays quiet during calls, fullscreen video and outside working hours.
- Statistics, time per program, 15 languages. No data is sent anywhere.
