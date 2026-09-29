# Unslouch Privacy Policy

Effective: 29 September 2026.

In short: the app sends nothing about you to us or to anyone else. There are no accounts, ad
networks, analytics, telemetry or crash reports. Everything the app remembers is stored in files
on your computer, and only you can delete it.

The app's website has a Yandex Metrica counter. It loads as soon as you open the site, and you can
turn it off with "Decline" in the cookie notice. Details in "The website" below.

Unslouch (called «Засиделся» in Russian) is free and open source (MIT licence). Its author and
rights holder is Sergey Yadrov, a private individual, referred to below as "we".

## What we receive about you

Nothing. We do not receive or process your personal data: no name, no email, no device
identifiers, no usage statistics. The app does not ask who you are and does not report how
you use it.

The one exception: if you write to us by email or in GitHub Issues, we see what you sent.
We use your messages only to reply.

## What the app stores on your computer

The app keeps your settings and statistics so it can show them to you. These files are never
sent anywhere.

| File | Contents |
|---|---|
| `settings.json` | your settings: intervals, enabled reminders, work hours, language, and your own reminders with their text (for example, "pills"), times and days |
| `stats.json` | breaks per day, time at the computer, longest sitting stretch, glasses of water. Streaks and achievements are calculated from this on the fly and not stored separately |
| `wellbeing.json` | your self-ratings (0 to 3) for eyes, neck, back and hands by day, and the notes you write to them |
| `usage.json` | time per program: only the name of the program in the active window |

Where the files live:

- macOS: `~/Library/Application Support/ru.health-diet.unslouch`
- Windows: `%APPDATA%\ru.health-diet.unslouch`
- Linux: `~/.config/ru.health-diet.unslouch`

### Time per program

The app records only the name of the program whose window is active, for example "Firefox" or
"Slack". It does not read or store window titles, website addresses, document names or anything
inside the window.

In settings you can:

- turn time per program off completely;
- exclude specific programs;
- delete the recorded history.

### Export and import

You can export all your data to one file and import it back: settings with your own reminders, statistics,
wellbeing ratings with notes and time per program. The file is saved wherever you choose and is not sent anywhere else.
If you share it, remember it contains all of the above.

## How to delete everything

- Program history can be erased in settings.
- To delete everything, quit the app and delete the folder listed above. Uninstalling the app
  may leave this folder in place, so remove it by hand.

## Network requests the app makes

There are two kinds, and no others.

1. **Update check.** A minute after start and then once a day the app downloads a `latest.json`
   file from our file delivery server (a CDN run by Selectel) to find out whether a new version is
   out. If our server does not answer, the same file is taken from the GitHub releases page. If a
   version is out, the app shows a menu item, and the installer is downloaded only when you click it.
   The request contains nothing about you beyond what any server inevitably sees: your IP address
   and the time of the request. You can turn update checks off in settings.
2. **Links you click.** For example to the app's website, a study or GitHub. They open in your
   browser, and only after you click.

For users whose interface language is Russian, Ukrainian, Kazakh, Belarusian, Uzbek, Armenian,
Georgian or Azerbaijani, the app shows a small card for the food diary "Мой здоровый рацион"
(health-diet.ru). The card is built into the app and loads nothing by itself. The website opens
only if you click it.

## The website

The unslouch.health-diet.ru website is served by Selectel's CDN. Like any hosting provider,
Selectel keeps standard technical request logs (IP address, time, requested file, browser).
We do not analyse them or use them to identify you.

**Visit statistics.** To understand which pages and tools are useful, the site has a Yandex Metrica
counter. This is the site owner's decision: the counter runs until you turn it off.

- The counter loads on every page you open, before you have answered the notice. Metrica sets
  cookie identifiers (for example `_ym_uid`, `_ym_d`, `_ym_isad`) and receives your IP address,
  browser and device details, pages viewed, the referring site, visit time and actions on the page:
  clicks, scrolling, link clicks and downloads.
- Until you answer, a notice at the bottom of every page explains this. "OK" closes the notice, and the counter keeps running.
- "Decline" turns the counter off: the site remembers your choice, removes the Metrica cookies from
  its own domain and reloads the page, and the counter is not loaded after that. Data Metrica
  received before you declined stays with Metrica. The choice is stored in this browser; in another
  browser or after clearing the site data the notice appears again.

The data is processed by Yandex LLC as the owner of Yandex Metrica and stored in Russia. We see only
aggregate statistics and do not use them for advertising. The terms are in a separate document:
[consent to the processing of personal data](consent.en.md).

You can also decline later: "Cookies and statistics" at the bottom of any page opens the same notice.

**What else the site stores in your browser.** Your chosen theme, language and your answer
to the cookie notice, and in the free tools their settings. These are browser storage entries
(localStorage), not cookies; they are not sent anywhere and cannot identify you.

## Donations

If you choose to support the project, the payment happens on the CloudTips page (T-Bank). Card and
payment details are processed by CloudTips and the banks under their own rules; we do not receive them.
We only see the amount and your comment, if you leave one.

## Other websites

When you follow a link to another site, that site's rules apply. For example, health-diet.ru may
use Yandex Metrica, and GitHub collects data under its own privacy policy. We have no control
over this.

## Permissions and why they are needed

- **Autostart.** So the app starts with your system. Asked on the first-run screen, can be turned
  off in settings.
- **Notifications.** Only on Linux with Wayland: there the gentle cues (blink, change position,
  water) are shown as system notifications, because a transparent always-on-top window is not
  available.
- **Call detection.** To avoid showing a break in the middle of a call, the app checks whether
  another program is currently using the camera or microphone. The app never turns on the camera
  or microphone itself and receives no image or sound. On Linux it reads process information from
  `/proc` and the list of audio streams via `pactl` for this.
- **Do Not Disturb and fullscreen apps.** The app checks whether Do Not Disturb is on, where the
  system allows this to be read, and whether a fullscreen window is open, so it can hold the break.
  For this it reads the Focus modes file `~/Library/DoNotDisturb/DB/Assertions.json` on macOS, the
  notification settings in the registry on Windows, the GNOME setting via `gsettings` and the active
  X11 window properties on Linux. Only "on or off" is read, nothing is stored.
- **Active window.** To track time per program the app reads the name of the program in the
  active window. If tracking is off, it does not.

All these checks happen on your computer, and their results are not sent anywhere.

## Data protection law (GDPR, Russian Federal Law 152-FZ)

**The app.** We do not receive or process personal data of the app's users. The settings and
statistics files are created and stored on your device, and we have no access to them.

**The website.** Until you decline statistics, the data controller under the GDPR (and the personal
data operator under Russian Federal Law No. 152-FZ "On Personal Data") is Sergey Yadrov. Legal
basis: your consent, given by continuing to use the site after the notice (Article 6(1)(a) GDPR,
Article 6(1)(1) of 152-FZ). Processor: Yandex LLC
(Yandex Metrica). The data is processed in Russia.

You have the right to know what data about you is processed, to have it corrected, restricted or
erased, and to withdraw your consent. Write to support@health-diet.ru; we answer within 10 working
days. You can also withdraw consent on the site itself: "Cookies and statistics" at the bottom of
any page, then "Decline". If you are in the EU, you may also complain to your data protection authority.

If you email us, we use your address and message only to reply and do not pass them on to
third parties. Ask us to delete the correspondence and we will.

## Children

The app is not designed specifically for children and learns nothing about a user's age.
The app sends us no data at all. Website statistics are aggregate, and we do not learn visitors' ages.

## Changes

If this policy changes, we will update the date at the top. All previous versions are visible
in the repository history on GitHub: https://github.com/YadrovSergey/unslouch

## Contact

- Email: support@health-diet.ru
- GitHub Issues: https://github.com/YadrovSergey/unslouch/issues
