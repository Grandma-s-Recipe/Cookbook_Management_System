# Forkful development process

How the two of us plan, build, test, and ship Forkful. Keep this short and change it whenever the way we work changes.

## Team

| Member | Main areas | Backup for |
| --- | --- | --- |
| Melissa W | database, auth, accounts, admin, import | OCR, library, cooking mode |
| Kel K | catalog UI, Library, OCR, units, cooking mode | database, accounts, import |

Either of us can work anywhere in the code. "Main area" just says who decides when we disagree, and who reviews first.

## Source of truth

- **What to build:** `docs/Forkful_SRS.pdf`
- **What's being worked on now:** the project board
- **List of every REQ, NFR, and BR:** `docs/requirements.md`
- **Why we chose something:** `docs/decisions.md`

If the code needs to differ from the SRS, update the SRS (and add a revision history row) or note the difference in `decisions.md`. Don't let the two quietly drift apart.

## Planning

- Work is split by **feature** (the SRS §4 sections), not by layer, so each of us can take a feature from database to UI.
- Build in priority order: High features first, then Medium, then Low.

### Project board

We track work on the project board, which has three columns:

| Column | Means |
| --- | --- |
| **Backlog** | Planned, not started. Ordered with the most important at the top. |
| **In progress** | Someone is working on it now. Every card here has an assignee. |
| **Done** | Merged into `main` and working on the deployed site. |

Rules:

- **One card per task:** usually one feature, or a few related requirements. Put the requirement IDs in the title or description (`Save a Copy, REQ-2.1 to 2.5`).
- **Assign yourself** before moving a card to In progress.
- **Limit work in progress** to two cards each, so work gets finished rather than half-started.
- **Bugs go on the board too.** Put them at the top of Backlog if they block something.
- **Drag the card to Done** yourself once its PR is merged and the change works on the deployed site. Paste the PR link into the card so the work is easy to find later.
- At the weekly check-in, review the board together, reorder the Backlog, and pick what's next.

Use `requirements.md` to look up the requirement IDs for a card. The board is the only place progress is tracked.

### Suggested build order

1. Database schema, seed catalog, and deployment working end to end
2. Account creation, email verification, login (§4.8, §4.9)
3. Catalog browse and search (§4.1)
4. Save and edit a copy (§4.2), Library (§4.10), delete (§4.5)
5. Add a private recipe (§4.3), then OCR scan (§4.4)
6. Servings scaling and unit conversion (§4.1, REQ-1.11 to 1.16)
7. Profile and account deletion (§4.7), admin accounts (§4.6)
8. Import by URL (§4.12) and catalog curation (§4.11)
9. Cooking mode (§4.13)

## Branches

- `main` is always deployable. Vercel deploys it automatically.
- Do the work on a short-lived branch off `main`:
  - `feat/<short-name>`: new feature (`feat/save-a-copy`)
  - `fix/<short-name>`: bug fix (`fix/search-pagination`)
  - `docs/<short-name>`: documentation only
- Merge within a few days, so branches don't drift far from `main`.

## Commits

- Write short messages in the present tense: `Add servings control to recipe page`
- Mention requirement IDs when they apply: `Block Save a Copy at 100 recipes (REQ-2.7)`
- Commit small and often. Never commit `.env.local` or any secret.

## Pull requests and review

1. Open a PR into `main` when the branch is ready.
2. In the description, list the requirement IDs it covers and how to test it.
3. **The other person reviews** before merging. For a small or urgent fix, merge first and review afterward, but say so in the PR.
4. CI (`ci.yml`) must pass: lint and Jest tests.
5. Squash and merge, then delete the branch.

Review checks:

- Does it do what the requirement says, including the alternative flows in the use case?
- Are there tests for the new logic?
- Do error messages follow the format: problem, cause, suggested action (NFR-24)?
- Does it ever let one user see another user's recipes (NFR-13, NFR-17)?

## Definition of done

A requirement is done when:

- [ ] The code is merged into `main` and works on the deployed site
- [ ] There's a Jest test for it, or a note in `requirements.md` on how it was checked by hand
- [ ] Its card is in **Done** on the project board
- [ ] It's ticked off in `docs/requirements.md`, with the test file next to it
- [ ] The docs are updated, if the work changed setup, environment variables, or a decision

## Testing

- Tests go in `tests/`, named after what they test (`units.test.ts`, `library.test.ts`).
- Run `npm test` before pushing.
- Aim for at least 70% coverage on `src/lib` (NFR-28). Check with `npm run test:coverage`.
- Before each milestone, click through every use case on the deployed site on a phone and on a desktop browser.

## Communication

- Day-to-day: Discord
- Weekly check-in: Sunday, 8 p.m. Go through the project board: what got done, what's next, and anything blocking.
- If you're stuck for more than an hour, ask the other person.

## Releases and milestones

| Milestone | Target date | Contents |
| --- | --- | --- |
| _M1: Skeleton_ | 11/13/2026 | Deployed app, schema, seed catalog, accounts |
| _M2: Core_ | 11/20/2026 | Catalog, save a copy, Library, private recipes |
| _M3: Complete_ | 11/27/2026 | OCR, scaling and units, admin, import, cooking mode |
| _Final_ | 12/4/2026 | Testing, fixes, docs, demo |

Tag each milestone on `main`: `git tag v0.1 && git push --tags`.

## Free-tier checks

Everything runs on free plans, so once a month check the usage pages for Vercel, Neon, Vercel Blob, and Resend. If any of them is close to its limit, see SRS §6.5 for alternatives.

## AI use

Record any AI help (code, docs, tests) the same way as in SRS Appendix D.3: what it was used for, and whether the work was human-written, AI-assisted, or AI-drafted and reviewed. Review and test AI-written code like any other code before merging.
