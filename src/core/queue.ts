import { CardState, type Srs } from './scheduler'

export type DeckRating = 'green' | 'red'

export interface QueueDeck {
  id: string
  rating: DeckRating
  /** Relative weight in the daily new-card budget. */
  share: number
  /** Paused decks get no new cards; their reviews still come up. */
  paused: boolean
}

export interface QueueCard {
  id: string
  deckId: string
  /** Authoring order; new cards are introduced in this order. */
  order: number
  srs: Srs
}

export interface QueueOptions {
  now: number
  newPerDay: number
  newSeenToday: number
  showRed: boolean
  seed: number
  /** Restrict to these decks (focused session). Omit for the mixed daily session. */
  deckIds?: string[]
}

export interface DeckCounts {
  new: number
  learning: number
  review: number
}

export interface Queue {
  cardIds: string[]
  counts: Record<string, DeckCounts>
  total: number
}

/** Learning cards due within this window come back in the same session. */
export const LEARN_AHEAD_MS = 20 * 60 * 1000

/** Like Anki, the study day rolls over at 04:00 local time. */
export function nextDayStart(now: number): number {
  const d = new Date(now)
  d.setHours(4, 0, 0, 0)
  if (d.getTime() <= now) d.setDate(d.getDate() + 1)
  return d.getTime()
}

export function studyDayStart(now: number): number {
  const d = new Date(nextDayStart(now))
  d.setDate(d.getDate() - 1)
  return d.getTime()
}

export function isVisible(rating: DeckRating, showRed: boolean): boolean {
  return showRed || rating !== 'red'
}

export function shouldRequeue(srs: Srs, now: number): boolean {
  const learning = srs.state === CardState.Learning || srs.state === CardState.Relearning
  return learning && srs.due - now <= LEARN_AHEAD_MS
}

interface BudgetEntry {
  id: string
  share: number
  available: number
}

/**
 * Splits the daily new-card budget across decks by share (largest remainder),
 * then hands budget a deck cannot use to the decks that still have new cards.
 */
export function splitNewBudget(budget: number, entries: BudgetEntry[]): Record<string, number> {
  const quotas: Record<string, number> = Object.fromEntries(entries.map((e) => [e.id, 0]))
  let remaining = Math.min(Math.max(0, budget), entries.reduce((s, e) => s + e.available, 0))

  while (remaining > 0) {
    const active = entries.filter((e) => quotas[e.id] < e.available)
    if (active.length === 0) break
    const shareSum = active.reduce((s, e) => s + Math.max(0, e.share), 0)
    const weights = active.map((e) => (shareSum > 0 ? Math.max(0, e.share) : 1))
    const weightSum = weights.reduce((s, w) => s + w, 0)
    const raw = weights.map((w) => (remaining * w) / weightSum)
    const alloc = raw.map(Math.floor)
    let left = remaining - alloc.reduce((s, a) => s + a, 0)
    const byFraction = raw
      .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
      .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i)
    for (const { i } of byFraction) {
      if (left === 0) break
      alloc[i] += 1
      left -= 1
    }
    let given = 0
    active.forEach((e, i) => {
      const g = Math.min(alloc[i], e.available - quotas[e.id])
      quotas[e.id] += g
      given += g
    })
    if (given === 0) break
    remaining -= given
  }
  return quotas
}

// Small seeded PRNG so a day's shuffle is stable across re-renders.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function buildQueue(decks: QueueDeck[], cards: QueueCard[], opts: QueueOptions): Queue {
  const visible = decks.filter(
    (d) => isVisible(d.rating, opts.showRed) && (!opts.deckIds || opts.deckIds.includes(d.id)),
  )
  const visibleIds = new Set(visible.map((d) => d.id))
  const dayEnd = nextDayStart(opts.now)

  const counts: Record<string, DeckCounts> = Object.fromEntries(
    visible.map((d) => [d.id, { new: 0, learning: 0, review: 0 }]),
  )
  const newByDeck: Record<string, QueueCard[]> = Object.fromEntries(visible.map((d) => [d.id, []]))
  const due: QueueCard[] = []

  for (const c of cards) {
    if (!visibleIds.has(c.deckId)) continue
    const { state, due: dueAt } = c.srs
    if (state === CardState.New) {
      newByDeck[c.deckId].push(c)
    } else if (state === CardState.Learning || state === CardState.Relearning) {
      if (dueAt <= opts.now) {
        due.push(c)
        counts[c.deckId].learning += 1
      }
    } else if (dueAt < dayEnd) {
      due.push(c)
      counts[c.deckId].review += 1
    }
  }

  const quotas = splitNewBudget(
    opts.newPerDay - opts.newSeenToday,
    visible.filter((d) => !d.paused).map((d) => ({ id: d.id, share: d.share, available: newByDeck[d.id].length })),
  )
  const chosenNew: Record<string, QueueCard[]> = {}
  for (const d of visible) {
    const n = quotas[d.id] ?? 0
    chosenNew[d.id] = [...newByDeck[d.id]].sort((a, b) => a.order - b.order).slice(0, n)
    counts[d.id].new = n
  }

  const items = [...due, ...Object.values(chosenNew).flat()]
  const rand = mulberry32(opts.seed)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[items[i], items[j]] = [items[j], items[i]]
  }

  // The shuffle mixes decks; restore authoring order of each deck's new cards within their slots.
  for (const [deckId, ordered] of Object.entries(chosenNew)) {
    const slots = items.flatMap((c, i) => (c.deckId === deckId && c.srs.state === CardState.New ? [i] : []))
    slots.forEach((slot, k) => (items[slot] = ordered[k]))
  }

  const cardIds = items.map((c) => c.id)
  return { cardIds, counts, total: cardIds.length }
}
