import type { KeyboardEvent } from 'react'
import type { DeckRating } from '../../core/queue'

const OPTIONS: { value: DeckRating; label: string }[] = [
  { value: 'green', label: 'Verde' },
  { value: 'red', label: 'Rojo' },
]

/** Verde/Rojo segmented control with radio semantics and arrow-key switching. */
export function RatingRadios({ value, onChange, label }: { value: DeckRating; onChange: (v: DeckRating) => void; label: string }) {
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
    e.preventDefault()
    const next = value === 'green' ? 'red' : 'green'
    onChange(next)
    const group = e.currentTarget.parentElement
    group?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="ed-rating">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          data-value={o.value}
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          className={`ed-rating__opt ed-rating__opt--${o.value} chrome`}
          onClick={() => onChange(o.value)}
          onKeyDown={onKeyDown}
        >
          <span aria-hidden="true" className="ed-rating__dot" />
          {o.label}
        </button>
      ))}
    </div>
  )
}
