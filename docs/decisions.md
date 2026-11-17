# Forkful technical decisions

The main technical choices for Forkful, why we made them, and what we rejected. Most come from SRS §6.1 and §6.5. Add new decisions as numbered sections, with the date.

Every choice is limited by two constraints. **Everything has to run at $0 with no credit card**, and **it has to keep running after the class ends**, so we can't rely on student credits or trials that expire.

---

## 1. Hosting: Vercel Hobby plan

- **Choice:** a Next.js (TypeScript) app on Vercel's free Hobby plan. The API, recipe import, and daily cleanup all run as serverless functions.
- **Why:** no card needed, and it can't bill us; usage pauses at the limit instead. It's always on, deploys straight from GitHub, and has no end date.
- **Limits:** personal, non-commercial use only (BR-11). Cron jobs run at most once a day. Only a few hours of active CPU a month, which is part of why OCR runs in the browser (decision 5).
- **Rejected:** spare laptop + Tailscale Funnel (our best backup plan, but uptime and backups depend on one home machine); Azure for Students (the credit ends); Oracle Cloud and Google Cloud free servers (need a card); Render (its free database expires after 30 days); Netlify (the site pauses when credits run out); Supabase (free projects pause after a week without activity). See SRS §6.5 for the full comparison.

## 2. Database: PostgreSQL 18 on Neon's free plan

- **Choice:** one Neon PostgreSQL 18 database.
- **Why:** the data is relational. Users own recipes, saved copies point back to catalog rows, and tags are many-to-many. Transactions keep "save a copy" and account deletion all-or-nothing. Row-level security gives a second check that users reach only their own rows (NFR-13). Free, with no card, 0.5 GB of storage and a 6-hour instant restore.
- **Limits:** compute sleeps after 5 minutes idle, so the first request after a quiet period is slower. Keep the database under 400 MB (NFR-8).
- **Rejected:** MongoDB (harder ownership links, joins, and cascading deletes; no row-level security); MySQL 8 (no row-level security, weaker full-text ranking); SQLite (one writer at a time and no roles, so it's only fine for local testing).

## 3. Schema layout: one database, two schemas

- **Choice:** a `catalog` schema for public recipes and an `app` schema for users, saved copies, and private recipes.
- **Database roles:**
  - The Catalog Service connects with a **read-only** role (NFR-18).
  - Only recipe import and curation use the role that can **write** to `catalog`.
  - The rest of the app uses the `app` role.
- **Why:** it keeps the catalog safe from user actions (BR-1, BR-7) without a second database or service.
- **Rejected:** separate database servers or an external catalog API (more cost and setup, with no benefit at this size).

## 4. Saved copies: full independent records

- **Choice:** saving a copy writes a full new row in `app.recipe`, with `source_catalog_id` and `source_hash` pointing back to the original.
- **Why:**
  - Edits never touch the catalog (BR-1).
  - Copies survive when the original changes or is removed (BR-6).
  - "Modified" and "Original updated" come from comparing hashes (REQ-2.3, REQ-2.6).
- **Rejected:** override records that store only the changed fields. Every read would have to merge the original with the overrides, which breaks when the original changes or disappears.

## 5. OCR: Tesseract.js in the browser

- **Choice:** Tesseract.js runs on the user's device. PDF.js first turns up to 5 PDF pages into images. Scans are never uploaded (REQ-4.9).
- **Why:** free and open source, uses no server CPU, and private recipe images never leave the device.
- **Limits:** speed depends on the user's device. Tesseract reads printed text well but is weak on handwriting, so handwritten scans need more correction on the review screen. NFR-20 (90% accuracy) applies only to printed 300-DPI scans.
- **Rejected:** Tesseract on a server (needs an always-on machine); cloud OCR such as Google Cloud Vision or AWS Textract (charges per page, needs a card, and sends private images to a third party).

## 6. Search: PostgreSQL full-text search

- **Choice:** a `tsvector` column with a GIN index for ranked search, plus the `pg_trgm` extension for typo-tolerant title matches.
- **Why:** a catalog of 10,000 to 20,000 recipes is small enough for the database's own search to meet NFR-1 and NFR-7, with no extra service to keep in sync.
- **Rejected:** Elasticsearch or OpenSearch (another server to run and sync). Revisit only if the catalog grows well past 100,000 recipes.

## 7. Photos: Vercel Blob, compressed in the browser

- **Choice:** one photo per recipe, compressed to WebP in the browser before upload: a display version (at most 1,200 px and 100 KB) and a thumbnail (at most 400 px and 20 KB). Both are stored in Vercel Blob.
- **Why:** about 6,500 recipe photos fit in the free 1 GB, and lists load quickly because they only fetch thumbnails (NFR-3).
- **Rejected:** photos in the database (would fill Neon's 0.5 GB quickly); full-size photos (a few hundred would fill the free limit); Cloudflare R2 (more space, but another account and service).

## 8. Email: Resend (replaced by Brevo, see decision 16)

- **Choice:** Resend's free plan, sending through its HTTPS API.
- **Why:** sends verification and password-reset emails free, up to 3,000 a month and 100 a day.
- **Rejected:** running our own mail server (mail from a new server is often marked as spam, and free hosts block mail ports).

## 9. Catalog growth: seed file plus import by URL

- **Choice:** launch with a seed file of 100 to 500 recipes (`db/seed.json`). After that, the System Admin imports one recipe page at a time by URL, reading its schema.org Recipe markup.
- **Why:** needs no background server, avoids crawling sites against their terms (BR-3), and fits Vercel's free plan.
- **Photos:** never copied from source sites (BR-12, REQ-12.7). Imported recipes show a placeholder until we add a photo we own or that is freely licensed.
- **Rejected:** a scheduled crawler (needs an always-on server and raises rate-limit and terms-of-service risks).

## 10. Backups: nightly pg_dump with GitHub Actions

- **Choice:** a free scheduled workflow (`backup.yml`) runs `pg_dump` at about 2:00 AM Central, encrypts the dump (NFR-12), and keeps the last 7. Neon's 6-hour instant restore covers anything more recent.
- **Why:** meets the recovery targets in NFR-26 (lose at most 24 hours of data, back up within 4 hours) at $0. Neon's restore window alone covers only 6 hours.
- **Watch out:** GitHub pauses scheduled workflows after 60 days without repo activity, so after the class we need to check that backups are still running.
- **Rejected:** a paid Neon plan with a longer restore window.

## 11. Scheduled cleanup: one daily Vercel cron job

- **Choice:** a cron entry in `vercel.json` calls an endpoint that deletes accounts never verified after 7 days (REQ-8.8).
- **Why:** once a day is the most Vercel's free plan allows, and it's all this job needs.
- **Rejected:** a separate scheduler service.

## 12. Usage limits stored in the database

- **Choice:** the 100-recipe cap and the 80% storage warning level are stored as rows in a settings table, not as constants in the code.
- **Why:** NFR-29 says they must change without redeploying. Changing an environment variable on Vercel needs a redeploy, so environment variables wouldn't work.

## 13. Passwords and sessions

- **Choice:**
  - Passwords are hashed with Argon2id (NFR-14).
  - Sessions are rows in a `session` table and end after 30 minutes idle (NFR-15).
  - Verification and reset links use single-use tokens. Only a hash of each token is stored (`auth_token`).
- **Why:** matches the data model in SRS §6.2 and keeps everything in one database, with no extra auth service.

## 14. Testing: Jest

- **Choice:** Jest, configured with `next/jest` so it handles TypeScript, path aliases, and `.env` the same way the app does. Tests live in `tests/`.
- **Why:** works well with Next.js and covers the 70% coverage target on service code (NFR-28).

## 15. Scope: core features only in v1.0

- **Choice:** v1.0 builds the 13 features in SRS §4. Everything else waits in SRS Appendix E: Trash, favorites, collections, a Content Curator role, account lockout, an audit log, data export, revert, a crawler, a paid tier, handwriting OCR, and volume-to-weight conversion.
- **Why:** keeps the build to one web app, one database, and one photo store, which all fit free plans and leave time to test the core.

## 16. 2026-11-15: Email switched from Resend to Brevo

- **Choice:** Brevo's free plan, called through its HTTPS API (`src/lib/email.ts`). We verify one sender address in Brevo; no domain is needed.
- **Why:** without a verified domain, Resend only delivers to the account owner's own address, and a domain costs money every year. Brevo's free plan sends 300 emails a day to anyone, with no card and no end date, and only asks us to confirm the "from" address.
- **Trade-offs:** free emails include a small "Sent with Brevo" footer. Mail sent from a personal address (such as Gmail) through another service is more likely to land in spam, so the site tells users to check their spam folder. If we ever buy a domain, verify it in Brevo and change `EMAIL_FROM`; no code changes.
- **Local development:** if `BREVO_API_KEY` isn't set, emails are printed in the terminal instead of sent, so the sign-up flow can be tested without an inbox.
- **Rejected:** Resend (domain needed to reach other users); Mailjet (needs domain verification); Gmail SMTP with an app password (ties the site to one person's Google account, and SMTP is awkward from serverless functions).
- **SRS:** §2.8, §3.3, §6.1, and §6.5 still say Resend. Update them in the next SRS revision.

## 17. 2026-11-15: The starting catalog is written by the team

- **Choice:** `db/seed.json` holds recipes the team writes in our own words. They show "Forkful Team" as their source, with an internal ID of `forkful-team:<slug>` instead of a web link. Recipes that do come from a website keep its real `source_url` and `source_site`, which are shown as a link (BR-8).
- **Why:** copying recipe text from blogs risks their terms of service (BR-3), and we have no permission to reuse their photos (BR-12). Team recipes have no such problem.
- **How:** `npm run db:seed` checks the whole file first and loads nothing if anything is wrong. It only adds recipes that aren't already in the catalog, so it's safe to run again.

## 18. 2026-11-15: How sessions and email links work

- **Choice:**
  - Session cookies and email links carry a random 256-bit token. The database stores only an HMAC of it, keyed with `SESSION_SECRET`, so a copy of the database alone can't be used to log in or reset a password.
  - The session cookie is `httpOnly`, `secure` on the live site, and `SameSite=Lax`.
  - Sessions end after 30 minutes idle (NFR-15) and always within 12 hours of logging in.
  - The verification link opens a page with a "Verify my email" button instead of verifying on page load, because email scanners that preview links would otherwise use up the single-use link.
  - Forms that ask for an email address (resend link, forgot password) give the same answer whether or not an account exists. Sign-up still says when an email is taken (REQ-8.2).
- **Consequence:** changing `SESSION_SECRET` logs everyone out and cancels all unused email links.

## 19. 2026-11-15: Pages that read live data use `connection()` and `<Suspense>`

- **Choice:** the project has Next.js `cacheComponents` turned on. Any page or component that reads the database or the login cookie on each visit calls `await connection()` (or reads cookies) inside a `<Suspense>` boundary. `export const dynamic` isn't allowed with this setting.
- **Why:** it's what `cacheComponents` requires, and it lets the rest of each page (layout, headings) load instantly while the live part fills in.

## 20. 2026-11-15: Small additions to the data model

- **Choice:** compared with SRS §6.2, the database adds:
  - `recipe_ingredient.quantity_max`, for ranges like "2–3 cups" (REQ-4.13)
  - `users.is_disabled`, for REQ-6.2
  - `users.age_confirmed_at`, for the 13+ checkbox (REQ-8.3)
  - `session.token_hash` and `session.created_at`, for decision 18
  - an `app.settings` table, for decision 12
- **SRS:** add these to §6.2 and Figure B-9 in the next SRS revision.

---

## If a free plan changes

If a provider lowers its free limits:

- Move to another free option from SRS §6.5. The spare laptop + Tailscale Funnel is the backup plan.
- Or lower the recipe limit in BR-10. Because of decision 12, that's a settings change, not a redeploy.
