# unslouch.health-diet.ru website

Static site built with Astro in the same 15 languages as the app: English at `/`, the others under `/<code>/`
(`/ru/`, `/de/`, `/pt-br/`, `/zh-cn/`...). No analytics, cookies, external fonts or
scripts. The exercise catalog, figures, desk calculator, sounds and app translations are imported from `../src`,
and the science, privacy and terms pages render `../docs/*.md` and `../legal/*.md` directly, so there is one
source of truth for the app and the site.

## Build and preview

Needs Node 22.12 or newer (see `.nvmrc`).

```sh
cd site
npm ci
npm run dev        # http://localhost:4321, live reload
npm run build      # static files in site/dist
npm run preview    # serve site/dist on http://localhost:4321
```

From the repository root the same is `npm run site:dev`, `npm run site:build`, `npm run site:preview`.

Russian text check (style sieve for machine-sounding phrases), after a build:

```sh
node scripts/extract-ru-text.mjs /tmp/ru.txt && python3 path/to/live-text-check/check.py /tmp/ru.txt
```

## Where things live

- `src/i18n/<code>.ts`: all site texts, `en.ts` is the source and defines the shape. To add a language, copy `en.ts`,
  register it in `src/i18n/index.ts` and in the sitemap `i18n` block of `astro.config.mjs`, add
  `../docs/science.<code>.md` (same headings in the same order: section anchors are taken by position) and a `<code>`
  object to every item of `../docs/sources.json`. Exercise names and health texts come from `../src/locales/*.json`.
  `npm run check:i18n` compares every dictionary with `en.ts`, checks sources.json and the science translations.
- Legal pages (privacy, terms, consent) exist in English and Russian only. Other languages show the English text
  with a notice, a canonical link to the English page, no hreflang and no sitemap entry.
- `/donate/`: CloudTips (Russian cards) and Boosty (any card). The desktop app links to `/<code>/donate/`.
- `src/pages/[...lang]/`: every page exists once and is generated for each language.
- `src/components/islands/`: interactive tools (React). `common.tsx` has the looping exercise card and the
  fullscreen break player.
- `src/lib/competitors.ts`: comparison data with the date and pages it was checked against. Unverified cells
  are `null` and stay empty.
- `src/styles/tokens.css`, `figures.css`: copied from `../src/styles.css`. Keep them in sync when the app palette or
  figure styles change.

## Deploy

`.github/workflows/site.yml` runs on every push to `main` that touches the site, `docs/`, `legal/` or the shared
app sources. It builds `site/dist` and uploads it to a Selectel S3 bucket with the AWS CLI
(endpoint `https://s3.ru-1.storage.selcloud.ru`). Hashed files in `_astro/` get a one-year immutable cache,
HTML, sitemap and robots get `no-cache`.

GitHub Actions secrets (Settings → Secrets and variables → Actions):

- `SELECTEL_S3_ACCESS_KEY`, `SELECTEL_S3_SECRET_KEY`: S3 keys of a service user with access to the bucket only;
- `SELECTEL_S3_BUCKET`: bucket name.

### One-time Selectel setup (done by the owner)

1. **Bucket.** Object storage → create a *public* bucket in `ru-1`, type "standard". Turn on website mode
   (static site hosting) with index document `index.html` and error document `404.html`, so `/tools/` serves
   `/tools/index.html`.
2. **Service user and S3 keys.** Access control → service user with the "object storage user" role limited to this
   bucket → issue S3 keys → put them into the GitHub secrets above.
3. **CDN resource.** CDN → create a resource with the bucket (its website endpoint) as the origin. Turn on
   "respect origin Cache-Control", gzip/brotli compression and HTTP → HTTPS redirect.
4. **Domain.** Add `unslouch.health-diet.ru` as a personal domain of the CDN resource. The DNS of
   `health-diet.ru` is on Selectel too: add the CNAME record `unslouch` there, pointing where the CDN resource says.
5. **HTTPS.** Issue a free Let's Encrypt certificate for the domain in the CDN resource settings (it renews itself).

After the first deploy, check `https://unslouch.health-diet.ru/sitemap-index.xml` and submit it to Google Search Console and
Yandex Webmaster.
