import type { CardFile, DeckFile, ParsedDeckZip } from '../core/deckFile'
import type { DeckRating, QueueCard, QueueDeck } from '../core/queue'
import { studyDayStart } from '../core/queue'
import { CardState, newSrs, rate, type GradeName } from '../core/scheduler'
import type { CardRow, DeckRow, KotobaDB, MediaRow } from './db'

export const DEFAULT_NEW_PER_DAY = 15

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const cardKey = (deckId: string, fileId: string) => `${deckId}::${fileId}`
const mediaKey = (deckId: string, name: string) => `${deckId}::${name}`

export function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer()
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as ArrayBuffer)
    r.onerror = () => reject(r.error)
    r.readAsArrayBuffer(blob)
  })
}

async function mediaRow(deckId: string, name: string, blob: Blob): Promise<MediaRow> {
  return { id: mediaKey(deckId, name), deckId, name, type: blob.type, data: await blobToArrayBuffer(blob) }
}

function content(c: CardFile, deckId: string) {
  return {
    question: c.question,
    answer: c.answer,
    reading: c.reading,
    meaning: c.meaning,
    translation: c.translation,
    imageId: c.image ? mediaKey(deckId, c.image) : undefined,
    tags: c.tags,
  }
}

export interface ImportResult {
  added: number
  updated: number
  removed: number
}

/**
 * merge: content and deck name/rating come from the file (a file without a rating keeps the deck's); review progress and the
 * user's share/paused stay. Cards missing from the file are kept.
 * replace: the deck starts over from the file.
 */
export async function importDeck(
  db: KotobaDB,
  { deck, media }: ParsedDeckZip,
  mode: 'merge' | 'replace',
  now: number,
): Promise<ImportResult> {
  const mediaRows = await Promise.all([...media].map(([name, blob]) => mediaRow(deck.id, name, blob)))

  return db.transaction('rw', db.decks, db.cards, db.media, db.reviews, async () => {
    let removed = 0
    if (mode === 'replace') {
      removed = await db.cards.where('deckId').equals(deck.id).delete()
      await db.media.where('deckId').equals(deck.id).delete()
      await db.reviews.where('deckId').equals(deck.id).delete()
    }

    const existingDeck = await db.decks.get(deck.id)
    await db.decks.put({
      id: deck.id,
      name: deck.name,
      rating: deck.rating ?? existingDeck?.rating ?? 'green',
      share: mode === 'merge' && existingDeck ? existingDeck.share : 1,
      paused: mode === 'merge' && existingDeck ? existingDeck.paused : false,
      createdAt: existingDeck?.createdAt ?? now,
      updatedAt: now,
    })

    const existing = new Map((await db.cards.where('deckId').equals(deck.id).toArray()).map((c) => [c.id, c]))
    let nextOrder = Math.max(-1, ...[...existing.values()].map((c) => c.order)) + 1
    let added = 0
    let updated = 0
    const rows: CardRow[] = deck.cards.map((c) => {
      const id = cardKey(deck.id, c.id)
      const prev = existing.get(id)
      if (prev) {
        updated += 1
        return { ...prev, ...content(c, deck.id) }
      }
      added += 1
      return { id, deckId: deck.id, fileId: c.id, order: nextOrder++, ...content(c, deck.id), srs: newSrs(now) }
    })
    await db.cards.bulkPut(rows)
    await db.media.bulkPut(mediaRows)
    return { added, updated, removed }
  })
}

export async function exportDeck(db: KotobaDB, deckId: string): Promise<{ deck: DeckFile; media: Map<string, Blob> }> {
  const d = await db.decks.get(deckId)
  if (!d) throw new Error(`Mazo no encontrado: ${deckId}`)
  const rows = await db.cards.where('deckId').equals(deckId).sortBy('order')
  const mediaById = new Map((await db.media.where('deckId').equals(deckId).toArray()).map((m) => [m.id, m]))
  const media = new Map<string, Blob>()
  const cards: CardFile[] = rows.map((r) => {
    const card: CardFile = { id: r.fileId, question: r.question, answer: r.answer }
    if (r.reading) card.reading = r.reading
    if (r.meaning) card.meaning = r.meaning
    if (r.translation) card.translation = r.translation
    if (r.tags?.length) card.tags = r.tags
    const m = r.imageId ? mediaById.get(r.imageId) : undefined
    if (m) {
      card.image = m.name
      media.set(m.name, new Blob([m.data], { type: m.type }))
    }
    return card
  })
  return { deck: { version: 1, id: d.id, name: d.name, rating: d.rating, cards }, media }
}

export async function rateCard(db: KotobaDB, cardId: string, grade: GradeName, now: number): Promise<CardRow> {
  return db.transaction('rw', db.cards, db.reviews, async () => {
    const card = await db.cards.get(cardId)
    if (!card) throw new Error(`Carta no encontrada: ${cardId}`)
    const next = { ...card, srs: rate(card.srs, grade, now) }
    await db.cards.put(next)
    await db.reviews.add({ cardId, deckId: card.deckId, grade, at: now, wasNew: card.srs.state === CardState.New })
    return next
  })
}

export async function newSeenToday(db: KotobaDB, now: number): Promise<number> {
  return db.reviews
    .where('at')
    .between(studyDayStart(now), now, true, true)
    .filter((r) => r.wasNew)
    .count()
}

export async function createDeck(db: KotobaDB, { name, rating }: { name: string; rating: DeckRating }, now: number): Promise<string> {
  const id = uid()
  await db.decks.add({ id, name, rating, share: 1, paused: false, createdAt: now, updatedAt: now })
  return id
}

export async function updateDeck(
  db: KotobaDB,
  id: string,
  patch: Partial<Pick<DeckRow, 'name' | 'rating' | 'share' | 'paused'>>,
): Promise<void> {
  await db.decks.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deleteDeck(db: KotobaDB, id: string): Promise<void> {
  await db.transaction('rw', db.decks, db.cards, db.media, db.reviews, async () => {
    await db.cards.where('deckId').equals(id).delete()
    await db.media.where('deckId').equals(id).delete()
    await db.reviews.where('deckId').equals(id).delete()
    await db.decks.delete(id)
  })
}

export interface CardInput {
  id?: string
  deckId: string
  question: string
  answer: string
  reading?: string
  meaning?: string
  translation?: string
  tags?: string[]
  /** New image to attach; `null` removes the current one; omit to keep it. */
  image?: { name: string; blob: Blob } | null
}

export async function saveCard(db: KotobaDB, input: CardInput, now: number): Promise<string> {
  const row = input.image ? await mediaRow(input.deckId, input.image.name, input.image.blob) : undefined
  return db.transaction('rw', db.cards, db.media, async () => {
    const prev = input.id ? await db.cards.get(input.id) : undefined
    let imageId = prev?.imageId
    if (input.image === null) imageId = undefined
    if (row) {
      await db.media.put(row)
      imageId = row.id
    }
    if (prev?.imageId && prev.imageId !== imageId) await db.media.delete(prev.imageId)

    const fields = {
      question: input.question.trim(),
      answer: input.answer.trim(),
      reading: input.reading?.trim() || undefined,
      meaning: input.meaning?.trim() || undefined,
      translation: input.translation?.trim() || undefined,
      tags: input.tags,
      imageId,
    }
    if (prev) {
      await db.cards.put({ ...prev, ...fields })
      return prev.id
    }
    const siblings = await db.cards.where('deckId').equals(input.deckId).toArray()
    const fileId = uid()
    const id = cardKey(input.deckId, fileId)
    const order = Math.max(-1, ...siblings.map((c) => c.order)) + 1
    await db.cards.add({ id, deckId: input.deckId, fileId, order, ...fields, srs: newSrs(now) })
    return id
  })
}

export async function deleteCard(db: KotobaDB, id: string): Promise<void> {
  await db.transaction('rw', db.cards, db.media, db.reviews, async () => {
    const card = await db.cards.get(id)
    if (card?.imageId) await db.media.delete(card.imageId)
    await db.reviews.where('cardId').equals(id).delete()
    await db.cards.delete(id)
  })
}

export async function loadQueueInputs(db: KotobaDB): Promise<{ decks: QueueDeck[]; cards: QueueCard[] }> {
  const [deckRows, cardRows] = await Promise.all([db.decks.toArray(), db.cards.toArray()])
  return {
    decks: deckRows.map(({ id, rating, share, paused }) => ({ id, rating, share, paused })),
    cards: cardRows
      .sort((a, b) => a.deckId.localeCompare(b.deckId) || a.order - b.order)
      .map(({ id, deckId, order, srs }) => ({ id, deckId, order, srs })),
  }
}

export async function getNewPerDay(db: KotobaDB): Promise<number> {
  const row = await db.settings.get('newPerDay')
  return typeof row?.value === 'number' ? row.value : DEFAULT_NEW_PER_DAY
}

export async function setNewPerDay(db: KotobaDB, value: number): Promise<void> {
  await db.settings.put({ key: 'newPerDay', value })
}
