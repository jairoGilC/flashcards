import type { ReactNode } from 'react'
import { render } from '@testing-library/react'
import { AppProvider } from '../../app/AppContext'
import { KotobaDB, type CardRow, type DeckRow } from '../../db/db'
import { CardState, newSrs, type Srs } from '../../core/scheduler'

const DAY = 24 * 60 * 60 * 1000
let dbSeq = 0

export function freshDb(): KotobaDB {
  dbSeq += 1
  return new KotobaDB(`study-test-${dbSeq}-${Math.random().toString(36).slice(2)}`)
}

export function deck(id: string, over: Partial<DeckRow> = {}): DeckRow {
  return { id, name: id, rating: 'green', share: 1, paused: false, createdAt: 0, updatedAt: 0, ...over }
}

/** A review-state card that is due now. */
export function dueSrs(now = Date.now()): Srs {
  return {
    ...newSrs(now - 4 * DAY),
    state: CardState.Review,
    due: now - 1000,
    stability: 4,
    difficulty: 5,
    reps: 3,
    scheduled_days: 3,
    elapsed_days: 3,
    last_review: now - 3 * DAY,
  }
}

export function card(deckId: string, fileId: string, over: Partial<CardRow> = {}): CardRow {
  return {
    id: `${deckId}::${fileId}`,
    deckId,
    fileId,
    order: 0,
    question: fileId,
    answer: fileId,
    srs: newSrs(Date.now() - 1000),
    ...over,
  }
}

export async function seed(db: KotobaDB, decks: DeckRow[], cards: CardRow[]): Promise<void> {
  await db.decks.bulkAdd(decks)
  await db.cards.bulkAdd(cards)
}

export function renderWith(db: KotobaDB, ui: ReactNode) {
  return render(<AppProvider db={db}>{ui}</AppProvider>)
}
