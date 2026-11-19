'use client'
// The recipe form, for editing (REQ-2.2) and for a new private recipe (REQ-3.1):
// every field, including notes, with ingredient rows (amount, unit from a list,
// name, note; REQ-3.9) and steps that can be added, removed, and moved.
// The server checks everything again (REQ-3.3).
//   - Leaving with unsaved changes asks first (NFR-10, REQ-3.5).
//   - Unsaved changes are kept in this browser while typing, and offered back
//     after an accidental close or crash (NFR-9). They're removed once saved or discarded.

import Link from 'next/link'
import {
  startTransition,
  useActionState,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { FIELD, LIMITS, type RecipeDraft, type RecipeFormState } from '@/lib/recipes/form'
import { UNITS } from '@/lib/recipes/ingredients'

type Fields = Omit<RecipeDraft, 'ingredients' | 'steps'>
type IngredientPart = keyof RecipeDraft['ingredients'][number]
type Ingredient = RecipeDraft['ingredients'][number] & { key: string }
type Step = { key: string; text: string }

const EMPTY_INGREDIENT = { quantity: '', quantityMax: '', unit: '', name: '', note: '' }
const UNIT_LIST: readonly string[] = UNITS

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list
  const copy = [...list]
  const [item] = copy.splice(from, 1)
  copy.splice(to, 0, item)
  return copy
}

// --- Drafts kept in the browser (NFR-9) ---------------------------------------
// Browser storage can be missing or full (private windows, some settings), so
// every use is wrapped: the form still works, just without drafts.

type StoredDraft = { savedAt: number; fields: Fields; ingredients: RecipeDraft['ingredients']; steps: string[] }

function readDraft(key: string): StoredDraft | null {
  if (typeof window === 'undefined') return null
  try {
    const text = window.localStorage.getItem(key)
    if (!text) return null
    const d = JSON.parse(text) as StoredDraft
    return d && typeof d.savedAt === 'number' && d.fields && Array.isArray(d.ingredients) && Array.isArray(d.steps) ? d : null
  } catch {
    return null
  }
}

function writeDraft(key: string, draft: StoredDraft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft))
  } catch {
    // no room or no storage: carry on without a draft
  }
}

function removeDraft(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // nothing to remove
  }
}

const noSubscribe = () => () => {}

/** Everything the user can change, as one string, to spot unsaved changes. */
function snapshot(fields: Fields, ingredients: Ingredient[], steps: Step[]): string {
  return JSON.stringify([
    fields,
    ingredients.map((r) => [r.quantity, r.quantityMax, r.unit, r.name, r.note]),
    steps.map((s) => s.text),
  ])
}

type Props = {
  /** The server action that saves the form. */
  action: (prev: RecipeFormState, form: FormData) => Promise<RecipeFormState>
  initial: RecipeDraft
  /** Where unsaved changes are kept in this browser, e.g. "forkful:draft:new". */
  draftKey: string
  cancelHref: string
  submitLabel: string
  /** Sent with the form when editing an existing recipe. */
  recipeId?: string
}

export function RecipeForm({ action, initial, draftKey, cancelHref, submitLabel, recipeId }: Props) {
  const [state, dispatch, pending] = useActionState<RecipeFormState, FormData>(action, {})

  const [fields, setFields] = useState<Fields>(() => ({
    title: initial.title,
    description: initial.description,
    cuisine: initial.cuisine,
    servings: initial.servings,
    prepMinutes: initial.prepMinutes,
    cookMinutes: initial.cookMinutes,
    notes: initial.notes,
    tags: initial.tags,
  }))
  // Starting rows get keys from their place; rows added later get new ones.
  const [ingredients, setIngredients] = useState<Ingredient[]>(() =>
    (initial.ingredients.length ? initial.ingredients : [EMPTY_INGREDIENT]).map((row, i) => ({ ...row, key: `start-${i}` })),
  )
  const [steps, setSteps] = useState<Step[]>(() =>
    (initial.steps.length ? initial.steps : ['']).map((text, i) => ({ key: `start-${i}`, text })),
  )
  const [startedAs] = useState(() => snapshot(fields, ingredients, steps))
  const dirty = snapshot(fields, ingredients, steps) !== startedAs

  const added = useRef(0) // only used in click handlers
  const newKey = () => `added-${added.current++}`

  // NFR-9: offer back changes kept from an earlier visit. Read once, in the browser;
  // shown only after the page has loaded, so the server and browser HTML match.
  const inBrowser = useSyncExternalStore(noSubscribe, () => true, () => false)
  const [stored] = useState(() => readDraft(draftKey))
  const [offerClosed, setOfferClosed] = useState(false)
  const storedDiffers = stored !== null && snapshot(stored.fields, stored.ingredients.map((r, i) => ({ ...r, key: String(i) })), stored.steps.map((text, i) => ({ key: String(i), text }))) !== startedAs
  const showOffer = inBrowser && storedDiffers && !offerClosed

  function restoreDraft() {
    if (!stored) return
    setFields(stored.fields)
    setIngredients(stored.ingredients.map((row, i) => ({ ...row, key: `restored-${i}` })))
    setSteps(stored.steps.map((text, i) => ({ key: `restored-${i}`, text })))
    setOfferClosed(true)
  }

  function discardDraft() {
    removeDraft(draftKey)
    setOfferClosed(true)
  }

  // Keep unsaved changes in this browser while typing (and again after a failed save).
  useEffect(() => {
    if (!dirty) return
    writeDraft(draftKey, {
      savedAt: Date.now(),
      fields,
      ingredients: ingredients.map((r) => ({ quantity: r.quantity, quantityMax: r.quantityMax, unit: r.unit, name: r.name, note: r.note })),
      steps: steps.map((s) => s.text),
    })
  }, [dirty, draftKey, fields, ingredients, steps, state])

  // NFR-10: the browser asks before closing or reloading the tab with unsaved changes.
  useEffect(() => {
    if (!dirty || pending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, pending])

  // After a failed save, move to the message so keyboard and screen-reader users get it.
  const messageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (state.message) messageRef.current?.focus()
  }, [state])

  const errors = state.errors ?? {}
  const invalid = (name: string) =>
    errors[name] ? { 'aria-invalid': true as const, 'aria-describedby': `${name}-error` } : {}
  const errorText = (name: string): ReactNode =>
    errors[name] ? (
      <p className="field-error" id={`${name}-error`}>
        {errors[name]}
      </p>
    ) : null

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const data = new FormData(e.currentTarget)
    removeDraft(draftKey) // saved now; kept again if the save fails (see above)
    startTransition(() => dispatch(data)) // sent by hand, so React doesn't clear the form afterwards
  }

  // REQ-3.5: cancelling with unsaved changes asks first.
  function onCancel(e: MouseEvent<HTMLAnchorElement>) {
    if (dirty && !window.confirm('Discard your changes to this recipe?')) {
      e.preventDefault()
      return
    }
    removeDraft(draftKey)
  }

  const setField = (name: keyof Fields) => (e: { target: { value: string } }) =>
    setFields((f) => ({ ...f, [name]: e.target.value }))

  const setIngredient = (index: number, part: IngredientPart, value: string) =>
    setIngredients((list) => list.map((row, i) => (i === index ? { ...row, [part]: value } : row)))

  return (
    <form className="form recipe-form" onSubmit={onSubmit} noValidate>
      {recipeId && <input type="hidden" name="recipeId" value={recipeId} />}

      {showOffer && stored && (
        <div className="notice" role="status">
          <p>
            You have unsaved changes to this recipe from {new Date(stored.savedAt).toLocaleString()}, kept in this browser.
          </p>
          <p className="actions">
            <button type="button" onClick={restoreDraft}>Restore my changes</button>
            <button type="button" className="secondary" onClick={discardDraft}>Discard them</button>
          </p>
        </div>
      )}

      <div ref={messageRef} tabIndex={-1}>
        {state.message && (
          <p className="notice notice-error" role="alert">
            {state.message}
          </p>
        )}
      </div>

      <label htmlFor="title">Title *</label>
      <input id="title" name={FIELD.title} value={fields.title} onChange={setField('title')} maxLength={LIMITS.title} required {...invalid('title')} />
      {errorText('title')}

      <label htmlFor="description">Description</label>
      <textarea id="description" name={FIELD.description} value={fields.description} onChange={setField('description')} rows={3} maxLength={LIMITS.description} {...invalid('description')} />
      {errorText('description')}

      <div className="form-row">
        <div className="field">
          <label htmlFor="cuisine">Cuisine</label>
          <input id="cuisine" name={FIELD.cuisine} value={fields.cuisine} onChange={setField('cuisine')} maxLength={LIMITS.cuisine} {...invalid('cuisine')} />
          {errorText('cuisine')}
        </div>
        <div className="field">
          <label htmlFor="servings">Servings</label>
          <input id="servings" name={FIELD.servings} value={fields.servings} onChange={setField('servings')} inputMode="numeric" className="input-short" {...invalid('servings')} />
          {errorText('servings')}
        </div>
        <div className="field">
          <label htmlFor="prep">Prep time (minutes)</label>
          <input id="prep" name={FIELD.prepMinutes} value={fields.prepMinutes} onChange={setField('prepMinutes')} inputMode="numeric" className="input-short" {...invalid('prepMinutes')} />
          {errorText('prepMinutes')}
        </div>
        <div className="field">
          <label htmlFor="cook">Cook time (minutes)</label>
          <input id="cook" name={FIELD.cookMinutes} value={fields.cookMinutes} onChange={setField('cookMinutes')} inputMode="numeric" className="input-short" {...invalid('cookMinutes')} />
          {errorText('cookMinutes')}
        </div>
      </div>

      <fieldset className="rows">
        <legend>Ingredients *</legend>
        <p className="hint">Amounts can be like 2, 1.5, or 1 1/2. Fill in “To” for a range, like 2 to 3.</p>
        {errorText('ingredients')}
        <ol className="row-list">
          {ingredients.map((row, i) => {
            const n = i + 1
            const rowError = `ingredient-${i}`
            const units = !row.unit || UNIT_LIST.includes(row.unit) ? UNIT_LIST : [row.unit, ...UNIT_LIST]
            return (
              <li key={row.key} className="ingredient-row">
                <div className="ingredient-fields">
                  <div className="field">
                    <label htmlFor={`ing-${i}-quantity`}>Amount<span className="visually-hidden"> for ingredient {n}</span></label>
                    <input id={`ing-${i}-quantity`} name={FIELD.quantity} value={row.quantity} onChange={(e) => setIngredient(i, 'quantity', e.target.value)} className="input-short" {...invalid(rowError)} />
                  </div>
                  <div className="field">
                    <label htmlFor={`ing-${i}-max`}>To<span className="visually-hidden"> (optional) for ingredient {n}</span></label>
                    <input id={`ing-${i}-max`} name={FIELD.quantityMax} value={row.quantityMax} onChange={(e) => setIngredient(i, 'quantityMax', e.target.value)} className="input-short" />
                  </div>
                  <div className="field">
                    <label htmlFor={`ing-${i}-unit`}>Unit<span className="visually-hidden"> for ingredient {n}</span></label>
                    <select id={`ing-${i}-unit`} name={FIELD.unit} value={row.unit} onChange={(e) => setIngredient(i, 'unit', e.target.value)}>
                      <option value="">(none)</option>
                      {units.map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field field-grow">
                    <label htmlFor={`ing-${i}-name`}>Ingredient {n}</label>
                    <input id={`ing-${i}-name`} name={FIELD.name} value={row.name} onChange={(e) => setIngredient(i, 'name', e.target.value)} maxLength={LIMITS.ingredientName} {...invalid(rowError)} />
                  </div>
                  <div className="field field-grow">
                    <label htmlFor={`ing-${i}-note`}>Note<span className="visually-hidden"> for ingredient {n}</span></label>
                    <input id={`ing-${i}-note`} name={FIELD.note} value={row.note} onChange={(e) => setIngredient(i, 'note', e.target.value)} placeholder="chopped, to taste…" maxLength={LIMITS.ingredientNote} />
                  </div>
                </div>
                {errorText(rowError)}
                <RowButtons
                  label={`ingredient ${n}`}
                  onUp={i > 0 ? () => setIngredients((l) => move(l, i, i - 1)) : undefined}
                  onDown={i < ingredients.length - 1 ? () => setIngredients((l) => move(l, i, i + 1)) : undefined}
                  onRemove={ingredients.length > 1 ? () => setIngredients((l) => l.filter((_, j) => j !== i)) : undefined}
                />
              </li>
            )
          })}
        </ol>
        <button type="button" className="secondary" onClick={() => setIngredients((l) => [...l, { ...EMPTY_INGREDIENT, key: newKey() }])}>
          Add ingredient
        </button>
      </fieldset>

      <fieldset className="rows">
        <legend>Steps *</legend>
        {errorText('steps')}
        <ol className="row-list">
          {steps.map((step, i) => {
            const n = i + 1
            return (
              <li key={step.key} className="step-row">
                <label htmlFor={`step-${i}-text`}>Step {n}</label>
                <textarea
                  id={`step-${i}-text`}
                  name={FIELD.step}
                  value={step.text}
                  onChange={(e) => setSteps((l) => l.map((s, j) => (j === i ? { ...s, text: e.target.value } : s)))}
                  rows={3}
                  maxLength={LIMITS.step}
                  {...invalid(`step-${i}`)}
                />
                {errorText(`step-${i}`)}
                <RowButtons
                  label={`step ${n}`}
                  onUp={i > 0 ? () => setSteps((l) => move(l, i, i - 1)) : undefined}
                  onDown={i < steps.length - 1 ? () => setSteps((l) => move(l, i, i + 1)) : undefined}
                  onRemove={steps.length > 1 ? () => setSteps((l) => l.filter((_, j) => j !== i)) : undefined}
                />
              </li>
            )
          })}
        </ol>
        <button type="button" className="secondary" onClick={() => setSteps((l) => [...l, { key: newKey(), text: '' }])}>
          Add step
        </button>
      </fieldset>

      <label htmlFor="tags">Tags</label>
      <input id="tags" name={FIELD.tags} value={fields.tags} onChange={setField('tags')} aria-describedby={errors.tags ? 'tags-hint tags-error' : 'tags-hint'} aria-invalid={errors.tags ? true : undefined} />
      <p className="hint" id="tags-hint">Separate tags with commas, like: dinner, quick, family</p>
      {errorText('tags')}

      <label htmlFor="notes">My notes</label>
      <textarea id="notes" name={FIELD.notes} value={fields.notes} onChange={setField('notes')} rows={4} maxLength={LIMITS.notes} {...invalid('notes')} />
      {errorText('notes')}

      <div className="actions">
        <button type="submit" disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        <Link href={cancelHref} onClick={onCancel}>Cancel</Link>
        {dirty && !pending && <span className="hint">You have unsaved changes.</span>}
      </div>
    </form>
  )
}

function RowButtons({ label, onUp, onDown, onRemove }: { label: string; onUp?: () => void; onDown?: () => void; onRemove?: () => void }) {
  return (
    <div className="row-buttons">
      <button type="button" className="link-button" onClick={onUp} disabled={!onUp} aria-label={`Move ${label} up`}>↑ Up</button>
      <button type="button" className="link-button" onClick={onDown} disabled={!onDown} aria-label={`Move ${label} down`}>↓ Down</button>
      <button type="button" className="link-button" onClick={onRemove} disabled={!onRemove} aria-label={`Remove ${label}`}>Remove</button>
    </div>
  )
}
