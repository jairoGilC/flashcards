import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KotobaDB } from './db'
import {
  createDeck,
  deleteDeck,
  exportDeck,
  getNewPerDay,
  importDeck,
  loadQueueInputs,
  newSeenToday,
  rateCard,
  saveCard,
  setNewPerDay,
  updateDeck,
} from './repo'
import type { DeckFile } from '../core/deckFile'
import { CardState } from '../core/scheduler'

const NOW = new Date(2026, 9, 28, 10, 0).getTime()
let db: KotobaDB
let n = 0

beforeEach(async () => {
  db = new KotobaDB(`test-${++n}`)
  await db.open()
})
afterEach(async () => {
  db.close()
  await db.delete()
})

function file(over: Partial<DeckFile> = {}): DeckFile {
  return {
    version: 1,
    id: 'n5',
    name: 'JLPT N5',
    rating: 'green',
    cards: [
      { id: 'c1', question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', image: 'onigiri.webp' },
      { id: 'c2', question: '話す', answer: '話す', meaning: 'hablar' },
    ],
    ...over,
  }
}

const media = () => new Map([['onigiri.webp', new Blob(['IMG'], { type: 'image/webp' })]])

describe('importDeck', () => {
  it('creates the deck, cards in order with fresh SRS, and media', async () => {
    const r = await importDeck(db, { deck: file(), media: media() }, 'merge', NOW)
    expect(r).toEqual({ added: 2, updated: 0, removed: 0 })
    const deck = await db.decks.get('n5')
    expect(deck).toMatchObject({ name: 'JLPT N5', rating: 'green', paused: false, share: 1 })
    const cards = await db.cards.where('deckId').equals('n5').sortBy('order')
    expect(cards.map((c) => c.fileId)).toEqual(['c1', 'c2'])
    expect(cards[0].srs.state).toBe(CardState.New)
    expect(cards[0].imageId).toBe('n5::onigiri.webp')
    const m = await db.media.get('n5::onigiri.webp')
    expect(m?.type).toBe('image/webp')
    expect(m?.data.byteLength).toBe(3)
  })

  it('merge keeps review progress and user deck settings, updates content, adds new cards', async () => {
    await importDeck(db, { deck: file(), media: media() }, 'merge', NOW)
    await rateCard(db, 'n5::c1', 'easy', NOW)
    await updateDeck(db, 'n5', { share: 40, paused: true })
    const before = (await db.cards.get('n5::c1'))!.srs

    const next = file({
      name: 'JLPT N5 v2',
      rating: 'red',
      cards: [
        { id: 'c1', question: '毎朝パンを[食べます]。', answer: '食べる' },
        { id: 'c3', question: '読む', answer: '読む' },
      ],
    })
    const r = await importDeck(db, { deck: next, media: new Map() }, 'merge', NOW)
    expect(r).toEqual({ added: 1, updated: 1, removed: 0 })

    const c1 = (await db.cards.get('n5::c1'))!
    expect(c1.question).toBe('毎朝パンを[食べます]。')
    expect(c1.srs).toEqual(before)
    expect(await db.cards.get('n5::c2')).toBeDefined()
    const deck = (await db.decks.get('n5'))!
    expect(deck).toMatchObject({ name: 'JLPT N5 v2', rating: 'red', share: 40, paused: true })
  })

  it('replace drops old cards, media and progress', async () => {
    await importDeck(db, { deck: file(), media: media() }, 'merge', NOW)
    await rateCard(db, 'n5::c1', 'easy', NOW)
    const r = await importDeck(db, { deck: file({ cards: [{ id: 'c1', question: 'x', answer: 'y' }] }), media: new Map() }, 'replace', NOW)
    expect(r).toEqual({ added: 1, updated: 0, removed: 2 })
    expect((await db.cards.get('n5::c1'))!.srs.state).toBe(CardState.New)
    expect(await db.media.count()).toBe(0)
  })
})

describe('reviews', () => {
  it('rateCard updates SRS and logs; newSeenToday counts first reviews of the study day', async () => {
    await importDeck(db, { deck: file(), media: new Map() }, 'merge', NOW)
    await rateCard(db, 'n5::c1', 'again', NOW)
    await rateCard(db, 'n5::c1', 'good', NOW + 60_000)
    await rateCard(db, 'n5::c2', 'good', NOW + 120_000)
    expect((await db.cards.get('n5::c1'))!.srs.reps).toBe(2)
    expect(await db.reviews.count()).toBe(3)
    expect(await newSeenToday(db, NOW + 200_000)).toBe(2)
    expect(await newSeenToday(db, NOW + 24 * 60 * 60 * 1000)).toBe(0)
  })
})

describe('editor operations', () => {
  it('createDeck + saveCard append in order; exportDeck round-trips with media', async () => {
    const id = await createDeck(db, { name: 'カタカナ語', rating: 'green' }, NOW)
    await saveCard(db, { deckId: id, question: 'コーヒー', answer: 'コーヒー', meaning: 'café', image: { name: 'cafe.webp', blob: new Blob(['C'], { type: 'image/webp' }) } }, NOW)
    await saveCard(db, { deckId: id, question: 'パン', answer: 'パン' }, NOW)
    const { deck, media: m } = await exportDeck(db, id)
    expect(deck.name).toBe('カタカナ語')
    expect(deck.cards.map((c) => c.question)).toEqual(['コーヒー', 'パン'])
    expect(deck.cards[0].image).toBe('cafe.webp')
    expect([...m.keys()]).toEqual(['cafe.webp'])
  })

  it('saveCard with an id edits content but keeps SRS', async () => {
    await importDeck(db, { deck: file(), media: new Map() }, 'merge', NOW)
    await rateCard(db, 'n5::c2', 'easy', NOW)
    const srs = (await db.cards.get('n5::c2'))!.srs
    await saveCard(db, { id: 'n5::c2', deckId: 'n5', question: '話します', answer: '話す' }, NOW)
    const c = (await db.cards.get('n5::c2'))!
    expect(c.question).toBe('話します')
    expect(c.srs).toEqual(srs)
  })

  it('keeps the existing rating when the file has none (Anki imports)', async () => {
    await importDeck(db, { deck: file({ rating: 'red' }), media: new Map() }, 'merge', NOW)
    await importDeck(db, { deck: file({ rating: undefined }), media: new Map() }, 'merge', NOW)
    expect((await db.decks.get('n5'))!.rating).toBe('red')
  })

  it('a new deck without a rating starts green', async () => {
    await importDeck(db, { deck: file({ rating: undefined }), media: new Map() }, 'merge', NOW)
    expect((await db.decks.get('n5'))!.rating).toBe('green')
  })

  it('deleteDeck removes its cards, media and reviews', async () => {
    await importDeck(db, { deck: file(), media: media() }, 'merge', NOW)
    await rateCard(db, 'n5::c1', 'good', NOW)
    await deleteDeck(db, 'n5')
    expect(await db.decks.count()).toBe(0)
    expect(await db.cards.count()).toBe(0)
    expect(await db.media.count()).toBe(0)
    expect(await db.reviews.count()).toBe(0)
  })

  it('loadQueueInputs maps decks and cards for the queue builder', async () => {
    await importDeck(db, { deck: file({ rating: 'red' }), media: new Map() }, 'merge', NOW)
    const { decks, cards } = await loadQueueInputs(db)
    expect(decks).toEqual([{ id: 'n5', rating: 'red', share: 1, paused: false }])
    expect(cards.map((c) => [c.id, c.deckId, c.order])).toEqual([['n5::c1', 'n5', 0], ['n5::c2', 'n5', 1]])
  })
})

describe('settings', () => {
  it('newPerDay defaults to 15 and persists', async () => {
    expect(await getNewPerDay(db)).toBe(15)
    await setNewPerDay(db, 20)
    expect(await getNewPerDay(db)).toBe(20)
  })
})
