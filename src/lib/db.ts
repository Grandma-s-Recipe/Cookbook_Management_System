// Database connections for Forkful (SRS §6.1, NFR-18).
//
// Two connections, each with its own PostgreSQL role:
//   catalogDb() -> catalog_reader: can only READ the public catalog
//   appDb()     -> forkful_app:    reads and writes the app schema (users, sessions, settings, recipes)
//
// The catalog_writer role is NOT used by the web app. Only the seed script,
// recipe import, and curation connect with it (DATABASE_URL_CATALOG_WRITE).
//
// Usage (server code only — pages, route handlers, server actions):
//   const rows = await catalogDb()`select title from catalog.recipe where catalog_id = ${id}`
// Values in ${ } are sent as parameters, never pasted into the SQL,
// so this style is safe from SQL injection.
//
// User recipes (app.recipe and its tables) have row-level security: they show
// nothing unless the query runs inside asUser() below.

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// Default mode: each query returns an array of row objects.
type Sql = NeonQueryFunction<false, false>
type Query = ReturnType<Sql>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function connect(envName: string): Sql {
  const url = process.env[envName]
  if (!url) {
    throw new Error(
      `Database not configured: ${envName} is missing. ` +
        `Add it to .env.local (on your computer) or to the Vercel project's Environment Variables (deployed site).`,
    )
  }
  return neon(url)
}

// Created on first use, so a missing variable only fails the request that needs it,
// not the whole build.
let catalog: Sql | undefined
let app: Sql | undefined

/** Read-only access to the public catalog. */
export function catalogDb(): Sql {
  catalog ??= connect('DATABASE_URL_CATALOG_READ')
  return catalog
}

/** Read/write access to the app schema. */
export function appDb(): Sql {
  app ??= connect('DATABASE_URL_APP')
  return app
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True for a well-formed id. Check ids from the address with this before querying. */
export function isUuid(value: string): boolean {
  return UUID.test(value)
}

/**
 * Run queries on a user's recipes, as that user (NFR-13, BR-9; decision 21).
 *
 * All the queries run in ONE transaction. The first thing it does is tell the
 * database who the user is, so row-level security shows and accepts only that
 * user's rows. If any query fails, none of them take effect.
 *
 * Returns one array of rows per query, in the same order.
 *
 *   const [recipes] = await asUser(user.userId, (sql) => [
 *     sql`select recipe_id, title from app.recipe where owner_id = ${user.userId}`,
 *   ])
 *
 * Keep the plain "where owner_id = ..." in each query too: it's the first check,
 * and row-level security is the second.
 *
 * The queries are all sent together, so a later query can't use an earlier one's
 * result. When you need a new recipe's id in the ingredient inserts, make it
 * first with crypto.randomUUID() and pass it to every query.
 */
export async function asUser(userId: string, build: (sql: Sql) => Query[]): Promise<Row[][]> {
  if (!isUuid(userId)) throw new Error('asUser: userId must be a UUID')
  const sql = appDb()
  const results = await sql.transaction([
    sql`select set_config('app.user_id', ${userId}, true)`, // true: only for this transaction
    ...build(sql),
  ])
  return results.slice(1) as Row[][]
}

/** SQLSTATE raised by the database when a user is at the recipe limit (db/schema.sql). */
export const LIBRARY_FULL = 'FKCAP'

/**
 * True when an error from asUser() means the user's Library is full (BR-10).
 * Show "Your Library is full (100 of 100 recipes)" (REQ-2.7, REQ-3.6), using the
 * current recipe_cap from app.settings, not a hard-coded 100.
 */
export function isLibraryFull(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === LIBRARY_FULL
}
