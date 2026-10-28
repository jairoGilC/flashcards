import { describe, expect, it } from 'vitest'
import { CardState, newSrs } from '../../core/scheduler'
import { bracketError, formatBytes, stateLabel, validateCard } from './validate'

describe('bracketError', () => {
  it('accepts a bare word or one closed marker', () => {
    expect(bracketError('話す')).toBeUndefined()
    expect(bracketError('毎朝おにぎりを[食べます]。')).toBeUndefined()
  })
  it('flags unclosed, unopened, empty and nested brackets', () => {
    expect(bracketError('本を[読む')).toMatch(/cierra/i)
    expect(bracketError('本を読む]')).toMatch(/abre/i)
    expect(bracketError('本を[]読む')).toMatch(/vacío/i)
    expect(bracketError('[本を[読む]]')).toMatch(/dentro/i)
  })
})

describe('validateCard', () => {
  it('requires question and answer', () => {
    expect(validateCard({ question: ' ', answer: '' })).toEqual({
      question: 'Escribe la pregunta.',
      answer: 'Escribe la respuesta.',
    })
  })
  it('reports bracket problems on the question', () => {
    expect(validateCard({ question: '本を[読む', answer: '読む' }).question).toMatch(/cierra/i)
  })
  it('is empty for a valid card', () => {
    expect(validateCard({ question: '本を[読む]', answer: '読む' })).toEqual({})
  })
})

describe('stateLabel', () => {
  const NOW = new Date(2026, 9, 28, 10).getTime()
  const DAY = 86_400_000
  it('names new and learning cards', () => {
    expect(stateLabel(newSrs(NOW), NOW)).toBe('Nueva')
    expect(stateLabel({ ...newSrs(NOW), state: CardState.Learning }, NOW)).toBe('Aprendiendo')
    expect(stateLabel({ ...newSrs(NOW), state: CardState.Relearning }, NOW)).toBe('Aprendiendo')
  })
  it('shows days until due for review cards', () => {
    const review = { ...newSrs(NOW), state: CardState.Review }
    expect(stateLabel({ ...review, due: NOW + 3 * DAY }, NOW)).toBe('3 d')
    expect(stateLabel({ ...review, due: NOW + 2.2 * DAY }, NOW)).toBe('3 d')
    expect(stateLabel({ ...review, due: NOW - DAY }, NOW)).toBe('Hoy')
  })
})

describe('formatBytes', () => {
  it('uses KB below a megabyte and MB with one decimal above', () => {
    expect(formatBytes(0)).toBe('0 KB')
    expect(formatBytes(38_900)).toBe('38 KB')
    expect(formatBytes(4_800_000)).toBe('4.6 MB')
  })
})
