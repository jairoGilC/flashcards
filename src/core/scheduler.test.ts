import { describe, expect, it } from 'vitest'
import { formatInterval, newSrs, preview, rate, CardState } from './scheduler'

const NOW = new Date('2026-10-28T10:00:00Z').getTime()

describe('formatInterval', () => {
  it.each([
    [30 * 1000, '<1 min'],
    [6 * 60 * 1000, '6 min'],
    [3 * 60 * 60 * 1000, '3 h'],
    [24 * 60 * 60 * 1000, '1 día'],
    [4 * 24 * 60 * 60 * 1000, '4 días'],
    [45 * 24 * 60 * 60 * 1000, '1.5 meses'],
    [400 * 24 * 60 * 60 * 1000, '1.1 años'],
  ])('formats %d ms as %s', (ms, label) => {
    expect(formatInterval(ms)).toBe(label)
  })
})

describe('scheduler', () => {
  it('creates new cards due now in the New state', () => {
    const srs = newSrs(NOW)
    expect(srs.state).toBe(CardState.New)
    expect(srs.due).toBe(NOW)
    expect(srs.reps).toBe(0)
  })

  it('previews four grades with increasing intervals for a new card', () => {
    const p = preview(newSrs(NOW), NOW)
    expect(p.map((x) => x.grade)).toEqual(['again', 'hard', 'good', 'easy'])
    const dues = p.map((x) => x.due)
    expect(dues[0]).toBeLessThanOrEqual(dues[1])
    expect(dues[1]).toBeLessThanOrEqual(dues[2])
    expect(dues[2]).toBeLessThan(dues[3])
    expect(p[3].label).toMatch(/día/)
  })

  it('moves a new card to Learning on Good and to Review on Easy', () => {
    expect(rate(newSrs(NOW), 'good', NOW).state).toBe(CardState.Learning)
    expect(rate(newSrs(NOW), 'easy', NOW).state).toBe(CardState.Review)
  })

  it('sends a forgotten review card to Relearning and counts the lapse', () => {
    const learned = rate(newSrs(NOW), 'easy', NOW)
    const later = learned.due + 1000
    const forgotten = rate(learned, 'again', later)
    expect(forgotten.state).toBe(CardState.Relearning)
    expect(forgotten.lapses).toBe(1)
    expect(forgotten.due).toBeLessThan(later + 24 * 60 * 60 * 1000)
  })

  it('stores only plain numbers so the state survives IndexedDB / JSON', () => {
    const srs = rate(newSrs(NOW), 'good', NOW)
    const roundTrip = JSON.parse(JSON.stringify(srs))
    expect(roundTrip).toEqual(srs)
    expect(rate(roundTrip, 'good', NOW + 60_000).reps).toBe(2)
  })
})
