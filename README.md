# NorMech

**NorMech** — Normalization Mechanism dataset annotation. A scholarly
two-sided application for the close annotation of meme imagery. The
**admin** side lets a curator build datasets from a public Google Drive
folder, generate access keys, and review reader marks. The **annotator**
side is a public, key-gated reading flow where named readers mark each
image with one of four harm-source labels and export their work as a
CSV.

The whole project is built on Next.js 14 (App Router) + Supabase, with a
deliberate "archivist's lab notebook" aesthetic — paper backgrounds, ink
type, vermilion accents, hairline rules, motion-aware micro-interactions.

---

## Quick start (local)

```bash
# 1. Install deps
npm install

# 2. Configure env
cp .env.example .env.local      # then fill in Supabase + SESSION_SECRET

# 3. Set up the database
#    In the Supabase SQL editor, run:
#      supabase/schema.sql
#      supabase/migrations/001_users_case_insensitive.sql
#      supabase/migrations/002_perf_indexes.sql

# 4. Start the dev server
npm run dev
# → http://localhost:3000
```

The two entrances on the title page are:

- `/admin` — protected by an admin password (set via `ADMIN_PASSWORD` in
  `.env.local`).
- `/annotate` — protected by a per-dataset access key generated in the
  admin dashboard.

---

## Production

```bash
# Single command: build, then start the optimized server
npm run prod
# → http://localhost:3000
```

Or with Docker:

```bash
# Development (default profile)
docker compose up web

# Production (optimized build, hot-reload off, ~5–10x faster runtime)
docker compose --profile prod up web-prod
```

The dev and prod profiles both use **named volumes** for `node_modules` and
the `.next` cache, so they survive container restarts and image rebuilds.
Anonymous volumes were getting wiped, causing every restart to `npm install`
~600 packages from scratch.

---

## Deploying to Vercel

The app is Vercel-ready out of the box — `next.config.js` has no
`output: 'standalone'`, no Edge runtime, and no hardcoded localhost
in client code, so a straight Vercel import with the env vars below
will build and serve.

### One-time setup

1. **Push to GitHub** (the remote is already wired to
   `github.com/darkEye-2021831014/NorMech`):

   ```bash
   git push origin main
   ```

2. **Import in Vercel**: Dashboard → **Add New → Project → Import**
   the `darkEye-2021831014/NorMech` repo. Vercel auto-detects
   Next.js 14. Don't change the build command, output directory, or
   install command.

3. **Set the environment variables** before clicking **Deploy**
   (Project → Settings → Environment Variables, one per row):

   | Variable                    | Required | Where to get it |
   |-----------------------------|----------|-----------------|
   | `SUPABASE_URL`              | yes      | Supabase → Project Settings → API |
   | `SUPABASE_SERVICE_ROLE_KEY` | yes      | Supabase → Project Settings → API (long JWT starting with `eyJ…`) |
   | `ADMIN_PASSWORD`            | yes      | Any strong string you'll type into the admin login form |
   | `SESSION_SECRET`            | yes      | 32+ random chars — e.g. `openssl rand -base64 48` or `node -e "console.log(crypto.randomBytes(48).toString('base64url'))"` |
   | `NEXT_PUBLIC_SITE_URL`      | optional | Leave blank for the first deploy, set to `https://<your-app>.vercel.app` afterwards, then redeploy |

   Scope each variable to **Production** (and **Preview** too if you
   want preview deploys to work).

4. **Click Deploy.** First build takes ~2–3 minutes. Vercel prints
   the production URL on success.

5. **Set the public URL** (one-time): after the first deploy,
   edit `NEXT_PUBLIC_SITE_URL` to the real URL and trigger
   **Redeploy** so the OpenGraph `metadataBase` is correct.

6. **Smoke test**: open the URL, log in to `/admin` and to
   `/annotate`, mark one image, confirm "Saved." appears, then:

   ```bash
   curl https://<your-app>.vercel.app/api/health
   ```

   Expect `200 {"ok":true,"db":"ok","latencyMs":<100,"version":"0.1.0"}`
   in under a second.

### UptimeRobot keepalive (recommended)

Supabase pauses free-tier projects after ~7 days of **database**
inactivity — Vercel HTTP traffic alone doesn't count, only real
Postgres queries. The app exposes `/api/health`, which runs a cheap
`head: true` count against the `datasets` table on every request.
Point a free UptimeRobot HTTPS monitor at it (5-minute minimum
interval) and you're done.

- **Monitor type:** HTTPS
- **URL:** `https://<your-app>.vercel.app/api/health`
- **Interval:** 5 minutes (free-tier minimum)
- **Alert on:** non-200 response (the route returns 503 with
  `{ok:false, db:"error"|"unreachable", message:…}` on failure)

### Redeploying

- **Code change** → `git push origin main`. Vercel auto-builds a
  new Production deployment for every push to `main`.
- **Env-var change only** → Project → Settings → Environment
  Variables → edit the var → Deployments → ⋮ → **Redeploy** (you
  can keep "Use existing Build Cache" checked; env vars are read at
  runtime, not at build time).

---

## Architecture

```
src/
  app/
    page.tsx                      Title page with the two entrances
    admin/
      login/                      Admin password form (server-component
                                  page, client-component form)
      (protected)/                Server-guarded admin dashboard
    annotate/
      login/                      Access-key + name form
      (protected)/                Server-guarded annotator
        AnnotatorClient.tsx       The annotator UI (centerpiece)
    api/
      admin/login                 POST → JWT cookie (role: admin)
      annotate/                   POST login, PUT annotation, GET csv
      image/[imageId]             GET → server-side Drive proxy
  lib/
    session.ts                    jose JWT, server-only
    supabase.ts                   Service-role Supabase client (singleton)
    admin-actions.ts              Dataset CRUD
    annotator-actions.ts          Annotator server helpers
    drive.ts                      Google Drive folder HTML scraper
    rate-limit.ts                 In-memory token-bucket rate limiter
  middleware.ts                   /admin, /annotate, /api/image guards
  components/ui/                  Design-system primitives
supabase/
  schema.sql                      Tables, RLS
  migrations/001_…                Case-insensitive (dataset_id, name)
  migrations/002_…                Performance indexes
```

### Drive image serving

The annotator never talks to Drive directly. It requests
`/api/image/{imageId}`, which:

1. Resolves the `file_id` from the database.
2. Tries `lh3.googleusercontent.com/d/{id}=w1600` (fastest, most reliable).
3. Falls back to `lh3=…=w1200`, then `drive.usercontent.google.com`.
4. Validates the response is an `image/*` and ≤ 8 MB.
5. Streams the bytes back with `ETag` + `Cache-Control: private,
   max-age=86400, must-revalidate` so the browser reuses the image for
   back-and-forth navigation, but doesn't share it across users.

Auth is enforced by middleware (any valid session cookie is accepted — both
admin and user roles can load images, e.g. for a future curator preview).

### Auth

- `jose` HS256, 7-day expiry, httpOnly + sameSite=lax + secure (in prod).
- Stored cookie name: `ma_session`.
- Admin password is `ADMIN_PASSWORD` (constant-time compare).
- Annotator "login" is registration-on-first-use: same name + key always
  resumes the same reader, with case-insensitive name matching at the DB
  level (`001_users_case_insensitive.sql`).

---

## Performance notes

- All server components are `force-dynamic` — there's no static caching
  to worry about, and the JWT cookie means every request is per-user.
- The hot read paths (annotator dashboard, admin ledger) use
  `Promise.all` for parallel Supabase queries.
- The Supabase service-role client is a module-level singleton
  (`getSupabaseAdmin()` in `lib/supabase.ts`).
- The image proxy does content-type validation, an 8 MB cap, and
  ETag revalidation to avoid re-downloading unchanged images.
- Composite indexes for `(dataset_id, position)` on `images` and
  `(user_id, image_id)` on `annotations` (see migration 002).

---

## Environment variables

All variables live in `.env.local` (or your hosting provider's secret
manager). Four are server-only. `NEXT_PUBLIC_SITE_URL` is the only
one with the `NEXT_PUBLIC_` prefix, and it is read only on the
server in the root layout (used for OpenGraph `metadataBase`).

| Variable                     | Required | Purpose |
|------------------------------|----------|---------|
| `SUPABASE_URL`               | yes      | Project URL from Supabase Settings → API. |
| `SUPABASE_SERVICE_ROLE_KEY`  | yes      | Service-role key. **Server-only.** Never logged, never sent to the client. |
| `ADMIN_PASSWORD`             | yes      | Plain password the curator types in `/admin/login`. Compared in constant time. |
| `SESSION_SECRET`             | yes      | HS256 signing key for the session JWT. 32+ random chars recommended. |
| `NEXT_PUBLIC_SITE_URL`       | no       | Used to build the OpenGraph `metadataBase`. Defaults to `http://localhost:3000`. |

If `ADMIN_PASSWORD` is missing the admin login route returns a 500
rather than an authentication bypass.

---

## Security model

- **Session cookie** (`ma_session`) is a `jose` HS256 JWT, httpOnly,
  sameSite=lax, secure in production, 7-day expiry. The middleware
  enforces role-based access: admin routes require `role === 'admin'`,
  annotate routes require `role === 'user'`.
- **Service-role key** is only imported from `src/lib/supabase.ts`,
  which starts with `import 'server-only'`. There is no path that
  exposes it to a client bundle.
- **Input validation**: every API route parses its body/query/params
  through zod (`src/lib/validation.ts`). Bad input is a 400 with a
  human-readable error.
- **Ownership recheck**: `/api/annotate/annotations` PUT verifies that
  the target image belongs to the user's dataset before any upsert.
  Foreign image IDs return 400, never 404, to avoid leaking which
  datasets exist.
- **Rate limiting**: in-memory token-bucket per IP (admin login) or
  per `(accessKey, ip)` (annotator login). 5/min and 10/min
  respectively. 429 with a `Retry-After` header.
- **CSP**: tight default-src, img-src restricted to the app's own
  origin plus `drive.google.com` / `lh3.googleusercontent.com` /
  `drive.usercontent.google.com`, frame-ancestors denied, object-src
  none, plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy` blocking camera/mic/geo, and HSTS
  (`max-age=63072000; includeSubDomains; preload`).
- **CSV exports** are RFC 4180 escaped, UTF-8 with BOM, and any cell
  starting with `=`, `+`, `-`, `@`, tab, or CR is prefixed with `'`
  to defeat formula injection (OWASP).
- **Image proxy** (`/api/image/{id}`) validates the upstream
  `Content-Type` is an allowed image type, caps the response at 8 MB,
  adds an ETag for revalidation, and never exposes the upstream URL
  to the client.
- **Noindex, no follow**: the metadata sets `robots: { index: false,
  follow: false }` and `/robots.txt` disallows everything. The app
  is meant to be a private research instrument, not a public page.

To customise the in-app annotation guidance, edit
`src/config/guidelines.ts`. The four guidance entries (Text / Image /
Both / None) are surfaced in a first-login modal and re-openable from
the annotator footer.

---

## Accessibility

- The annotator's choice grid is a proper ARIA `radiogroup` with
  arrow-key navigation (←/→/↑/↓/Home/End), single tab stop on the
  selected option, and `aria-checked` on each button.
- Number keys 1–4 mark the current image (when focus is not in an
  input). The keyboard hint at the foot of the annotator lists the
  full set.
- The save state row is in an `aria-live="polite"` region, so screen
  readers announce "Saving…" / "Saved." / "Couldn't save" without
  stealing focus.
- All motion is gated by `useReducedMotion`; the global CSS sets
  `transition-duration: 0.001ms !important` under
  `@media (prefers-reduced-motion: reduce)`.
- Contrast targets WCAG AA: vermilion on paper ≈ 5.65:1, ink on
  paper ≈ 13.5:1, olive on paper ≈ 4.6:1.
- The "How to annotate" modal is a proper `role="dialog"`,
  `aria-modal`, focus-traps while open, dismisses on Escape, and
  restores focus to the trigger on close.
- Form fields use a `<label htmlFor>` binding; errors are wired
  through the `error` prop on `<Input>`.

---

## Local development tips

- `npm run lint` runs ESLint with the Next 14 config.
- `npx tsc --noEmit` runs the type-checker (no emit).
- `npx next build` produces the production bundle and reports
  per-route size + first-load JS.
- The dev server uses `next/font/google` for Fraunces, IBM Plex
  Sans, and IBM Plex Mono. The first build downloads these; the
  fonts are then served from the local server.
- To reset the in-memory rate limiter, restart `npm run dev`.
- To wipe a user's annotations, run `DELETE /api/admin/users/{id}`
  with an admin cookie (the same action is exposed in the
  DatasetDetail drawer).

## End-to-end tests (Playwright)

The Playwright suite lives in `tests/e2e/` and runs **entirely inside
Docker** — no host-side browser install required. The `e2e` service in
`docker-compose.yml` uses the official `mcr.microsoft.com/playwright`
image, so it works on any platform (including the project's old macOS
host that can't run the bundled Playwright chromium).

The suite currently contains one spec, `first-image.spec.ts`, which
guards the "first image on `/annotate` is visible on a fresh load"
regression. It runs three scenarios:

1. **10 fresh contexts, un-throttled** — register a new user each
   iteration and assert the first image renders within 8s, with
   `complete === true`, `naturalWidth > 0`, opacity > 0.5, no
   skeleton, no spinner, and no console/hydration errors.
2. **One slow-3G throttled run** — apply CDP throttling (400 ms
   latency, 400 kbps) after login and reload; the image must still
   render within 30s.
3. **One resume** — re-login as a user and assert the next
   unannotated image renders.

Run it (with the dev server already up):

```bash
docker compose up web -d       # start the dev server
docker compose run --rm e2e    # run the suite
```

The first run pulls the ~2.5 GB Playwright image and installs
`@playwright/test` + `@supabase/supabase-js` into the
`e2e_node_modules` named volume; subsequent runs are fast. Test
artifacts land in `./test-results` and `./playwright-report`.

You can run a single spec on the host against a running dev server
(this requires Playwright installed locally; the Docker flow does
not):

```bash
npm run test:e2e             # headless
npm run test:e2e:headed      # browser visible
```

The `e2e/run.sh` entrypoint intercepts `/api/image/*` via
`page.route(...)` and serves the local fixtures in
`tests/fixtures/`, so the suite does not hit the real image proxy.
