// Database connections for Forkful (SRS §6.1, NFR-18).
//
// Two connections, each with its own PostgreSQL role:
//   catalogDb() -> catalog_reader: can only READ the public catalog
//   appDb()     -> forkful_app:    reads and writes the app schema (users, sessions, settings)
//
// The catalog_writer role is NOT used by the web app. Only the seed script,
// recipe import, and curation connect with it (DATABASE_URL_CATALOG_WRITE).
//
// Usage (server code only — pages, route handlers, server actions):
//   const rows = await catalogDb()`select title from catalog.recipe where catalog_id = ${id}`
// Values in ${ } are sent as parameters, never pasted into the SQL,
// so this style is safe from SQL injection.

import { neon } from '@neondatabase/serverless'

type Sql = ReturnType<typeof neon>

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
