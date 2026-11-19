// One recipe page layout for catalog recipes, saved copies, and private recipes
// (REQ-1.5). The page passes in its buttons as `actions`.
// The photo, servings control, unit toggle, and Cooking Mode come with their M3 issues.

import type { ReactNode } from 'react'
import { isWebLink } from '@/lib/catalog'
import { formatMinutes, totalMinutes, type RecipeView } from '@/lib/recipes/view'

export function RecipeDetail({ recipe: r, actions }: { recipe: RecipeView; actions?: ReactNode }) {
  const facts: [string, string][] = []
  if (r.cuisine) facts.push(['Cuisine', r.cuisine])
  if (r.servings) facts.push(['Servings', String(r.servings)])
  const prep = formatMinutes(r.prepMinutes)
  const cook = formatMinutes(r.cookMinutes)
  const total = formatMinutes(totalMinutes(r))
  if (prep) facts.push(['Prep', prep])
  if (cook) facts.push(['Cook', cook])
  if (total && prep && cook) facts.push(['Total', total])

  return (
    <article className="recipe-detail">
      <header>
        {r.kind !== 'catalog' && (
          <p className="recipe-labels">
            <span className="label">{r.kind === 'saved_copy' ? 'Saved copy' : 'Private'}</span>
            {r.modified && <span className="label label-modified">Modified</span>}
            <span className="hint">Only you can see this recipe.</span>
          </p>
        )}
        <h1>{r.title}</h1>
        {r.description && <p className="lead">{r.description}</p>}

        {r.source && (
          // BR-8: always show where a recipe came from; link it when it's a real web page.
          <p className="meta">
            {r.kind === 'saved_copy' ? 'Copied from: ' : 'Source: '}
            {isWebLink(r.source.url) ? (
              <a href={r.source.url} rel="noopener noreferrer" target="_blank">
                {r.source.site}
                <span className="visually-hidden"> (opens in a new tab)</span>
              </a>
            ) : (
              r.source.site
            )}
          </p>
        )}

        {facts.length > 0 && (
          <dl className="recipe-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {r.tags.length > 0 && (
          <ul className="tag-list" aria-label="Tags">
            {r.tags.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        )}

        {actions && <div className="recipe-actions">{actions}</div>}
      </header>

      {/* NFR-11: on every recipe. */}
      <p className="notice allergen-notice" role="note">
        <strong>Check before you cook:</strong> ingredient and allergen information comes from the recipe’s source
        or its owner, and isn’t checked by Forkful. Read product labels, and ask about allergies when cooking for others.
      </p>

      <div className="recipe-body">
        <section aria-labelledby="ingredients-heading">
          <h2 id="ingredients-heading">Ingredients</h2>
          {r.ingredients.length ? (
            <ul className="ingredient-list">
              {r.ingredients.map((i) => (
                <li key={i.position}>{i.rawText}</li>
              ))}
            </ul>
          ) : (
            <p className="hint">No ingredients listed.</p>
          )}
        </section>

        <section aria-labelledby="steps-heading">
          <h2 id="steps-heading">Steps</h2>
          {r.steps.length ? (
            <ol className="step-list">
              {r.steps.map((s, n) => (
                <li key={n}>{s}</li>
              ))}
            </ol>
          ) : (
            <p className="hint">No steps listed.</p>
          )}
        </section>
      </div>

      {r.notes && (
        <section aria-labelledby="notes-heading" className="recipe-notes">
          <h2 id="notes-heading">My notes</h2>
          <p>{r.notes}</p>
        </section>
      )}
    </article>
  )
}
