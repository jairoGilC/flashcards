import { validateCard } from './validate'

export interface CsvCard {
  /** 1-based line where the record starts, for error reports. */
  line: number
  question: string
  answer: string
  reading: string
  meaning: string
  translation: string
}

export interface CsvResult {
  cards: CsvCard[]
  rejected: { line: number; reason: string }[]
}

interface CsvRecord {
  line: number
  cells: string[]
  unterminated?: boolean
}

// RFC 4180 style: quotes may wrap delimiters and newlines, "" is a literal quote.
function records(text: string, sep: string): CsvRecord[] {
  const out: CsvRecord[] = []
  let cells: string[] = []
  let cell = ''
  let quoted = false
  let line = 1
  let start = 1
  const push = () => {
    cells.push(cell)
    out.push({ line: start, cells })
    cells = []
    cell = ''
    start = line
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') quoted = false
      else {
        if (ch === '\n') line++
        cell += ch
      }
    } else if (ch === '"' && cell.trim() === '') {
      cell = ''
      quoted = true
    } else if (ch === sep) {
      cells.push(cell)
      cell = ''
    } else if (ch === '\n') {
      line++
      push()
    } else if (ch !== '\r') cell += ch
  }
  if (quoted) out.push({ line: start, cells: [], unterminated: true })
  else if (cell !== '' || cells.length) push()
  return out
}

const HEADERS = new Set(['question', 'pregunta'])

export function parseCardCsv(raw: string): CsvResult {
  const text = raw.replace(/^\uFEFF/, '')
  const firstLine = text.split('\n').find((l) => l.trim()) ?? ''
  const sep = firstLine.includes('\t') ? '\t' : ','
  const result: CsvResult = { cards: [], rejected: [] }

  records(text, sep).forEach((rec, i) => {
    if (rec.unterminated) {
      result.rejected.push({ line: rec.line, reason: 'Faltan las comillas de cierre.' })
      return
    }
    const [question = '', answer = '', reading = '', meaning = '', translation = ''] = rec.cells.map((c) => c.trim())
    if (![question, answer, reading, meaning, translation].some(Boolean)) return
    if (i === 0 && HEADERS.has(question.toLowerCase())) return
    const errors = validateCard({ question, answer })
    const reason = errors.question ?? errors.answer
    if (reason) result.rejected.push({ line: rec.line, reason })
    else result.cards.push({ line: rec.line, question, answer, reading, meaning, translation })
  })
  return result
}
