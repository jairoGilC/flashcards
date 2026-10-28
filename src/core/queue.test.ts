import { describe, expect, it } from 'vitest'
import { buildQueue, nextDayStart, shouldRequeue, splitNewBudget, studyDayStart, type QueueCard, type QueueDeck } from './queue'
import { CardState, newSrs, rate } from './scheduler'

const NOW = new Date('2026-10-28T10:00:00Z').getTime()
const DAY = 24 * 60 * 60 * 1000

function deck(id: string, over: Partial<QueueDeck> = {}): QueueDeck {
  return { id, rating: 'green', share: 1, paused: false, ...over }
}

function newCards(deckId: string, n: number): QueueCard[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${deckId}-n${i}`, deckId, order: i, srs: newSrs(NOW - DAY) }))
}

function reviewCard(deckId: string, id: string, dueOffset: number): QueueCard {
  const srs = { ...rate(newSrs(NOW - 10 * DAY), 'easy', NOW - 10 * DAY), due: NOW + dueOffset }
  return { id, deckId, order: 0, srs }
}

function learningCard(deckId: string, id: string, dueOffset: number): QueueCard {
  const srs = { ...rate(newSrs(NOW), 'good', NOW), due: NOW + dueOffset }
  return { id, deckId, order: 0, srs }
}

describe('splitNewBudget', () => {
  it('splits by share using largest remainder', () => {
    const quotas = splitNewBudget(15, [
      { id: 'a', share: 40, available: 100 },
      { id: 'b', share: 35, available: 100 },
      { id: 'c', share: 25, available: 100 },
    ])
    expect(quotas).toEqual({ a: 6, b: 5, c: 4 })
  })

  it('gives leftover budget to decks that still have new cards', () => {
    const quotas = splitNewBudget(10, [
      { id: 'a', share: 50, available: 2 },
      { id: 'b', share: 50, available: 100 },
    ])
    expect(quotas).toEqual({ a: 2, b: 8 })
  })

  it('never exceeds total available', () => {
    expect(splitNewBudget(10, [{ id: 'a', share: 1, available: 3 }])).toEqual({ a: 3 })
  })

  it('handles all-zero shares by splitting evenly', () => {
    expect(splitNewBudget(4, [
      { id: 'a', share: 0, available: 9 },
      { id: 'b', share: 0, available: 9 },
    ])).toEqual({ a: 2, b: 2 })
  })
})

describe('buildQueue', () => {
  const opts = { now: NOW, newPerDay: 4, newSeenToday: 0, showRed: false, seed: 1 }

  it('mixes learning due now, reviews due today and new cards across decks', () => {
    const decks = [deck('a'), deck('b')]
    const cards = [
      ...newCards('a', 5),
      ...newCards('b', 5),
      reviewCard('a', 'a-r-due', -DAY),
      reviewCard('b', 'b-r-today', 2 * 60 * 60 * 1000),
      reviewCard('b', 'b-r-future', 3 * DAY),
      learningCard('a', 'a-l-now', -60_000),
      learningCard('a', 'a-l-later', 3 * 60 * 60 * 1000),
    ]
    const q = buildQueue(decks, cards, opts)
    const ids = q.cardIds
    expect(ids).toContain('a-r-due')
    expect(ids).toContain('b-r-today')
    expect(ids).toContain('a-l-now')
    expect(ids).not.toContain('b-r-future')
    expect(ids).not.toContain('a-l-later')
    expect(ids.filter((id) => /-n\d+$/.test(id))).toHaveLength(4)
    expect(ids.filter((id) => id.startsWith('a-n'))).toEqual(['a-n0', 'a-n1'])
    expect(ids.filter((id) => id.startsWith('b-n'))).toEqual(['b-n0', 'b-n1'])
    expect(q.counts).toEqual({
      a: { new: 2, learning: 1, review: 1 },
      b: { new: 2, learning: 0, review: 1 },
    })
    expect(q.total).toBe(ids.length)
  })

  it('excludes red decks unless showRed is on', () => {
    const decks = [deck('g'), deck('r', { rating: 'red' })]
    const cards = [...newCards('g', 3), ...newCards('r', 3), reviewCard('r', 'r-rev', -DAY)]
    const hidden = buildQueue(decks, cards, opts)
    expect(hidden.cardIds.some((id) => id.startsWith('r'))).toBe(false)
    expect(hidden.counts.r).toBeUndefined()

    const shown = buildQueue(decks, cards, { ...opts, showRed: true })
    expect(shown.cardIds).toContain('r-rev')
    expect(shown.counts.r).toBeDefined()
  })

  it('takes no new cards from paused decks but still reviews them', () => {
    const decks = [deck('a', { paused: true }), deck('b')]
    const cards = [...newCards('a', 5), ...newCards('b', 5), reviewCard('a', 'a-rev', -DAY)]
    const q = buildQueue(decks, cards, opts)
    expect(q.cardIds).toContain('a-rev')
    expect(q.cardIds.filter((id) => id.startsWith('a-n'))).toHaveLength(0)
    expect(q.cardIds.filter((id) => id.startsWith('b-n'))).toHaveLength(4)
  })

  it('subtracts new cards already introduced today from the budget', () => {
    const q = buildQueue([deck('a')], newCards('a', 10), { ...opts, newSeenToday: 3 })
    expect(q.cardIds).toHaveLength(1)
  })

  it('limits to the given deck ids for a focused session', () => {
    const decks = [deck('a'), deck('b')]
    const cards = [...newCards('a', 5), ...newCards('b', 5)]
    const q = buildQueue(decks, cards, { ...opts, deckIds: ['b'] })
    expect(q.cardIds.every((id) => id.startsWith('b'))).toBe(true)
    expect(q.cardIds).toHaveLength(4)
  })

  it('is deterministic for a seed and actually shuffles', () => {
    const decks = [deck('a'), deck('b')]
    const cards = [
      ...newCards('a', 10),
      ...newCards('b', 10),
      ...Array.from({ length: 10 }, (_, i) => reviewCard('a', `a-r${i}`, -DAY)),
    ]
    const o = { ...opts, newPerDay: 20 }
    const q1 = buildQueue(decks, cards, o)
    const q2 = buildQueue(decks, cards, o)
    expect(q1.cardIds).toEqual(q2.cardIds)
    const sorted = [...q1.cardIds].sort()
    expect(q1.cardIds).not.toEqual(sorted)
  })

  it('keeps new cards of one deck in their authoring order', () => {
    const q = buildQueue([deck('a')], newCards('a', 6), { ...opts, newPerDay: 6, seed: 7 })
    expect(q.cardIds).toEqual(['a-n0', 'a-n1', 'a-n2', 'a-n3', 'a-n4', 'a-n5'])
  })

  it('requeues learning cards due within the learn-ahead window only', () => {
    const soon = rate(newSrs(NOW), 'again', NOW)
    expect(shouldRequeue(soon, NOW)).toBe(true)
    const learned = rate(newSrs(NOW), 'easy', NOW)
    expect(shouldRequeue(learned, NOW)).toBe(false)
  })

  it('rolls the study day over at 04:00 local time', () => {
    const d = new Date(2026, 9, 28, 3, 30).getTime()
    expect(new Date(nextDayStart(d)).getDate()).toBe(28)
    expect(new Date(nextDayStart(d)).getHours()).toBe(4)
    const e = new Date(2026, 9, 28, 4, 30).getTime()
    expect(new Date(nextDayStart(e)).getDate()).toBe(29)
    expect(studyDayStart(e)).toBe(new Date(2026, 9, 28, 4, 0).getTime())
  })

  it('treats Relearning like Learning', () => {
    const relearn: QueueCard = { id: 'x', deckId: 'a', order: 0, srs: { ...newSrs(NOW), state: CardState.Relearning, due: NOW - 1 } }
    expect(buildQueue([deck('a')], [relearn], opts).counts.a.learning).toBe(1)
  })
})
