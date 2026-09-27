# unslouch.ru website

Static site built with Astro: English at `/`, Russian at `/ru/`. No analytics, cookies, external fonts or
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

- `src/i18n/en.ts`, `src/i18n/ru.ts`: all site texts. To add a language, copy `en.ts`, register it in
  `src/i18n/index.ts` and in the sitemap `i18n` block of `astro.config.mjs`. Exercise names and health texts come
  from `../src/locales/*.json`.
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
4. **Domain.** Add `unslouch.ru` (and `www.unslouch.ru` with a redirect to it) as
   a personal domain of the CDN resource, then create the CNAME records at the DNS provider as Selectel shows.
   For the apex domain use ALIAS/ANAME or the DNS provider's CNAME flattening.
5. **HTTPS.** Issue free Let's Encrypt certificates for every domain in the CDN resource settings.

After the first deploy, check `https://unslouch.ru/sitemap-index.xml` and submit it to Google Search Console and
Yandex Webmaster.
