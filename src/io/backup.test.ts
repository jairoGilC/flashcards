import { afterEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { KotobaDB } from '../db/db'
import { importDeck, rateCard, setNewPerDay } from '../db/repo'
import { BackupError, exportBackup, restoreBackup } from './backup'

const now = Date.UTC(2026, 9, 1, 12)
const dbs: KotobaDB[] = []

function freshDb(): KotobaDB {
  const db = new KotobaDB(`backup-${Math.random()}`)
  dbs.push(db)
  return db
}

afterEach(async () => {
  for (const db of dbs.splice(0)) await db.delete()
})

async function seed(db: KotobaDB) {
  await importDeck(
    db,
    {
      deck: {
        version: 1,
        id: 'n5',
        name: 'N5 / 動詞',
        rating: 'red',
        cards: [
          { id: 'c1', question: '食べる', answer: 'comer', image: 'onigiri.webp' },
          { id: 'c2', question: '話す', answer: 'hablar' },
        ],
      },
      media: new Map([['onigiri.webp', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' })]]),
    },
    'merge',
    now,
  )
  await rateCard(db, 'n5::c1', 'good', now + 1000)
  await setNewPerDay(db, 22)
}

async function snapshot(db: KotobaDB) {
  return {
    decks: await db.decks.toArray(),
    cards: await db.cards.toArray(),
    media: (await db.media.toArray()).map((m) => ({ ...m, data: [...new Uint8Array(m.data)] })),
    reviews: await db.reviews.toArray(),
    settings: await db.settings.toArray(),
  }
}

describe('backup', () => {
  it('round-trips decks, cards with progress, media, reviews and settings', async () => {
    const source = freshDb()
    await seed(source)
    const blob = await exportBackup(source)

    const target = freshDb()
    await importDeck(target, { deck: { version: 1, id: 'other', name: 'Otro', rating: 'green', cards: [{ id: 'x', question: 'q', answer: 'a' }] }, media: new Map() }, 'merge', now)
    await restoreBackup(target, blob)

    const restored = await snapshot(target)
    expect(restored).toEqual(await snapshot(source))
    expect(restored.cards.find((c) => c.id === 'n5::c1')!.srs.reps).toBe(1)
    expect(restored.media[0].data).toEqual([1, 2, 3])
  })

  it('writes a versioned backup.json', async () => {
    const db = freshDb()
    await seed(db)
    const zip = await JSZip.loadAsync(await exportBackup(db))
    const json = JSON.parse(await zip.file('backup.json')!.async('string'))
    expect(json.format).toBe('kotoba-deck-backup')
    expect(json.version).toBe(1)
    expect(json.decks).toHaveLength(1)
    expect(Object.keys(zip.files).filter((n) => n.startsWith('media/') && !zip.files[n].dir)).toHaveLength(1)
  })

  it('leaves the database untouched when the backup is invalid', async () => {
    const db = freshDb()
    await seed(db)
    const before = await snapshot(db)

    const notZip = restoreBackup(db, new Blob(['nope']))
    await expect(notZip).rejects.toBeInstanceOf(BackupError)

    const zip = new JSZip()
    zip.file('backup.json', JSON.stringify({ format: 'kotoba-deck-backup', version: 1, decks: [{ id: 'd' }], cards: 'x' }))
    await expect(restoreBackup(db, await zip.generateAsync({ type: 'blob' }))).rejects.toBeInstanceOf(BackupError)

    const missingMedia = await JSZip.loadAsync(await exportBackup(db))
    for (const n of Object.keys(missingMedia.files)) if (n.startsWith('media/')) missingMedia.remove(n)
    await expect(restoreBackup(db, await missingMedia.generateAsync({ type: 'blob' }))).rejects.toThrow(/imagen/)

    expect(await snapshot(db)).toEqual(before)
  })

  it('rejects a deck.zip passed as a backup with a helpful message', async () => {
    const zip = new JSZip()
    zip.file('deck.json', '{}')
    await expect(restoreBackup(freshDb(), await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/copia de seguridad/)
  })
})
