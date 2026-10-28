import JSZip from 'jszip'
import type { Database, SqlJsStatic } from 'sql.js'
import { DeckFileError, mimeFor, type CardFile, type ParsedDeckZip } from '../core/deckFile'

export interface AnkiNote {
  id: number
  guid: string
  flds: string
  tags: string
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (!e.startsWith('#')) return ENTITIES[e.toLowerCase()] ?? m
    const code = /^#x/i.test(e) ? parseInt(e.slice(2), 16) : Number(e.slice(1))
    return code <= 0x10ffff ? String.fromCodePoint(code) : m
  })
}

/** Plain text of an Anki field: no tags, no [sound:], no furigana readings. */
export function stripHtml(html: string): string {
  const text = html
    .replace(/\[sound:[^\]]*\]/g, '')
    .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
  return (
    decodeEntities(text)
      // Anki furigana `漢字[かんじ]`: our question syntax would read the brackets as the marked word.
      .replace(/ ?([^ >[\]]+?)\[[^\]]*\]/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

/** File name of the first <img> in a field, as stored in the media map. */
export function firstImage(html: string): string | undefined {
  const m = /<img\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/i.exec(html)
  if (!m) return undefined
  const src = decodeEntities(m[2])
  try {
    return decodeURIComponent(src)
  } catch {
    return src
  }
}

/** Basic notes → cards: field 1 is the question, field 2 the answer. Notes missing either are skipped. */
export function mapNotes(notes: AnkiNote[]): CardFile[] {
  const cards: CardFile[] = []
  for (const n of notes) {
    const [front = '', back = ''] = n.flds.split('\x1f')
    const question = stripHtml(front)
    const answer = stripHtml(back)
    if (!question || !answer) continue
    const card: CardFile = { id: n.guid || String(n.id), question, answer }
    const image = firstImage(front) ?? firstImage(back)
    if (image && mimeFor(image).startsWith('image/')) card.image = image
    const tags = n.tags.trim().split(/\s+/).filter(Boolean)
    if (tags.length) card.tags = tags
    cards.push(card)
  }
  return cards
}

function rows(db: Database, sql: string): Record<string, unknown>[] {
  const [res] = db.exec(sql)
  if (!res) return []
  return res.values.map((v) => Object.fromEntries(res.columns.map((c, i) => [c, v[i]])))
}

// Schema 11 keeps decks as JSON in col.decks; newer collections have a decks table.
function deckName(db: Database, did: number): string | undefined {
  const hasTable = rows(db, "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'decks'").length > 0
  if (hasTable) {
    const name = rows(db, `SELECT name FROM decks WHERE id = ${Number(did)}`)[0]?.name
    if (typeof name === 'string') return name.split('\x1f').join('::')
  }
  const json = rows(db, 'SELECT decks FROM col')[0]?.decks
  if (typeof json !== 'string') return undefined
  try {
    const name = (JSON.parse(json) as Record<string, { name?: unknown }>)[String(did)]?.name
    return typeof name === 'string' ? name : undefined
  } catch {
    return undefined
  }
}

/** Reads an Anki .apkg (legacy collection format) as a deck file. `sql` is injectable for tests. */
export async function parseApkg(file: Blob, sql?: SqlJsStatic): Promise<ParsedDeckZip> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new DeckFileError('El archivo no es un .apkg válido.')
  }
  const collection = zip.file('collection.anki21') ?? (zip.file('collection.anki21b') ? null : zip.file('collection.anki2'))
  if (!collection) {
    if (zip.file('collection.anki21b')) {
      throw new DeckFileError(
        'Este .apkg usa el formato nuevo de Anki. Expórtalo de nuevo desde Anki marcando "Support older Anki versions" (compatibilidad con versiones anteriores).',
      )
    }
    throw new DeckFileError('El .apkg no contiene una colección de Anki.')
  }

  const SQL = sql ?? (await (await import('./sqlite')).loadSqlJs())
  let db: Database
  try {
    db = new SQL.Database(await collection.async('uint8array'))
  } catch {
    throw new DeckFileError('No se pudo leer la colección del .apkg.')
  }

  let notes: AnkiNote[]
  let did: number
  let name: string | undefined
  try {
    // One card per note (Basic+Reverse makes two); the first card tells which deck it lives in.
    notes = rows(
      db,
      'SELECT n.id AS id, n.guid AS guid, n.flds AS flds, n.tags AS tags FROM notes n WHERE EXISTS (SELECT 1 FROM cards c WHERE c.nid = n.id) ORDER BY n.id',
    ) as unknown as AnkiNote[]
    const top = rows(db, 'SELECT did, COUNT(*) AS n FROM cards GROUP BY did ORDER BY n DESC LIMIT 1')[0]
    did = Number(top?.did ?? 1)
    name = deckName(db, did)
  } catch {
    throw new DeckFileError('La colección del .apkg tiene un formato desconocido.')
  } finally {
    db.close()
  }

  const cards = mapNotes(notes)
  if (!cards.length) throw new DeckFileError('El .apkg no tiene notas básicas (pregunta y respuesta) que importar.')

  // The media file maps numbered zip entries to their original names.
  let mediaMap: Record<string, string> = {}
  try {
    mediaMap = JSON.parse((await zip.file('media')?.async('string')) ?? '{}')
  } catch {
    mediaMap = {}
  }
  const entryByName = new Map(Object.entries(mediaMap).map(([k, v]) => [v, k]))
  const media = new Map<string, Blob>()
  for (const card of cards) {
    if (!card.image) continue
    const key = entryByName.get(card.image)
    const entry = key !== undefined ? zip.file(key) : null
    if (!entry || /[/\\]/.test(card.image) || card.image === '.' || card.image === '..') {
      delete card.image
      continue
    }
    if (!media.has(card.image)) media.set(card.image, new Blob([await entry.async('uint8array')], { type: mimeFor(card.image) }))
  }

  // Anki's "Default" deck is id 1 in every collection, so unrelated decks would collide;
  // the first note's guid tells them apart and stays the same when the deck is re-exported.
  const id = did === 1 ? `apkg-1-${notes[0].guid}` : `apkg-${did}`
  return { deck: { version: 1, id, name: name?.trim() || 'Mazo de Anki', cards }, media }
}
