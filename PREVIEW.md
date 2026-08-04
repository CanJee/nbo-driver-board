# Preview environment (isolated Supabase DB per deploy)

Vercel **preview** deployments run against their own auto-created Supabase database,
seeded with a **copy of prod data** — so test/preview deploys never read or write
live prod. (Production deploys are unchanged: they use the prod project.)

## How it works

1. **Supabase Branching** auto-creates a fresh **branch database** for each git branch /
   PR and applies everything in [`supabase/migrations/`](supabase/migrations/) to it.
2. The **Supabase–Vercel integration** injects that branch DB's credentials
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `POSTGRES_*`)
   into the preview build.
3. [`scripts/vercel-build.sh`](scripts/vercel-build.sh) (the Vercel `buildCommand` via
   [`vercel.json`](vercel.json)), on `VERCEL_ENV=preview`, aliases those to the
   `NEXT_PUBLIC_SUPABASE_*` the app reads, then runs the clone, then `next build`.
4. [`scripts/clone-prod-to-preview.mjs`](scripts/clone-prod-to-preview.mjs) copies
   `lanes`, `roster`, `dispatcher_assignments`, and `drivers` from prod into the
   preview DB. It is **idempotent** (skips if the preview DB already has data) and
   **refuses** to run if source and target resolve to the same project. If prod
   doesn't have the `lanes` table yet (its migration not run), the clone keeps the
   preview's migration-seeded lanes and copies the rest.
5. [`scripts/seed-preview-user.mjs`](scripts/seed-preview-user.mjs) recreates the shared
   dispatcher login in the preview DB. Supabase **auth users live in the `auth` schema**,
   which the Data-API clone can't touch, so a fresh preview DB has no users. This creates
   the `DISPATCHER_EMAIL` account with `PREVIEW_DISPATCHER_PASSWORD` (prod passwords can't
   be copied — the Admin API never exposes hashes).
6. [`scripts/seed-preview-drivers.mjs`](scripts/seed-preview-drivers.mjs) tops each lane
   up to a minimum with synthetic drivers (surname `Testcase`), because between tournament
   days the cloned prod data can be nearly empty — and the crowded-lane behaviours (cards
   wrapping into columns, lane reweighting, cross-lane drag and drop) need a full lane to
   exercise. `meals` is left empty on purpose so there's always an empty lane to drag into.
   Idempotent: once those drivers exist it never adds more, so redeploys can't compound
   them after you've dragged cards around. Delete them in the preview DB to test against
   prod data alone.

## One-time setup

1. **Supabase → your prod project → Branching:** enable Branching and connect this
   GitHub repo.
2. **Vercel → this project → Integrations:** add/connect the **Supabase** integration
   (this is what injects `SUPABASE_*` / `POSTGRES_*` into Preview deploys).
3. **Vercel → Settings → Environment Variables → Preview scope:** add
   - `PROD_SUPABASE_URL` = the prod project URL
   - `PROD_SUPABASE_SERVICE_ROLE_KEY` = the prod project's service-role key
   - `PREVIEW_DISPATCHER_PASSWORD` = a password you'll use to log in on preview deploys
   (`PROD_*` are the clone *source*. Do **not** add them to Production scope.)
4. **Vercel → Production scope:** keep `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` pointed at prod, as today.

`vercel.json` makes Vercel use the build script automatically — no Vercel build-setting
changes needed.

## Previews are single-host

Production reaches the same Supabase project on two hostnames and fails over
between them per device (`NEXT_PUBLIC_SUPABASE_FALLBACK_URLS`, see
[`lib/supabase/hosts.ts`](lib/supabase/hosts.ts)). Preview builds blank that
variable in [`scripts/vercel-build.sh`](scripts/vercel-build.sh) so a preview can
never fail over out of its branch DB and into production; `/status` on a preview
therefore shows a single connection card and no failover behaviour.

The session cookie's name is pinned (not derived from the hostname) so a browser
keeps its login across a host switch. Preview logins made before that change was
introduced are invalidated once — log in again with `PREVIEW_DISPATCHER_PASSWORD`.

## Keeping schema in sync

`supabase/migrations/` is the source of truth for **preview/branch** databases. Any SQL
change applied to prod must also be added here as a new `supabase/migrations/<timestamp>_*.sql`
file, so preview DBs match prod. The clone copies *rows only* — the schema must already
match, so run the same migrations on prod before relying on the clone.

## Local manual clone (optional)

```bash
VERCEL_ENV=preview \
PROD_SUPABASE_URL=... PROD_SUPABASE_SERVICE_ROLE_KEY=... \
SUPABASE_URL=<target> SUPABASE_SERVICE_ROLE_KEY=<target-key> \
npm run clone-prod
```
