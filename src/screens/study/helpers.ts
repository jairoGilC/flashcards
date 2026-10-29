const SECONDS_PER_CARD = 10
const XP_PER_REVIEW = 10
const XP_PER_LEVEL = 500
/** How many cards pass before a lapsed card shows up again in the same session. */
const REQUEUE_GAP = 3

export function estimateMinutes(cards: number): number {
  if (cards <= 0) return 0
  // Round, but never promise "0 min" for real work.
  return Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60))
}

export function levelFromReviews(reviews: number): { level: number; xp: number; perLevel: number } {
  const total = reviews * XP_PER_REVIEW
  return { level: Math.floor(total / XP_PER_LEVEL) + 1, xp: total % XP_PER_LEVEL, perLevel: XP_PER_LEVEL }
}

export function requeueIndex(current: number, length: number): number {
  return Math.min(current + 1 + REQUEUE_GAP, length)
}

/** Percent of the new-card budget per deck, mirroring splitNewBudget's weighting. Paused decks → null. */
export function sharePercents(decks: { id: string; share: number; paused: boolean }[]): Record<string, number | null> {
  const active = decks.filter((d) => !d.paused)
  const sum = active.reduce((s, d) => s + Math.max(0, d.share), 0)
  return Object.fromEntries(
    decks.map((d) => {
      if (d.paused) return [d.id, null]
      const weight = sum > 0 ? Math.max(0, d.share) / sum : 1 / active.length
      return [d.id, Math.round(weight * 100)]
    }),
  )
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** Mini-diamond color for a deck's rating. */
export function ratingColor(rating: 'green' | 'red'): string {
  return rating === 'red' ? 'var(--ruby)' : '#3fbf66'
}

/** Font size (px) for the answer word, so up to 5 characters share one line with the speaker button. */
export function answerSize(text: string): number {
  const chars = [...text].length
  if (chars <= 3) return 54
  if (chars <= 5) return 40
  return 30
}

/** CSS font size for the answer: answerSize on a 300 px card, scaled with the card (which is a size container). */
export function answerFont(text: string): string {
  // A 300 px card's content box is 286 px wide (7 px padding each side).
  return `${+(answerSize(text) / 2.86).toFixed(2)}cqw`
}
