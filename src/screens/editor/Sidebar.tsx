import { useState, type FormEvent } from 'react'
import { useApp } from '../../app/AppContext'
import { go, href } from '../../app/router'
import type { DeckRating } from '../../core/queue'
import type { DeckRow } from '../../db/db'
import { createDeck } from '../../db/repo'
import { RatingChip } from '../../ui'
import { RatingRadios } from './RatingRadios'

function NewDeckForm({ onClose }: { onClose: () => void }) {
  const { db } = useApp()
  const [name, setName] = useState('')
  const [rating, setRating] = useState<DeckRating>('green')
  const [error, setError] = useState('')

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Ponle un nombre al mazo.')
      return
    }
    const id = await createDeck(db, { name: trimmed, rating }, Date.now())
    onClose()
    go('editor', { deck: id })
  }

  return (
    <form className="ed-newdeck" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <label className="label" htmlFor="ed-newdeck-name">
        Nombre del mazo
      </label>
      <input
        id="ed-newdeck-name"
        className="field"
        lang="ja"
        value={name}
        autoFocus
        aria-invalid={!!error}
        aria-describedby={error ? 'ed-newdeck-error' : undefined}
        onChange={(e) => setName(e.target.value)}
      />
      {error && (
        <span id="ed-newdeck-error" className="ed-error">
          {error}
        </span>
      )}
      <RatingRadios value={rating} onChange={setRating} label="Clasificación del nuevo mazo" />
      <div className="ed-row">
        <button type="submit" className="ed-btn ed-btn--dark chrome">
          Crear mazo
        </button>
        <button type="button" className="ed-btn chrome" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

export function Sidebar({ decks, counts, selectedId }: { decks: DeckRow[]; counts: Map<string, number>; selectedId?: string }) {
  const [creating, setCreating] = useState(false)
  return (
    <aside className="ed-sidebar">
      <button type="button" className="ed-btn ed-btn--dark ed-btn--block chrome" aria-expanded={creating} onClick={() => setCreating((v) => !v)}>
        + Nuevo mazo
      </button>
      {creating && <NewDeckForm onClose={() => setCreating(false)} />}
      {decks.length > 0 && (
        <nav aria-label="Mazos" className="ed-decklist">
          {decks.map((d) => (
            <a
              key={d.id}
              href={href('editor', { deck: d.id })}
              aria-current={d.id === selectedId ? 'page' : undefined}
              className={`ed-decklist__item ${d.rating === 'red' ? 'ed-decklist__item--red' : ''}`}
            >
              <span className="ed-decklist__name">
                <span className="mincho" lang="ja">
                  {d.name}
                </span>
                {d.rating === 'red' && <RatingChip rating="red" />}
              </span>
              <span className="ed-decklist__count chrome">
                {counts.get(d.id) ?? 0}
                <span className="sr-only"> cartas</span>
              </span>
            </a>
          ))}
        </nav>
      )}
    </aside>
  )
}
