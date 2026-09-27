# Security Policy

> По-русски: об уязвимостях пишите на support@health-diet.ru, не в открытые Issues.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.
Email **support@health-diet.ru** instead, with:

- what the problem is and where (app version, OS);
- steps to reproduce or a proof of concept;
- what an attacker could do with it.

We will reply within a few days, keep you informed while we fix it, and credit you in the
release notes if you wish.

## Supported versions

Only the latest release receives security fixes. Please update before reporting.

## Scope

Unslouch runs locally, has no accounts and no backend. The only network request it makes on its
own is the update check (`latest.json` from our CDN, with the GitHub releases page as a fallback). Issues of particular interest:

- anything that lets another program or website read the local data files
  (`settings.json`, `stats.json`, `wellbeing.json`, `usage.json`);
- tampering with the update check or update delivery;
- the app accessing more than it declares (for example, window titles, camera or microphone
  contents). See [legal/privacy.en.md](legal/privacy.en.md) for what the app is supposed to do.
