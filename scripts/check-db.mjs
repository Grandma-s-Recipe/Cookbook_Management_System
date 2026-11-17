// Tests every database connection string in .env.local without printing passwords.
//   npm run db:check
import { neon } from '@neondatabase/serverless'

const names = ['DATABASE_URL', 'DATABASE_URL_APP', 'DATABASE_URL_CATALOG_READ', 'DATABASE_URL_CATALOG_WRITE']

for (const name of names) {
  const url = process.env[name]
  if (!url) { console.log(`${name}: MISSING`); continue }

  let info = ''
  try {
    const u = new URL(url)
    info = `user=${u.username} host=${u.hostname} db=${u.pathname.slice(1)} passwordLength=${u.password.length}`
  } catch {
    console.log(`${name}: NOT A VALID URL (check for spaces, quotes or < >)`)
    continue
  }

  try {
    const [row] = await neon(url)`select current_user as role`
    console.log(`${name}: OK as ${row.role}  [${info}]`)
  } catch (err) {
    console.log(`${name}: FAILED: ${err.message}  [${info}]`)
  }
}
