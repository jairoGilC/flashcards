import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../app/AppContext'
import { isVisible } from '../core/queue'
import type { DeckRow } from '../db/db'
import { getNewPerDay, setNewPerDay, updateDeck } from '../db/repo'
import { FacetButton, Icon, MiniDiamond, ScreenHeader, Toggle } from '../ui'
import { estimateMinutes, ratingColor, sharePercents } from './study/helpers'
import './study/study.css'

const STEP = 5
const MAX_NEW = 50
/** Rough steady state: each new card/day settles at ~9 reviews/day after a few weeks of FSRS. */
const REVIEWS_PER_NEW = 9
const MAX_SHARE = 10

export default function Settings() {
  const { db, showRed, setShowRed } = useApp()
  const newPerDay = useLiveQuery(() => getNewPerDay(db), [db])
  const decks = useLiveQuery(() => db.decks.toArray(), [db])

  const visible = (decks ?? []).filter((d) => isVisible(d.rating, showRed)).sort((a, b) => a.name.localeCompare(b.name))
  const percents = sharePercents(visible)
  const step = (delta: number) => {
    if (newPerDay == null) return
    const next = Math.min(MAX_NEW, Math.max(0, newPerDay + delta))
    if (next !== newPerDay) void setNewPerDay(db, next)
  }
  const reviews = (newPerDay ?? 0) * REVIEWS_PER_NEW

  return (
    <main className="screen screen--night">
      <div className="phone-column settings">
        <ScreenHeader title="Ajustes del día" />

        <section className="panel settings__panel" aria-labelledby="new-per-day">
          <h2 id="new-per-day" className="label settings__h2">
            Cartas nuevas por día
          </h2>
          <div className="stepper">
            <FacetButton variant="dark" size="s" className="icon-btn" ariaLabel="Menos cartas nuevas" onClick={() => step(-STEP)} disabled={newPerDay == null || newPerDay <= 0}>
              −
            </FacetButton>
            <output className="chrome stepper__value" aria-live="polite">
              {newPerDay ?? ''}
            </output>
            <FacetButton variant="dark" size="s" className="icon-btn" ariaLabel="Más cartas nuevas" onClick={() => step(STEP)} disabled={newPerDay == null || newPerDay >= MAX_NEW}>
              +
            </FacetButton>
          </div>
          {newPerDay != null && (
            <p className="settings__hint">
              En unas semanas: ≈ {reviews} repasos/día · ≈ {estimateMinutes(reviews)} min
            </p>
          )}
        </section>

        <section className="panel settings__panel" aria-labelledby="share">
          <h2 id="share" className="label settings__h2">
            Reparto de nuevas entre mazos
          </h2>
          {decks && visible.length === 0 && <p className="settings__hint">Aún no hay mazos.</p>}
          <ul className="share-list">
            {visible.map((d) => (
              <ShareRow key={d.id} deck={d} percent={percents[d.id]} />
            ))}
          </ul>
        </section>

        <section className="settings__red">
          <div className="settings__red-row">
            <Icon name="lock" size={18} />
            <span className="chrome settings__red-label" aria-hidden="true">
              Mostrar mazos rojos
            </span>
            <Toggle checked={showRed} onChange={setShowRed} label="Mostrar mazos rojos" />
          </div>
          <p className="settings__red-note">
            Ocultos por defecto: no aparecen en la lista, los conteos ni el repaso diario. Vuelven a ocultarse cada vez que abres la app.
          </p>
        </section>
      </div>
    </main>
  )
}

function ShareRow({ deck, percent }: { deck: DeckRow; percent: number | null }) {
  const { db } = useApp()
  const shown = percent == null ? 'Solo repasos' : `${percent}%`
  return (
    <li className="share-row">
      <div className="share-row__top">
        <MiniDiamond color={ratingColor(deck.rating)} size={8} />
        <span className="mincho share-row__name" lang="ja">
          {deck.name}
        </span>
        <span className="chrome share-row__pct">{shown}</span>
      </div>
      <div className="share-row__controls">
        {/* Uncontrolled: dragging stays smooth while each step is written to the DB. */}
        <input
          type="range"
          min={0}
          max={MAX_SHARE}
          step={1}
          defaultValue={Math.min(MAX_SHARE, deck.share)}
          disabled={deck.paused}
          aria-label={`Porcentaje de nuevas para ${deck.name}`}
          aria-valuetext={shown}
          onChange={(e) => void updateDeck(db, deck.id, { share: Number(e.target.value) })}
          className="share-row__range"
        />
        <button
          type="button"
          className={`chrome pause-btn ${deck.paused ? 'pause-btn--paused' : ''}`}
          aria-label={`${deck.paused ? 'Reanudar' : 'Pausar'} ${deck.name}`}
          onClick={() => void updateDeck(db, deck.id, { paused: !deck.paused })}
        >
          {deck.paused ? 'Reanudar' : 'Pausar'}
        </button>
      </div>
    </li>
  )
}
