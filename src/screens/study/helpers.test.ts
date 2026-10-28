import { describe, expect, it } from 'vitest'
import { estimateMinutes, levelFromReviews, requeueIndex, sharePercents, plural } from './helpers'

describe('estimateMinutes', () => {
  it('assumes about 10 s per card and never shows 0 for pending work', () => {
    expect(estimateMinutes(0)).toBe(0)
    expect(estimateMinutes(1)).toBe(1)
    expect(estimateMinutes(47)).toBe(8)
    expect(estimateMinutes(135)).toBe(23)
  })
})

describe('levelFromReviews', () => {
  it('gives 10 XP per review and a level every 500 XP', () => {
    expect(levelFromReviews(0)).toEqual({ level: 1, xp: 0, perLevel: 500 })
    expect(levelFromReviews(34)).toEqual({ level: 1, xp: 340, perLevel: 500 })
    expect(levelFromReviews(50)).toEqual({ level: 2, xp: 0, perLevel: 500 })
    expect(levelFromReviews(584)).toEqual({ level: 12, xp: 340, perLevel: 500 })
  })
})

describe('requeueIndex', () => {
  it('puts the card a few positions after the current one', () => {
    expect(requeueIndex(0, 10)).toBe(4)
  })
  it('falls back to the end of the queue', () => {
    expect(requeueIndex(8, 10)).toBe(10)
    expect(requeueIndex(0, 1)).toBe(1)
  })
})

describe('sharePercents', () => {
  it('splits 100% across active decks by share; paused decks get null', () => {
    expect(
      sharePercents([
        { id: 'a', share: 3, paused: false },
        { id: 'b', share: 1, paused: false },
        { id: 'c', share: 5, paused: true },
      ]),
    ).toEqual({ a: 75, b: 25, c: null })
  })
  it('treats all-zero shares as equal, like the queue builder', () => {
    expect(sharePercents([{ id: 'a', share: 0, paused: false }, { id: 'b', share: 0, paused: false }])).toEqual({ a: 50, b: 50 })
  })
})

describe('plural', () => {
  it('picks singular or plural form', () => {
    expect(plural(1, 'mazo', 'mazos')).toBe('1 mazo')
    expect(plural(3, 'mazo', 'mazos')).toBe('3 mazos')
    expect(plural(0, 'carta', 'cartas')).toBe('0 cartas')
  })
})
