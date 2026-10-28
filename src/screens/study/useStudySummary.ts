import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { buildQueue, isVisible, studyDayStart, type DeckCounts } from '../../core/queue'
import type { DeckRow } from '../../db/db'
import { getNewPerDay, loadQueueInputs, newSeenToday } from '../../db/repo'

export interface StudySummary {
  /** Every deck, red ones included, so callers can count what is hidden. */
  decks: DeckRow[]
  /** Decks shown under the current red-deck setting, by name. */
  visible: DeckRow[]
  counts: Record<string, DeckCounts>
  total: number
  reviewCount: number
}

export function deckTotal(c: DeckCounts | undefined): number {
  return c ? c.new + c.learning + c.review : 0
}

/** Today's counts as the daily session would see them; re-runs when the database changes. */
export function useStudySummary(): StudySummary | undefined {
  const { db, showRed } = useApp()
  return useLiveQuery(async () => {
    const now = Date.now()
    const [{ decks: qDecks, cards }, decks, newPerDay, seen, reviewCount] = await Promise.all([
      loadQueueInputs(db),
      db.decks.toArray(),
      getNewPerDay(db),
      newSeenToday(db, now),
      db.reviews.count(),
    ])
    const queue = buildQueue(qDecks, cards, { now, newPerDay, newSeenToday: seen, showRed, seed: studyDayStart(now) })
    const visible = decks.filter((d) => isVisible(d.rating, showRed)).sort((a, b) => a.name.localeCompare(b.name))
    return { decks, visible, counts: queue.counts, total: queue.total, reviewCount }
  }, [db, showRed])
}
