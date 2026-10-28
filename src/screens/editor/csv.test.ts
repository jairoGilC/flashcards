import { describe, expect, it } from 'vitest'
import { parseCardCsv } from './csv'

describe('parseCardCsv', () => {
  it('reads comma-separated rows in column order', () => {
    const r = parseCardCsv('毎朝おにぎりを[食べます]。,食べる,たべる,comer,Como un onigiri.\n話す,話す,はなす,hablar')
    expect(r.cards).toEqual([
      { line: 1, question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', translation: 'Como un onigiri.' },
      { line: 2, question: '話す', answer: '話す', reading: 'はなす', meaning: 'hablar', translation: '' },
    ])
    expect(r.rejected).toEqual([])
  })

  it('detects tab separation (pasted from a spreadsheet)', () => {
    const r = parseCardCsv('読む\t読む\tよむ\tleer, estudiar')
    expect(r.cards[0]).toMatchObject({ question: '読む', meaning: 'leer, estudiar' })
  })

  it('skips an optional header row in Spanish or English', () => {
    expect(parseCardCsv('question,answer,reading\n話す,話す,はなす').cards).toHaveLength(1)
    const r = parseCardCsv('Pregunta,Respuesta,Lectura,Significado,Traducción\n話す,話す')
    expect(r.cards).toEqual([expect.objectContaining({ line: 2, question: '話す' })])
  })

  it('handles quoted fields with commas, escaped quotes and newlines', () => {
    const r = parseCardCsv('"雨が[降って]います。",降る,ふる,"caer, llover","Dice ""está lloviendo""\ny hace frío"\n聞く,聞く')
    expect(r.cards[0]).toMatchObject({ meaning: 'caer, llover', translation: 'Dice "está lloviendo"\ny hace frío' })
    // The second record starts on line 3 because the quoted field spans two lines.
    expect(r.cards[1]).toMatchObject({ line: 3, question: '聞く' })
  })

  it('skips blank rows, trims cells and accepts CRLF and a BOM', () => {
    const r = parseCardCsv('\uFEFF 話す , 話す \r\n\r\n , , \r\n読む,読む\r\n')
    expect(r.cards.map((c) => [c.line, c.question, c.answer])).toEqual([
      [1, '話す', '話す'],
      [4, '読む', '読む'],
    ])
    expect(r.rejected).toEqual([])
  })

  it('rejects rows without question or answer, or with unclosed brackets', () => {
    const r = parseCardCsv('話す\n,話す\n本を[読む,読む\n書く,書く')
    expect(r.cards.map((c) => c.question)).toEqual(['書く'])
    expect(r.rejected.map((x) => x.line)).toEqual([1, 2, 3])
    expect(r.rejected[0].reason).toMatch(/respuesta/i)
    expect(r.rejected[1].reason).toMatch(/pregunta/i)
    expect(r.rejected[2].reason).toMatch(/corchete/i)
  })

  it('rejects an unterminated quoted field instead of swallowing the file', () => {
    const r = parseCardCsv('話す,話す\n"読む,読む')
    expect(r.cards).toHaveLength(1)
    expect(r.rejected).toEqual([{ line: 2, reason: expect.stringMatching(/comillas/i) }])
  })

  it('returns nothing for empty input', () => {
    expect(parseCardCsv('  \n ')).toEqual({ cards: [], rejected: [] })
  })
})
