/** @jest-environment node */
// Row-level security on user recipes (NFR-13, NFR-17, BR-2, BR-9, REQ-1.8, REQ-3.2).
//
// These tests use a real database: the Neon "test" branch, connected as
// forkful_app, the same role the site uses. They are skipped when
// DATABASE_URL_TEST isn't set (put it in .env.test.local; see README → Testing).
// They create users named rlstest_… and delete them again at the end.

import { randomBytes, randomUUID } from 'node:crypto'
import { appDb, asUser, isLibraryFull } from '../src/lib/db'

const TEST_URL = process.env.DATABASE_URL_TEST
const MAIN_URL = process.env.DATABASE_URL_APP

if (TEST_URL) {
  // Never run these against the real database.
  if (MAIN_URL && new URL(MAIN_URL).host === new URL(TEST_URL).host) {
    throw new Error('DATABASE_URL_TEST points at the same host as DATABASE_URL_APP. Use the Neon test branch.')
  }
  // appDb() and asUser() read DATABASE_URL_APP the first time they connect,
  // so pointing it at the test branch here is enough.
  process.env.DATABASE_URL_APP = TEST_URL
}

const describeDb = TEST_URL ? describe : describe.skip

type User = { id: string; recipeId: string; tagId: string }

async function makeUser(label: string): Promise<User> {
  const suffix = randomBytes(4).toString('hex')
  const [row] = await appDb()`
    insert into app.users (username, email, password_hash, is_verified, age_confirmed_at)
    values (${`rlstest_${label}_${suffix}`}, ${`rlstest-${label}-${suffix}@example.test`}, 'not-a-real-hash', true, now())
    returning user_id`
  const user = { id: row.user_id as string, recipeId: randomUUID(), tagId: randomUUID() }
  await asUser(user.id, (sql) => [
    sql`insert into app.recipe (recipe_id, owner_id, kind, title)
        values (${user.recipeId}, ${user.id}, 'private', ${`${label}'s secret recipe`})`,
    sql`insert into app.recipe_ingredient (recipe_id, owner_id, position, quantity, unit, name, raw_text)
        values (${user.recipeId}, ${user.id}, 1, 1, 'cup', 'flour', '1 cup flour')`,
    sql`insert into app.recipe_step (recipe_id, owner_id, position, text)
        values (${user.recipeId}, ${user.id}, 1, 'Mix.')`,
    sql`insert into app.tag (tag_id, owner_id, name) values (${user.tagId}, ${user.id}, 'Family')`,
    sql`insert into app.recipe_tag (recipe_id, tag_id, owner_id) values (${user.recipeId}, ${user.tagId}, ${user.id})`,
  ])
  return user
}

/** How many rows of each table this user can see, by recipe or tag id. */
async function visible(as: User, target: User) {
  const [r, i, s, t, rt] = await asUser(as.id, (sql) => [
    sql`select 1 from app.recipe            where recipe_id = ${target.recipeId}`,
    sql`select 1 from app.recipe_ingredient where recipe_id = ${target.recipeId}`,
    sql`select 1 from app.recipe_step       where recipe_id = ${target.recipeId}`,
    sql`select 1 from app.tag               where tag_id    = ${target.tagId}`,
    sql`select 1 from app.recipe_tag        where recipe_id = ${target.recipeId}`,
  ])
  return [r.length, i.length, s.length, t.length, rt.length]
}

const RECIPE_TABLES = ['app.recipe', 'app.recipe_ingredient', 'app.recipe_step', 'app.tag', 'app.recipe_tag']

describeDb('user recipes: row-level security (needs DATABASE_URL_TEST)', () => {
  let a: User
  let b: User

  beforeAll(async () => {
    await appDb()`delete from app.users where left(username, 8) = 'rlstest_'` // leftovers from a crashed run
    a = await makeUser('a')
    b = await makeUser('b')
  })

  afterAll(async () => {
    await appDb()`delete from app.users where left(username, 8) = 'rlstest_'` // cascades to their recipes
  })

  test('the tests run as forkful_app, which cannot skip row-level security', async () => {
    const [me] = await appDb()`
      select current_user as name, r.rolbypassrls, r.rolsuper
      from pg_roles r where r.rolname = current_user`
    expect(me).toEqual({ name: 'forkful_app', rolbypassrls: false, rolsuper: false })

    const tables = await appDb()`
      select c.oid::regclass::text as name, c.relrowsecurity, pg_get_userbyid(c.relowner) as owner
      from pg_class c where c.oid = any(${RECIPE_TABLES}::regclass[])`
    expect(tables).toHaveLength(RECIPE_TABLES.length)
    for (const t of tables) {
      expect(t.relrowsecurity).toBe(true) // row-level security is on
      expect(t.owner).not.toBe('forkful_app') // owners would skip it
    }
  })

  test('each user sees their own recipe, ingredients, steps and tags', async () => {
    expect(await visible(a, a)).toEqual([1, 1, 1, 1, 1])
    expect(await visible(b, b)).toEqual([1, 1, 1, 1, 1])
  })

  test("user A can't read anything of user B's, even by id", async () => {
    expect(await visible(a, b)).toEqual([0, 0, 0, 0, 0])
    const [all] = await asUser(a.id, (sql) => [sql`select owner_id from app.recipe`]) // no owner filter at all
    expect(all.every((r) => r.owner_id === a.id)).toBe(true)
  })

  test('a query that forgets asUser() sees no recipes at all', async () => {
    const rows = await appDb()`select 1 from app.recipe where recipe_id in (${a.recipeId}, ${b.recipeId})`
    expect(rows).toHaveLength(0)
  })

  test("user A can't edit user B's recipe", async () => {
    const [recipe, steps] = await asUser(a.id, (sql) => [
      sql`update app.recipe set title = 'changed by A' where recipe_id = ${b.recipeId} returning 1`,
      sql`update app.recipe_step set text = 'changed by A' where recipe_id = ${b.recipeId} returning 1`,
    ])
    expect(recipe).toHaveLength(0)
    expect(steps).toHaveLength(0)
    const [[still]] = await asUser(b.id, (sql) => [sql`select title from app.recipe where recipe_id = ${b.recipeId}`])
    expect(still.title).toBe("b's secret recipe")
  })

  test("user A can't delete user B's recipe or tag", async () => {
    const [recipe, tag] = await asUser(a.id, (sql) => [
      sql`delete from app.recipe where recipe_id = ${b.recipeId} returning 1`,
      sql`delete from app.tag where tag_id = ${b.tagId} returning 1`,
    ])
    expect(recipe).toHaveLength(0)
    expect(tag).toHaveLength(0)
    expect(await visible(b, b)).toEqual([1, 1, 1, 1, 1])
  })

  test("user A can't create a recipe owned by B, or give their own recipe to B", async () => {
    await expect(
      asUser(a.id, (sql) => [sql`insert into app.recipe (owner_id, kind, title) values (${b.id}, 'private', 'planted')`]),
    ).rejects.toMatchObject({ code: '42501' }) // row-level security
    await expect(
      asUser(a.id, (sql) => [sql`update app.recipe set owner_id = ${b.id} where recipe_id = ${a.recipeId}`]),
    ).rejects.toMatchObject({ code: '42501' })
  })

  test("user A can't add ingredients or tags to B's recipe, or use B's tag", async () => {
    // Pretending to be B: row-level security refuses it.
    await expect(
      asUser(a.id, (sql) => [
        sql`insert into app.recipe_ingredient (recipe_id, owner_id, position, raw_text)
            values (${b.recipeId}, ${b.id}, 2, 'planted')`,
      ]),
    ).rejects.toMatchObject({ code: '42501' })
    // As A, onto B's recipe: the foreign key refuses it (the owners don't match).
    await expect(
      asUser(a.id, (sql) => [
        sql`insert into app.recipe_step (recipe_id, owner_id, position, text) values (${b.recipeId}, ${a.id}, 2, 'planted')`,
      ]),
    ).rejects.toMatchObject({ code: '23503' })
    // B's tag on A's own recipe: refused too.
    await expect(
      asUser(a.id, (sql) => [
        sql`insert into app.recipe_tag (recipe_id, tag_id, owner_id) values (${a.recipeId}, ${b.tagId}, ${a.id})`,
      ]),
    ).rejects.toMatchObject({ code: '23503' })
  })

  test('if one query in asUser() fails, nothing is saved', async () => {
    const id = randomUUID()
    await expect(
      asUser(a.id, (sql) => [
        sql`insert into app.recipe (recipe_id, owner_id, kind, title) values (${id}, ${a.id}, 'private', 'half done')`,
        sql`insert into app.recipe_step (recipe_id, owner_id, position, text) values (${id}, ${a.id}, 1, '')`, // empty step: refused
      ]),
    ).rejects.toMatchObject({ code: '23514' })
    const [rows] = await asUser(a.id, (sql) => [sql`select 1 from app.recipe where recipe_id = ${id}`])
    expect(rows).toHaveLength(0)
  })

  test('a saved copy must keep its source; a private recipe has none', async () => {
    await expect(
      asUser(a.id, (sql) => [sql`insert into app.recipe (owner_id, kind, title) values (${a.id}, 'saved_copy', 'no source')`]),
    ).rejects.toMatchObject({ code: '23514' })
  })

  test('the recipe limit comes from app.settings and is enforced by the database (BR-10)', async () => {
    const c = await makeUser('c') // has 1 recipe
    try {
      await appDb()`update app.settings set value = '2' where key = 'recipe_cap'`
      await asUser(c.id, (sql) => [sql`insert into app.recipe (owner_id, kind, title) values (${c.id}, 'private', 'second')`])

      const third = randomUUID()
      const attempt = asUser(c.id, (sql) => [
        sql`insert into app.recipe (recipe_id, owner_id, kind, title) values (${third}, ${c.id}, 'private', 'third')`,
        sql`insert into app.recipe_step (recipe_id, owner_id, position, text) values (${third}, ${c.id}, 1, 'Mix.')`,
      ])
      const err = await attempt.catch((e: unknown) => e)
      expect(isLibraryFull(err)).toBe(true)
      expect(String((err as Error).message)).toContain('Your Library is full (2 of 2 recipes)')

      const [[{ n }]] = await asUser(c.id, (sql) => [sql`select count(*)::int as n from app.recipe where owner_id = ${c.id}`])
      expect(n).toBe(2)
    } finally {
      await appDb()`update app.settings set value = '100' where key = 'recipe_cap'`
    }
  })

  test('deleting an account deletes all its recipes, ingredients, steps and tags (REQ-7.5)', async () => {
    const d = await makeUser('d')
    await appDb()`delete from app.users where user_id = ${d.id}` // no asUser(): like the cleanup job
    expect(await visible(d, d)).toEqual([0, 0, 0, 0, 0])
  })

  test('catalog search cannot reach private recipes or saved copies (NFR-17, REQ-1.8)', async () => {
    // Catalog pages connect as catalog_reader, which has no access to the app schema.
    const [reader] = await appDb()`
      select has_schema_privilege('catalog_reader', 'app', 'USAGE') as app_usage,
             has_schema_privilege('catalog_writer', 'app', 'USAGE') as writer_app_usage`
    expect(reader).toEqual({ app_usage: false, writer_app_usage: false })
    for (const table of RECIPE_TABLES) {
      const [p] = await appDb()`
        select has_table_privilege('catalog_reader', ${table}, 'SELECT') as can_read`
      expect(p.can_read).toBe(false)
    }
    // And the site's app role can't read the catalog, so the two never mix in one query.
    const [own] = await appDb()`select has_schema_privilege(current_user, 'catalog', 'USAGE') as catalog_usage`
    expect(own.catalog_usage).toBe(false)
  })

  test('asUser() refuses an id that is not a UUID', async () => {
    await expect(asUser("1' or '1'='1", () => [])).rejects.toThrow('must be a UUID')
  })
})
