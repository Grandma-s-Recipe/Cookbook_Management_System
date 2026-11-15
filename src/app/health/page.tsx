// Temporary M1 check page: /health
// Confirms both database connections work and that the roles have the right permissions.
// Remove it (or cut it down to a plain "OK") before the final release.

import { Suspense } from 'react'
import { connection } from 'next/server'
import { appDb, catalogDb } from '@/lib/db'

type Result = { label: string; ok: boolean; detail: string }

async function check(label: string, run: () => Promise<string>): Promise<Result> {
  try {
    return { label, ok: true, detail: await run() }
  } catch (err) {
    return { label, ok: false, detail: err instanceof Error ? err.message : String(err) }
  }
}

export default function HealthPage() {
  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Forkful health check</h1>
      <Suspense fallback={<p>Running checks…</p>}>
        <HealthResults />
      </Suspense>
    </main>
  )
}

async function HealthResults() {
  // Run on every request instead of once at build time.
  await connection()

  const results = await Promise.all([
    check('Catalog connection', async () => {
      const [row] = await catalogDb()`
        select current_user as role,
               current_setting('server_version') as version,
               (select count(*)::int from catalog.recipe) as recipes`
      return `Connected as ${row.role} (PostgreSQL ${row.version}). ${row.recipes} recipes in the catalog.`
    }),

    check('App connection', async () => {
      const [row] = await appDb()`
        select current_user as role,
               (select value from app.settings where key = 'recipe_cap') as cap`
      return `Connected as ${row.role}. Recipe cap setting: ${row.cap}.`
    }),

    check('Catalog role is read-only (NFR-18)', async () => {
      const [row] = await catalogDb()`
        select has_table_privilege('catalog.recipe', 'INSERT') as can_insert,
               has_table_privilege('catalog.recipe', 'DELETE') as can_delete`
      if (row.can_insert || row.can_delete) {
        throw new Error('catalog_reader can change the catalog. Check the GRANT lines in db/schema.sql.')
      }
      return 'catalog_reader can read but not change the catalog.'
    }),

    check('App role cannot reach the catalog', async () => {
      const [row] = await appDb()`select has_schema_privilege('catalog', 'USAGE') as can_use`
      if (row.can_use) {
        throw new Error('forkful_app can access the catalog schema. Check the GRANT lines in db/schema.sql.')
      }
      return 'forkful_app has no access to the catalog schema.'
    }),
  ])

  const allOk = results.every((r) => r.ok)

  return (
    <>
      <p>
        <strong>{allOk ? 'All checks passed.' : 'Some checks failed.'}</strong>
      </p>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {results.map((r) => (
          <li key={r.label} style={{ margin: '1rem 0' }}>
            <strong style={{ color: r.ok ? 'green' : 'crimson' }}>{r.ok ? 'OK' : 'FAILED'}</strong>{' '}
            {r.label}
            <br />
            <span>{r.detail}</span>
          </li>
        ))}
      </ul>
    </>
  )
}
