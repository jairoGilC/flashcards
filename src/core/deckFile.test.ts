import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { exportDeckZip, parseDeckZip, DeckFileError, type DeckFile } from './deckFile'

function blob(text: string, type = 'image/webp') {
  return new Blob([text], { type })
}

// jsdom's Blob has no .text(); read it the browser-compatible way.
function readText(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsText(b)
  })
}

const deck: DeckFile = {
  version: 1,
  id: 'deck-n5',
  name: 'JLPT N5 · 動詞',
  rating: 'red',
  cards: [
    { id: 'c1', question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', translation: 'Como un onigiri cada mañana.', image: 'onigiri.webp', tags: ['n5'] },
    { id: 'c2', question: '話す', answer: '話す', reading: 'はなす', meaning: 'hablar', tags: [] },
  ],
}

describe('deck zip', () => {
  it('round-trips deck.json and media', async () => {
    const zipBlob = await exportDeckZip(deck, new Map([['onigiri.webp', blob('IMG')]]))
    const parsed = await parseDeckZip(zipBlob)
    expect(parsed.deck).toEqual(deck)
    expect([...parsed.media.keys()]).toEqual(['onigiri.webp'])
    expect(await readText(parsed.media.get('onigiri.webp')!)).toBe('IMG')
    expect(parsed.media.get('onigiri.webp')!.type).toBe('image/webp')
  })

  it('defaults a missing rating to green', async () => {
    const zip = new JSZip()
    const noRating: Partial<DeckFile> = { ...deck, cards: [deck.cards[1]] }
    delete noRating.rating
    zip.file('deck.json', JSON.stringify(noRating))
    const parsed = await parseDeckZip(await zip.generateAsync({ type: 'blob' }))
    expect(parsed.deck.rating).toBe('green')
  })

  it('rejects a zip without deck.json', async () => {
    const zip = new JSZip()
    zip.file('other.txt', 'x')
    await expect(parseDeckZip(await zip.generateAsync({ type: 'blob' }))).rejects.toBeInstanceOf(DeckFileError)
  })

  it('rejects cards missing question or answer', async () => {
    const zip = new JSZip()
    zip.file('deck.json', JSON.stringify({ ...deck, cards: [{ id: 'x', question: '', answer: 'a' }] }))
    await expect(parseDeckZip(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/carta 1/)
  })

  it('rejects two cards with the same id', async () => {
    const zip = new JSZip()
    zip.file('deck.json', JSON.stringify({ ...deck, cards: [deck.cards[1], { ...deck.cards[1], answer: 'otro' }] }))
    await expect(parseDeckZip(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/c2/)
  })

  it('rejects media paths that escape the media folder', async () => {
    const zip = new JSZip()
    zip.file('deck.json', JSON.stringify({ ...deck, cards: [{ ...deck.cards[0], image: '../evil.webp' }] }))
    await expect(parseDeckZip(await zip.generateAsync({ type: 'blob' }))).rejects.toBeInstanceOf(DeckFileError)
  })
})
