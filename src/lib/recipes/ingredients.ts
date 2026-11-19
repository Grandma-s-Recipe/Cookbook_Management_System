// Ingredient lines: units, reading and writing quantities, and the line as shown
// (REQ-3.9, REQ-4.13). Same rules as scripts/lib/seed-validate.mjs, so lines
// written by the seed script and lines saved from the edit form look the same.

// The unit list for the form (REQ-3.9). Matches ALLOWED_UNITS in seed-validate.mjs.
export const UNITS = [
  // US volume
  'tsp', 'tbsp', 'fl oz', 'cup', 'pint', 'quart', 'gallon',
  // metric volume
  'ml', 'l',
  // weight
  'oz', 'lb', 'g', 'kg',
  // no conversion (REQ-1.16: these stay as entered)
  'pinch', 'dash', 'clove', 'can', 'package', 'slice', 'stick', 'bunch', 'sprig',
] as const

type Num = number | string | null | undefined // the database returns numeric columns as strings

function toNumber(value: Num): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const FRACTIONS: [number, string][] = [
  [1 / 8, '1/8'], [1 / 4, '1/4'], [1 / 3, '1/3'], [1 / 2, '1/2'], [2 / 3, '2/3'], [3 / 4, '3/4'],
]

/** 0.5 -> "1/2", 1.25 -> "1 1/4", 0.3333 -> "1/3"; anything else stays a short decimal. */
export function formatQuantity(value: Num): string {
  const q = toNumber(value)
  if (q === null) return ''
  const whole = Math.floor(q)
  const rest = q - whole
  if (rest < 0.01) return String(whole)
  for (const [fraction, text] of FRACTIONS) {
    if (Math.abs(rest - fraction) < 0.02) return whole ? `${whole} ${text}` : text
  }
  return String(Number(q.toFixed(2)))
}

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': ' 1/2', '⅓': ' 1/3', '⅔': ' 2/3', '¼': ' 1/4', '¾': ' 3/4', '⅛': ' 1/8', '⅜': ' 3/8', '⅝': ' 5/8', '⅞': ' 7/8',
}

/**
 * Read a quantity typed in the form: "2", "1.5", ".5", "1/2", "1 1/2", "1½".
 * Returns null for an empty box, and NaN when it can't be read.
 */
export function parseQuantity(text: string): number | null {
  let t = text.trim()
  if (t === '') return null
  for (const [symbol, plain] of Object.entries(UNICODE_FRACTIONS)) t = t.replaceAll(symbol, plain)
  t = t.replace(/\s+/g, ' ').trim()

  let m = /^(\d+(?:\.\d+)?|\.\d+)$/.exec(t)
  if (m) return Number(m[1])
  m = /^(\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[2]) === 0 ? Number.NaN : Number(m[1]) / Number(m[2])
  m = /^(\d+) (\d+)\/(\d+)$/.exec(t)
  if (m) return Number(m[3]) === 0 ? Number.NaN : Number(m[1]) + Number(m[2]) / Number(m[3])
  return Number.NaN
}

export type IngredientParts = {
  quantity?: Num
  quantityMax?: Num
  unit?: string | null
  name?: string | null
  note?: string | null
}

/** The line as shown: "1 1/2-2 cup flour, sifted". Same as buildRawText in seed-validate.mjs. */
export function buildRawText(i: IngredientParts): string {
  const parts: string[] = []
  let amount = formatQuantity(i.quantity)
  if (amount && toNumber(i.quantityMax ?? null) !== null) amount += `-${formatQuantity(i.quantityMax)}`
  if (amount) parts.push(amount)
  if (i.unit?.trim()) parts.push(i.unit.trim())
  if (i.name?.trim()) parts.push(i.name.trim())
  let text = parts.join(' ')
  if (i.note?.trim()) text += `, ${i.note.trim()}`
  return text
}

/**
 * The text that stands for an ingredient line: built from its parts when it has
 * a name, or the original text when the line could never be split (REQ-4.13).
 */
export function ingredientText(i: IngredientParts & { rawText: string }): string {
  return i.name?.trim() ? buildRawText(i) : i.rawText.trim()
}
