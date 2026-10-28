import { describe, expect, it } from 'vitest'
import { parseQuestion } from './question'

describe('parseQuestion', () => {
  it('splits a sentence around the bracketed word', () => {
    expect(parseQuestion('毎朝おにぎりを[食べます]。')).toEqual({
      pre: '毎朝おにぎりを',
      word: '食べます',
      post: '。',
      isSentence: true,
    })
  })

  it('treats text without brackets as a single word', () => {
    expect(parseQuestion('話す')).toEqual({ pre: '', word: '話す', post: '', isSentence: false })
  })

  it('trims surrounding whitespace', () => {
    expect(parseQuestion('  話す ')).toEqual({ pre: '', word: '話す', post: '', isSentence: false })
  })

  it('only underlines the first bracketed segment and keeps later brackets literal', () => {
    expect(parseQuestion('[本]を[読む]')).toEqual({ pre: '', word: '本', post: 'を[読む]', isSentence: true })
  })

  it('treats an unclosed bracket as plain text', () => {
    expect(parseQuestion('本を[読む')).toEqual({ pre: '', word: '本を[読む', post: '', isSentence: false })
  })
})
