import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from 'ts-fsrs'

export const CardState = State
export type CardStateValue = State

export type GradeName = 'again' | 'hard' | 'good' | 'easy'
export const GRADES: GradeName[] = ['again', 'hard', 'good', 'easy']

const RATING: Record<GradeName, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

/** FSRS card state with dates as epoch ms, so it stores cleanly in IndexedDB and JSON. */
export interface Srs {
  due: number
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: State
  last_review?: number
}

// Fuzz off: intervals stay predictable for the grade-button preview and for tests.
const scheduler = fsrs({ enable_fuzz: false })

function toCard(srs: Srs): Card {
  const { last_review, due, ...rest } = srs
  return { ...rest, due: new Date(due), ...(last_review != null ? { last_review: new Date(last_review) } : {}) }
}

function fromCard(card: Card): Srs {
  const srs: Srs = {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
  }
  if (card.last_review) srs.last_review = new Date(card.last_review).getTime()
  return srs
}

export function newSrs(now: number): Srs {
  return fromCard(createEmptyCard(new Date(now)))
}

export function rate(srs: Srs, grade: GradeName, now: number): Srs {
  return fromCard(scheduler.next(toCard(srs), new Date(now), RATING[grade]).card)
}

export interface GradePreview {
  grade: GradeName
  due: number
  label: string
}

export function preview(srs: Srs, now: number): GradePreview[] {
  return GRADES.map((grade) => {
    const due = rate(srs, grade, now).due
    return { grade, due, label: formatInterval(due - now) }
  })
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

function oneDecimal(n: number): string {
  return String(Number(n.toFixed(1)))
}

export function formatInterval(ms: number): string {
  if (ms < MIN) return '<1 min'
  if (ms < HOUR) return `${Math.round(ms / MIN)} min`
  if (ms < DAY) return `${Math.round(ms / HOUR)} h`
  const days = Math.round(ms / DAY)
  if (days < 30) return days === 1 ? '1 día' : `${days} días`
  if (days < 365) {
    const months = oneDecimal(days / 30)
    return months === '1' ? '1 mes' : `${months} meses`
  }
  const years = oneDecimal(days / 365)
  return years === '1' ? '1 año' : `${years} años`
}
