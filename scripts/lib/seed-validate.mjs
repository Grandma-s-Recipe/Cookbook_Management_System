// Checks db/seed.json before anything is written to the database.
// Kept separate from seed.mjs so it can be tested without a database.

export const ALLOWED_UNITS = [
  // US volume
  'tsp', 'tbsp', 'fl oz', 'cup', 'pint', 'quart', 'gallon',
  // metric volume
  'ml', 'l',
  // weight
  'oz', 'lb', 'g', 'kg',
  // no conversion (REQ-1.16: these stay as entered)
  'pinch', 'dash', 'clove', 'can', 'package', 'slice', 'stick', 'bunch', 'sprig',
]

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// 0.5 -> "1/2", 1.25 -> "1 1/4", 0.33 -> "1/3"; anything else stays a decimal.
const FRACTIONS = [
  [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'],
]

export function formatQuantity(q) {
  if (q === null || q === undefined) return ''
  const whole = Math.floor(q)
  const rest = q - whole
  if (rest < 0.01) return String(whole)
  for (const [value, text] of FRACTIONS) {
    if (Math.abs(rest - value) < 0.02) return whole ? `${whole} ${text}` : text
  }
  return String(Number(q.toFixed(2)))
}

export function buildRawText(ing) {
  const parts = []
  let amount = formatQuantity(ing.quantity)
  if (amount && ing.quantity_max != null) amount += `-${formatQuantity(ing.quantity_max)}`
  if (amount) parts.push(amount)
  if (ing.unit) parts.push(ing.unit)
  parts.push(ing.name)
  let text = parts.join(' ')
  if (ing.note) text += `, ${ing.note}`
  return text
}

const isPositiveInt = (n) => Number.isInteger(n) && n > 0
const isNonNegInt = (n) => Number.isInteger(n) && n >= 0
const isText = (s) => typeof s === 'string' && s.trim().length > 0

/** Returns a list of problems; an empty list means the file is valid. */
export function validateSeed(data) {
  const errors = []
  if (!data || !Array.isArray(data.recipes)) {
    return ['seed.json must have a "recipes" array.']
  }

  const slugs = new Set()
  const urls = new Set()

  data.recipes.forEach((r, i) => {
    const where = `recipe ${i + 1}${r && r.slug ? ` (${r.slug})` : ''}`
    const err = (msg) => errors.push(`${where}: ${msg}`)

    if (!r || typeof r !== 'object') return err('is not an object')
    if (!SLUG.test(r.slug ?? '')) err('slug must be lowercase words joined by hyphens, like "banana-bread"')
    else if (slugs.has(r.slug)) err('slug is used more than once')
    else slugs.add(r.slug)

    if (!isText(r.title)) err('title is required')
    if (r.servings != null && !isPositiveInt(r.servings)) err('servings must be a whole number above 0')
    if (r.prep_minutes != null && !isNonNegInt(r.prep_minutes)) err('prep_minutes must be a whole number, 0 or more')
    if (r.cook_minutes != null && !isNonNegInt(r.cook_minutes)) err('cook_minutes must be a whole number, 0 or more')
    if (r.tags != null && (!Array.isArray(r.tags) || !r.tags.every(isText))) err('tags must be a list of words')

    const url = sourceUrl(r)
    if (urls.has(url)) err(`source_url ${url} is used more than once`)
    urls.add(url)
    if (r.source_url != null && !/^https?:\/\//.test(r.source_url)) err('source_url must start with http:// or https://')
    if (r.source_url != null && !isText(r.source_site)) err('source_site is required when source_url is given (BR-8)')

    if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) err('needs at least one ingredient')
    else r.ingredients.forEach((ing, j) => {
      const at = `ingredient ${j + 1}`
      if (!ing || !isText(ing.name)) return err(`${at}: name is required`)
      if (ing.quantity != null && !(typeof ing.quantity === 'number' && ing.quantity >= 0)) err(`${at}: quantity must be a number or null`)
      if (ing.quantity_max != null) {
        if (typeof ing.quantity_max !== 'number') err(`${at}: quantity_max must be a number or null`)
        else if (ing.quantity == null || ing.quantity_max < ing.quantity) err(`${at}: quantity_max must be at least quantity`)
      }
      if (ing.unit != null && !ALLOWED_UNITS.includes(ing.unit)) err(`${at}: unit "${ing.unit}" is not in the allowed list`)
      if (ing.unit != null && ing.quantity == null) err(`${at}: a unit needs a quantity`)
    })

    if (!Array.isArray(r.steps) || r.steps.length === 0) err('needs at least one step')
    else if (!r.steps.every(isText)) err('every step must be non-empty text')
  })

  return errors
}

// Team-written recipes have no outside source page. They get a stable
// "forkful-team:<slug>" identifier, and the site shows "Forkful Team" with no link.
export function sourceUrl(r) {
  return r.source_url ?? `forkful-team:${r.slug}`
}

export function sourceSite(r) {
  return r.source_site ?? 'Forkful Team'
}
