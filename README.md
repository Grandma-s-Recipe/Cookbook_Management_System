# Forkful: Cookbook Recipe Manager

Forkful is a web app for home cooks. You can browse a public recipe catalog, save a copy of any recipe and edit it without changing the original, add your own private recipes by typing them in or scanning a printed recipe, and keep everything in a personal Library.

CS445 class project · Team: Grandma's Recipe · Requirements: [`docs/Forkful_SRS.docx`](docs/Forkful_SRS.docx)

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

## Tech stack

| Part | Choice |
| --- | --- |
| App | Next.js (TypeScript) |
| Hosting | Vercel Hobby (free) |
| Database | PostgreSQL 18 on Neon (free), with `catalog` and `app` schemas |
| Search | PostgreSQL full-text search + `pg_trgm` |
| OCR | Tesseract.js + PDF.js, in the browser |
| Photos | Vercel Blob (compressed WebP) |
| Email | Resend |
| Tests | Jest |
| CI and backups | GitHub Actions |

Everything runs on free plans, with no credit card needed.

## Repository layout

``` repo
forkful/
├─ README.md            this file
├─ PROCESS.md           how we work: branches, tasks, testing
├─ jest.config.ts
├─ vercel.json          daily cleanup cron
├─ .env.example
├─ docs/
│  ├─ Forkful_SRS.docx
│  ├─ requirements.md   checklist of every REQ, NFR, and BR
│  ├─ decisions.md      main technical choices and why
│  └─ diagrams/         PlantUML sources
├─ db/
│  ├─ schema.sql        schemas, tables, roles, row-level security, indexes
│  └─ seed.json         starting catalog
├─ src/
│  ├─ app/              pages and API routes
│  └─ lib/              one file per service (catalog, library, auth, import, ocr, units, …)
├─ tests/               Jest tests and fixtures
└─ .github/workflows/   ci.yml, backup.yml
```

## Getting started

### Prerequisites

- Node.js (current LTS)
- A free [Neon](https://neon.tech) PostgreSQL 18 database
- A free [Resend](https://resend.com) API key
- `psql`, for loading the schema

### Setup

```bash
git clone <https://github.com/Grandma-s-Recipe/Cookbook_Management_System>
cd forkful
npm install
cp .env.example .env.local     # then fill in the values below
psql "$DATABASE_URL_APP" -f db/schema.sql
npm run db:seed                # loads db/seed.json into the catalog
npm run dev                    # http://localhost:3000
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL_APP` | Connection for the app role (reads and writes the `app` schema) |
| `DATABASE_URL_CATALOG_READ` | Connection for the read-only catalog role |
| `DATABASE_URL_CATALOG_WRITE` | Connection used only by recipe import and curation |
| `RESEND_API_KEY` | Sends verification and password-reset emails |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob access for recipe photos |
| `SESSION_SECRET` | Signs session cookies |
| `CRON_SECRET` | Protects the daily cleanup endpoint |

Never commit `.env.local`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the Jest tests |
| `npm run test:coverage` | Tests with a coverage report (target: 70% on `src/lib`) |
| `npm run lint` | Lint the code |
| `npm run db:seed` | Load the starting catalog |

## Testing

Tests live in `tests/` and run with Jest (configured through `next/jest`). Some tests check specific requirements:

- **Privacy:** no private recipe or saved copy ever appears in catalog search or on a public page (NFR-17)
- **Unit conversion:** at least 50 scaling and conversion cases, each within 1% of the exact value (NFR-31)
- **OCR:** a set of printed 300-DPI recipe scans, with at least 90% character accuracy (NFR-20)
CI runs the full suite on every push and pull request.

## Deployment

The `main` branch deploys automatically to Vercel. Set the same environment variables in the Vercel project settings. The daily cron in `vercel.json` deletes accounts that were never verified within 7 days.

## Backups

`.github/workflows/backup.yml` runs a nightly `pg_dump` at about 2:00 AM Central, encrypts the dump, and keeps the last 7. Neon's 6-hour instant restore covers recent mistakes. Recovery targets: lose at most 24 hours of data, and be back up within 4 hours.

To restore, download the latest backup artifact, decrypt it, and run `psql "$DATABASE_URL_APP" < backup.sql`.

> GitHub pauses scheduled workflows after 60 days without repo activity. If the repo goes quiet, re-enable the workflow from the Actions tab.

## Limits

- 100 recipes per user (saved copies plus private recipes)
- Scans and photos up to 10 MB before compression; PDFs up to 5 pages
- One photo per recipe, stored as a WebP of at most 100 KB plus a thumbnail of at most 20 KB
The limits are stored in the database, so they can be changed without redeploying.

## Team

- Melissa Weitekamp
- Kel Knight

See [PROCESS.md](PROCESS.md) for how we split and track work.

## License

Non-commercial class project. Catalog recipes belong to their source sites and always link back to them. Catalog photos are our own or freely licensed.
