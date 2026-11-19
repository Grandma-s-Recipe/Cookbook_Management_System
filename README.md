# Forkful: Cookbook Recipe Manager

Forkful is a web app for home cooks. You can browse a public recipe catalog, save a copy of any recipe and edit it without changing the original, add your own private recipes by typing them in or scanning a printed recipe, and keep everything in a personal Library.

CS445 class project · Team: Grandma's Recipe · Requirements: [`docs/Forkful_SRS.pdf`](docs/Forkful_SRS.pdf)

**Live site:** <https://forkful-recipe-manager.vercel.app>

## Features (v1.0)

- Browse and search the public catalog without an account (filters, sorting, relevance ranking)
- Scale servings and switch between US and metric units on any recipe
- Save a copy of a catalog recipe and edit it; the original is never changed
- Add private recipes by hand or by scanning a JPG, PNG, or PDF (OCR runs in your browser, and scans are never uploaded)
- Organize your Library with tags (up to 100 recipes per user)
- Cooking mode: one step at a time, with the screen kept awake
- Accounts with email verification, login, password reset, and account deletion
- Admin console for managing accounts, importing recipes by URL, and curating the catalog

Features planned for later are listed in Appendix E of the SRS.

### Progress

| Milestone | Status |
| --- | --- |
| M1: Skeleton (deployed app, schema, seed catalog, accounts) | Done |
| M2: Core (catalog search, save a copy, Library, private recipes) | In Progress |
| M3: Complete (OCR, scaling and units, admin, import, cooking mode) | Not started |

## Tech stack

| Part | Choice |
| --- | --- |
| App | Next.js (TypeScript, App Router, `cacheComponents`) |
| Hosting | Vercel Hobby (free) |
| Database | PostgreSQL 18 on Neon (free), with `catalog` and `app` schemas |
| Search | PostgreSQL full-text search + `pg_trgm` |
| OCR | Tesseract.js + PDF.js, in the browser |
| Photos | Vercel Blob (compressed WebP) |
| Email | Brevo (free plan, 300 emails a day) |
| Passwords | Argon2id (`@node-rs/argon2`) |
| Tests | Jest |
| CI and backups | GitHub Actions |

Everything runs on free plans, with no credit card needed. The reasons for each choice are in [`docs/decisions.md`](docs/decisions.md).

## Repository layout

```text
forkful/
├─ README.md               this file
├─ PROCESS.md              how we work: board, branches, reviews, testing
├─ vercel.json             daily cleanup cron
├─ .env.example            names of the environment variables (no values)
├─ docs/
│  ├─ Forkful_SRS.pdf
│  ├─ requirements.md      list of every REQ, NFR, and BR
│  ├─ decisions.md         technical choices and why
│  └─ diagrams/            PlantUML sources
├─ db/
│  ├─ schema.sql           schemas, tables, roles, permissions, indexes
│  └─ seed.json            starting catalog
├─ scripts/
│  ├─ seed.mjs             loads db/seed.json (npm run db:seed)
│  ├─ check-db.mjs         tests the connection strings in .env.local
│  └─ lib/seed-validate.mjs
├─ src/
│  ├─ app/                 pages and API routes
│  │  ├─ (auth)/           sign up, log in, verify, password reset
│  │  ├─ catalog/          catalog list
│  │  ├─ health/           temporary database check page
│  │  └─ api/cron/         daily cleanup
│  ├─ components/
│  └─ lib/                 one module per service: db, accounts, auth/, email, …
├─ tests/                  Jest tests
└─ .github/workflows/      ci.yml, backup.yml
```

## Getting started

### Prerequisites

- Node.js 20 or newer
- Access to the team's Neon project (ask a teammate for the connection strings)
- Optional: `psql`. The Neon SQL Editor works instead.

### Setup

1. **Install**

    ```bash
    git clone <repo-url>
    cd forkful
    npm install
    ```

2. **Environment variables:** copy `.env.example` to `.env.local` and fill in the values (see the table below). Get the real values from a teammate privately, never through the repo or chat.
3. **Check the database connections**

    ```bash
    npm run db:check
    ```

   Every line should say `OK`.
4. **Run**

    ```bash
    npm run dev
    ```

   Open <http://localhost:3000>. <http://localhost:3000/health> should show four OKs.

### Setting up a new database (only once per Neon project)

1. Run all of `db/schema.sql` in the Neon SQL Editor, or with `psql "<owner DIRECT connection string>" -f db/schema.sql`. It's safe to run again.
2. In the SQL Editor, give each role a password made of letters and numbers only:

   ```sql
   ALTER ROLE forkful_app    PASSWORD '...';
   ALTER ROLE catalog_reader PASSWORD '...';
   ALTER ROLE catalog_writer PASSWORD '...';
   ```

   Then delete those queries from the editor's History.
3. Build each connection string from the owner's **pooled** string by changing only the `user:password` part before the `@`.
4. Load the catalog: `npm run db:seed`.

### Environment variables

Put these in `.env.local` for your computer, and in **Vercel → Settings → Environment Variables** for the live site (except the ones marked local only). After changing anything in Vercel, redeploy.

| Variable | Where | What it is |
| --- | --- | --- |
| `DATABASE_URL` | local only | Owner connection string. Used for setup and `db:check`, never by the site. |
| `DATABASE_URL_APP` | both | `forkful_app` connection string: accounts, sessions, settings |
| `DATABASE_URL_CATALOG_READ` | both | `catalog_reader` connection string: read-only catalog |
| `DATABASE_URL_CATALOG_WRITE` | both | `catalog_writer` connection string: seed script, and later import and curation |
| `SESSION_SECRET` | both | Random string, at least 32 characters. Protects sessions and email links. Changing it logs everyone out. |
| `CRON_SECRET` | both | Random string. Vercel sends it with the daily cron so nobody else can trigger the cleanup. |
| `BREVO_API_KEY` | both | From Brevo → SMTP & API → API keys. Leave it out locally to print emails in the terminal instead. |
| `EMAIL_FROM` | both | The sender address verified in Brevo → Senders |
| `EMAIL_FROM_NAME` | optional | Sender name, default "Forkful" |
| `APP_URL` | optional | Base address for email links. On Vercel it defaults to the production address; locally to <http://localhost:3000>. |

Generate random secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Never commit `.env.local`.

### Email setup (Brevo)

1. Create a free account at brevo.com.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender:** enter the address emails should come from, then click the link Brevo emails you.
3. **SMTP & API → API keys → Generate a new API key.**
4. Set `BREVO_API_KEY` and `EMAIL_FROM` locally and in Vercel.

Free emails include a small "Sent with Brevo" footer, and may land in spam because no domain is verified. The free limit is 300 emails a day.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the Jest tests |
| `npm run test:coverage` | Tests with a coverage report (target: 70% on `src/lib`) |
| `npm run lint` | Lint the code |
| `npm run db:seed` | Check `db/seed.json` and add any new recipes to the catalog |
| `npm run db:check` | Test every connection string in `.env.local` |

## Testing

Tests live in `tests/` and run with Jest (configured through `next/jest`). Some tests check specific requirements:

- **Accounts:** password, username, and email rules (REQ-8.5), safe login redirects, and session tokens
- **Catalog search:** `tests/catalog-query.test.ts` checks how the address is read and rebuilt. `tests/catalog-search.test.ts` runs real searches: 20 per page, cuisine and tag filters, A–Z order, typos still matching, and no results (REQ-1.1–1.4, 1.6, 1.7, NFR-1).
- **Recipe page:** `tests/recipe-page.test.ts` loads a catalog recipe with its source, ingredients, and steps in order, and checks that a private recipe is visible to its owner only and never found as a catalog recipe (REQ-1.5, REQ-3.2, NFR-17). `tests/recipe-view.test.ts` covers the small display helpers.
- **Save a copy and edit it:** `tests/save-copy.test.ts` saves and edits copies on the test branch: every field copied and editable, "Modified" only after real changes, other users can't see or edit them, the 100-recipe limit, and saves within 5 seconds (REQ-2.1–2.3, 2.5–2.7, NFR-4). `tests/recipe-form.test.ts` and `tests/ingredients.test.ts` cover the form rules and ingredient amounts (REQ-3.3, REQ-3.9).
- **Privacy and ownership:** `tests/recipe-rls.test.ts` checks that a user can't read, change, or delete another user's recipes, that the catalog roles can't reach the `app` schema at all, so private recipes and saved copies can't appear in catalog search (NFR-13, NFR-17, BR-9), and that the 100-recipe limit and account deletion work. It needs the database test branch, below.
- **Unit conversion:** at least 50 scaling and conversion cases, each within 1% of the exact value (NFR-31) _(M3)_
- **OCR:** a set of printed 300-DPI recipe scans, with at least 90% character accuracy (NFR-20) _(M3)_

CI runs the lint and the full suite on every push and pull request. The database tests are skipped in CI for now.

### Database tests (Neon `test` branch)

The row-level security tests use a real database: a Neon branch called `test`, connected as `forkful_app`, the same role the site uses. Without the connection string, those tests are skipped and everything else still runs.

1. In the Neon Console, open the project, go to **Branches**, and click **Create branch**. Name it `test`, with `main` as the parent. The branch copies the roles and their passwords.
2. Apply the schema to the branch: open the **SQL Editor**, pick the `test` branch in the branch menu at the top, paste the whole of `db/schema.sql`, and run it. Do this again whenever `schema.sql` changes.
3. Find the test branch's **pooled host**: on the project **Dashboard**, click **Connect**, choose the `test` branch, and turn on **Connection pooling**. The host is the part after `@` and before `/neondb`; it contains `-pooler`.
4. Copy your `DATABASE_URL_APP` value from `.env.local` and change **only the host** to the test branch's pooled host. The user (`forkful_app`) and password stay the same, because the branch copied them.
5. Do the same with your `DATABASE_URL_CATALOG_READ`: change only its host to the same test branch host.
6. Put both in a file named `.env.test.local` in the project folder (Jest reads this file; it does not read `.env.local`):

   ```text
   DATABASE_URL_TEST=<your DATABASE_URL_APP with the test branch's pooled host>
   DATABASE_URL_TEST_CATALOG_READ=<your DATABASE_URL_CATALOG_READ with the test branch's pooled host>
   ```

7. Run `npm test`.

| Variable | Role | Used by |
| --- | --- | --- |
| `DATABASE_URL_TEST` | `forkful_app` | `tests/recipe-rls.test.ts`, `tests/recipe-page.test.ts`, `tests/save-copy.test.ts` |
| `DATABASE_URL_TEST_CATALOG_READ` | `catalog_reader` | `tests/catalog-search.test.ts`, `tests/recipe-page.test.ts` (need the seed recipes on the test branch) |

Each test file is skipped when its variable is missing, and refuses to run if its variable has the same host as the real one (`DATABASE_URL_APP` or `DATABASE_URL_CATALOG_READ`), so it can't touch the real data. The database tests create users named `rlstest_…`, `pagetest_…`, and `copytest_…` and delete them at the end. `npm test` runs the test files one at a time, because some of them change the shared recipe limit for a moment. The catalog tests only read.

## Deployment

The `main` branch deploys automatically to Vercel. A daily Vercel Schedule in `vercel.json` (`cleanup-unverified`, about 4 AM Central) calls `/api/cron/cleanup-unverified`, which deletes accounts never verified within 7 days, plus expired sessions and old email links.

## Backups

`.github/workflows/backup.yml` runs a nightly `pg_dump` at about 2:00 AM Central, encrypts it with AES-256, and keeps each backup for 7 days as a workflow artifact. Neon's 6-hour instant restore covers recent mistakes. Recovery targets: lose at most 24 hours of data, and be back up within 4 hours.

**One-time setup:** in GitHub, open **Settings → Secrets and variables → Actions** and add two repository secrets:

- `DATABASE_URL_BACKUP`: the owner connection string, **direct** (no `-pooler` in the host)
- `BACKUP_PASSPHRASE`: a long random passphrase. Keep a copy in a password manager; without it, backups can't be opened.

Then run the workflow once by hand (**Actions → Nightly backup → Run workflow**) to check it works.

**To restore:**

1. Download the backup from the workflow run's **Artifacts** section and unzip it.
2. Decrypt it:

   ```bash
   gpg --decrypt --output forkful.dump forkful-YYYY-MM-DD.dump.gpg
   ```

3. Restore into a Neon branch, using the direct owner connection string for that branch:

   ```bash
   pg_restore --no-owner --clean --if-exists -d "<direct owner connection string>" forkful.dump
   ```

   Restore into a new Neon branch first and check it, before touching the main one.

> GitHub pauses scheduled workflows after 60 days without repo activity. If the repo goes quiet, re-enable the workflow from the Actions tab.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `password authentication failed` | Run `npm run db:check`. It shows the user, host, and password length of each string, without the password. Check the host matches the owner line, and the password has no quotes or `< >`. |
| `Database not configured: … is missing` | The variable isn't in `.env.local`, or isn't in Vercel. Restart `npm run dev` after editing `.env.local`, and redeploy after editing Vercel. |
| No verification email | Locally, without `BREVO_API_KEY`, the email is printed in the terminal running `npm run dev`. On the live site, check spam, then Brevo → Transactional → Logs. |
| `Route segment config "dynamic" is not compatible…` | Don't use `export const dynamic`. Use `await connection()` inside `<Suspense>` (see decisions.md, decision 19). |

## Limits

- 100 recipes per user (saved copies plus private recipes)
- Scans and photos up to 10 MB before compression; PDFs up to 5 pages
- One photo per recipe, stored as a WebP of at most 100 KB plus a thumbnail of at most 20 KB
- 300 emails a day (Brevo free plan)

The recipe limit is stored in the database (`app.settings`), so it can be changed without redeploying.

## Team

- Melissa Weitekamp
- Kel Knight

See [PROCESS.md](PROCESS.md) for how we split and track work.

## License

Non-commercial class project. Recipes from other sites belong to them and always link back to them. Recipes marked "Forkful Team" were written by us. Catalog photos are our own or freely licensed.
