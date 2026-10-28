import JSZip from 'jszip'
import type { CardRow, DeckRow, KotobaDB, MediaRow, ReviewRow, SettingRow } from '../db/db'

export class BackupError extends Error {}

const FORMAT = 'kotoba-deck-backup'
const VERSION = 1

interface MediaEntry {
  id: string
  deckId: string
  name: string
  type: string
  /** Path inside the zip. */
  file: string
}

interface BackupJson {
  format: typeof FORMAT
  version: typeof VERSION
  exportedAt: number
  decks: DeckRow[]
  cards: CardRow[]
  reviews: ReviewRow[]
  settings: SettingRow[]
  media: MediaEntry[]
}

/** Everything in the vault as one zip: backup.json plus media bytes. */
export async function exportBackup(db: KotobaDB, now = Date.now()): Promise<Blob> {
  const [decks, cards, reviews, settings, mediaRows] = await db.transaction('r', [db.decks, db.cards, db.reviews, db.settings, db.media], () =>
    Promise.all([db.decks.toArray(), db.cards.toArray(), db.reviews.toArray(), db.settings.toArray(), db.media.toArray()]),
  )
  const zip = new JSZip()
  const media: MediaEntry[] = mediaRows.map((m, i) => {
    // Index prefix keeps names unique across decks; the rest only needs to be zip-safe.
    const file = `media/${i}-${m.name.replace(/[^\p{L}\p{N}._-]+/gu, '_')}`
    zip.file(file, new Uint8Array(m.data))
    return { id: m.id, deckId: m.deckId, name: m.name, type: m.type, file }
  })
  const json: BackupJson = { format: FORMAT, version: VERSION, exportedAt: now, decks, cards, reviews, settings, media }
  zip.file('backup.json', JSON.stringify(json))
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const isStr = (v: unknown): v is string => typeof v === 'string'

function validate(raw: unknown): BackupJson {
  if (!isObj(raw) || raw.format !== FORMAT) throw new BackupError('El archivo no es una copia de seguridad de Kotoba Deck.')
  if (raw.version !== VERSION) throw new BackupError('Esta copia de seguridad es de una versión más nueva de la app.')
  const { decks, cards, reviews, settings, media } = raw
  const ok =
    Array.isArray(decks) && decks.every((d) => isObj(d) && isStr(d.id) && isStr(d.name)) &&
    Array.isArray(cards) && cards.every((c) => isObj(c) && isStr(c.id) && isStr(c.deckId) && isStr(c.question) && isStr(c.answer) && isObj(c.srs)) &&
    Array.isArray(reviews) && reviews.every((r) => isObj(r) && isStr(r.cardId) && typeof r.at === 'number') &&
    Array.isArray(settings) && settings.every((s) => isObj(s) && isStr(s.key)) &&
    Array.isArray(media) && media.every((m) => isObj(m) && isStr(m.id) && isStr(m.deckId) && isStr(m.name) && isStr(m.type) && isStr(m.file))
  if (!ok) throw new BackupError('La copia de seguridad está dañada o incompleta.')
  return raw as unknown as BackupJson
}

/** Replaces the whole vault with the backup. Validates and reads everything first, so a bad file changes nothing. */
export async function restoreBackup(db: KotobaDB, file: Blob): Promise<{ decks: number; cards: number }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new BackupError('El archivo no es un .zip válido.')
  }
  const entry = zip.file('backup.json')
  if (!entry) {
    throw new BackupError(
      zip.file('deck.json')
        ? 'Esto es un mazo, no una copia de seguridad. Ábrelo arriba como sobre.'
        : 'El .zip no contiene una copia de seguridad (falta backup.json).',
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(await entry.async('string'))
  } catch {
    throw new BackupError('backup.json no es JSON válido.')
  }
  const backup = validate(raw)

  const media: MediaRow[] = []
  for (const m of backup.media) {
    const f = zip.file(m.file)
    if (!f) throw new BackupError(`Falta la imagen ${m.name} en la copia de seguridad.`)
    const bytes = await f.async('uint8array')
    media.push({ id: m.id, deckId: m.deckId, name: m.name, type: m.type, data: bytes.slice().buffer })
  }

  await db.transaction('rw', [db.decks, db.cards, db.media, db.reviews, db.settings], async () => {
    await Promise.all([db.decks.clear(), db.cards.clear(), db.media.clear(), db.reviews.clear(), db.settings.clear()])
    await db.decks.bulkAdd(backup.decks)
    await db.cards.bulkAdd(backup.cards)
    await db.media.bulkAdd(media)
    await db.reviews.bulkAdd(backup.reviews)
    await db.settings.bulkAdd(backup.settings)
  })
  return { decks: backup.decks.length, cards: backup.cards.length }
}
