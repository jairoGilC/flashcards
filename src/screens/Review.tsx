import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useApp } from '../app/AppContext'
import { href } from '../app/router'
import { buildQueue, isVisible, shouldRequeue, studyDayStart } from '../core/queue'
import { GRADES, preview, type GradeName } from '../core/scheduler'
import type { CardRow, DeckRow } from '../db/db'
import { getNewPerDay, loadQueueInputs, newSeenToday, rateCard } from '../db/repo'
import { DiamondPips, FacetButton, Icon, IconButton, MiniDiamond, type FacetVariant } from '../ui'
import { BackFace, FrontFace } from './study/CardFaces'
import { requeueIndex } from './study/helpers'
import './study/study.css'

const GRADE_UI: Record<GradeName, { label: string; variant: FacetVariant; key: string }> = {
  again: { label: 'Otra vez', variant: 'ruby', key: '1' },
  hard: { label: 'Difícil', variant: 'amber', key: '2' },
  good: { label: 'Bien', variant: 'emerald', key: '3' },
  easy: { label: 'Fácil', variant: 'sapphire', key: '4' },
}

type Tally = Record<GradeName, number>
const EMPTY_TALLY: Tally = { again: 0, hard: 0, good: 0, easy: 0 }

type Load =
  | { status: 'loading' }
  | { status: 'locked'; deck: DeckRow }
  | { status: 'error' }
  | { status: 'ready'; decks: Map<string, DeckRow> }

export default function Review({ deckId }: { deckId?: string }) {
  const { db, showRed } = useApp()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [ids, setIds] = useState<string[]>([])
  const [cards, setCards] = useState<Map<string, CardRow>>(new Map())
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY)
  const [error, setError] = useState<string>()
  const busy = useRef(false)

  // Build the queue once per visit; it stays stable while studying even as the DB changes underneath.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const now = Date.now()
      const focus = deckId ? await db.decks.get(deckId) : undefined
      if (focus && !isVisible(focus.rating, showRed)) {
        if (!cancelled) setLoad({ status: 'locked', deck: focus })
        return
      }
      const [inputs, newPerDay, seen, deckRows] = await Promise.all([
        loadQueueInputs(db),
        getNewPerDay(db),
        newSeenToday(db, now),
        db.decks.toArray(),
      ])
      const queue = buildQueue(inputs.decks, inputs.cards, {
        now,
        newPerDay,
        newSeenToday: seen,
        showRed,
        seed: studyDayStart(now),
        deckIds: deckId ? [deckId] : undefined,
      })
      const rows = (await db.cards.bulkGet(queue.cardIds)).filter((c): c is CardRow => !!c)
      if (cancelled) return
      setIds(rows.map((c) => c.id))
      setCards(new Map(rows.map((c) => [c.id, c])))
      setLoad({ status: 'ready', decks: new Map(deckRows.map((d) => [d.id, d])) })
    })().catch(() => {
      // After unmount the DB may already be closed; only a live screen needs to report it.
      if (!cancelled) setLoad({ status: 'error' })
    })
    return () => {
      cancelled = true
    }
  }, [db, deckId, showRed])

  const current = load.status === 'ready' && pos < ids.length ? cards.get(ids[pos]) : undefined
  const deck = current && load.status === 'ready' ? load.decks.get(current.deckId) : undefined
  // Recomputed per card so labels reflect the card's latest state after an in-session requeue.
  const previews = useMemo(() => (current ? preview(current.srs, Date.now()) : []), [current])

  const flip = useCallback(() => setFlipped(true), [])

  const grade = useCallback(
    async (g: GradeName) => {
      if (!current || busy.current) return
      busy.current = true
      try {
        const now = Date.now()
        const updated = await rateCard(db, current.id, g, now)
        setCards((m) => new Map(m).set(updated.id, updated))
        if (shouldRequeue(updated.srs, now)) {
          setIds((q) => {
            const at = requeueIndex(pos, q.length)
            return [...q.slice(0, at), updated.id, ...q.slice(at)]
          })
        }
        setTally((t) => ({ ...t, [g]: t[g] + 1 }))
        setPos((p) => p + 1)
        setFlipped(false)
        setError(undefined)
      } catch {
        setError('No se pudo guardar la respuesta. Inténtalo de nuevo.')
      } finally {
        busy.current = false
      }
    },
    [current, db, pos],
  )

  useEffect(() => {
    if (!current) return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement | null
      // Let focused controls handle their own Space/Enter; keeps one action per key press.
      const onControl = !!target?.closest('button, a, input, textarea, select')
      if (!flipped && (e.key === ' ' || e.key === 'Enter') && !onControl) {
        e.preventDefault()
        flip()
      } else if (flipped && !target?.closest('input, textarea, select')) {
        const g = GRADES.find((name) => GRADE_UI[name].key === e.key)
        if (g) {
          e.preventDefault()
          void grade(g)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [current, flipped, flip, grade])

  const title = deckId ? (load.status === 'locked' ? load.deck.name : load.status === 'ready' ? load.decks.get(deckId)?.name : undefined) : 'Repaso diario · mixto'

  return (
    <main className={`screen screen--night review ${current && deck ? 'review--card' : ''}`}>
      <div className="phone-column review__column">
        <header className="review__header">
          <IconButton label="Cerrar repaso" href={href('home')}>
            <Icon name="close" />
          </IconButton>
          <div className="review__progress">
            <div className="review__title-row">
              <h1 className="chrome review__title" lang={deckId ? 'ja' : undefined}>
                {title ?? 'Repaso'}
              </h1>
              {current && (
                <span className="chrome review__count">
                  {pos + 1} / {ids.length}
                </span>
              )}
            </div>
            {current && <DiamondPips total={ids.length} done={pos} />}
          </div>
        </header>

        {load.status === 'loading' && <p className="review__status" aria-live="polite">Barajando cartas…</p>}

        {load.status === 'error' && (
          <section className="panel review__message">
            <h2 className="chrome review__message-title">Algo salió mal</h2>
            <p role="alert">No se pudieron cargar las cartas. Cierra y vuelve a intentarlo.</p>
            <FacetButton href={href('home')} full>
              Volver a mis mazos
            </FacetButton>
          </section>
        )}

        {load.status === 'locked' && (
          <Message title="Mazo oculto" icon="lock">
            <p>Este mazo es rojo y los mazos rojos están ocultos. Actívalos en Ajustes para repasarlo.</p>
            <FacetButton href={href('settings')} full>
              Ir a ajustes
            </FacetButton>
            <FacetButton href={href('home')} variant="dark" full>
              Volver a mis mazos
            </FacetButton>
          </Message>
        )}

        {load.status === 'ready' && ids.length === 0 && (
          <Message title="Nada por repasar hoy" icon="check">
            <p>Todo al día. Vuelve mañana o sube las cartas nuevas por día en Ajustes.</p>
            <FacetButton href={href('home')} full>
              Volver a mis mazos
            </FacetButton>
          </Message>
        )}

        {load.status === 'ready' && ids.length > 0 && pos >= ids.length && <Done tally={tally} />}

        {current && deck && (
          <>
            <div className="review__stage">{flipped ? <BackFace key={`b-${pos}`} card={current} deck={deck} /> : <FrontFace card={current} deck={deck} />}</div>
            {error && (
              <p role="alert" className="review__error">
                {error}
              </p>
            )}
            {flipped ? (
              <div className="review__grades">
                <span className="chrome review__ask">¿Qué tan bien la recordaste?</span>
                <div className="grade-row">
                  {previews.map((p) => (
                    <FacetButton
                      key={p.grade}
                      variant={GRADE_UI[p.grade].variant}
                      highlight={p.grade === 'good'}
                      className="grade-btn"
                      onClick={() => void grade(p.grade)}
                    >
                      <span className="grade-btn__label">{GRADE_UI[p.grade].label}</span>
                      <span className="grade-btn__ivl">{p.label}</span>
                    </FacetButton>
                  ))}
                </div>
              </div>
            ) : (
              <FacetButton full onClick={flip} className="review__flip">
                Girar carta
              </FacetButton>
            )}
          </>
        )}
      </div>
    </main>
  )
}

function Message({ title, icon, children }: { title: string; icon: 'lock' | 'check'; children: ReactNode }) {
  return (
    <section className="panel review__message">
      <span className="review__message-icon" aria-hidden="true">
        <Icon name={icon} size={28} />
      </span>
      <h2 className="chrome review__message-title">{title}</h2>
      {children}
    </section>
  )
}

function Done({ tally }: { tally: Tally }) {
  const total = GRADES.reduce((s, g) => s + tally[g], 0)
  const colors: Record<GradeName, string> = { again: 'var(--ruby)', hard: 'var(--amber)', good: 'var(--emerald)', easy: 'var(--sapphire)' }
  return (
    <section className="panel review__message review__done" aria-live="polite">
      <span className="review__message-icon" aria-hidden="true">
        <Icon name="check" size={28} />
      </span>
      <h2 className="chrome review__message-title">¡Repaso completado!</h2>
      <p>{total === 1 ? '1 respuesta' : `${total} respuestas`} en esta sesión.</p>
      <ul className="tally">
        {GRADES.map((g) => (
          <li key={g}>
            <MiniDiamond color={colors[g]} size={8} />
            <span>{GRADE_UI[g].label}</span>
            <strong className="chrome">{tally[g]}</strong>
          </li>
        ))}
      </ul>
      <FacetButton href={href('home')} full>
        Volver a mis mazos
      </FacetButton>
    </section>
  )
}
