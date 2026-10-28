import JSZip from 'jszip'
import type { DeckRating } from './queue'

export interface CardFile {
  id: string
  question: string
  answer: string
  reading?: string
  meaning?: string
  translation?: string
  /** File name inside media/ */
  image?: string
  tags?: string[]
}

export interface DeckFile {
  version: 1
  id: string
  name: string
  /** Absent in Anki imports: an existing deck keeps its rating, a new one starts green. */
  rating?: DeckRating
  cards: CardFile[]
}

export interface ParsedDeckZip {
  deck: DeckFile
  media: Map<string, Blob>
}

export class DeckFileError extends Error {}

const MIME: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  avif: 'image/avif',
}

export function mimeFor(name: string): string {
  return MIME[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'
}

// A bare file name: no folders, no traversal.
function isSafeName(name: string): boolean {
  return /^[^/\\]+$/.test(name) && name !== '.' && name !== '..'
}

export async function exportDeckZip(deck: DeckFile, media: Map<string, Blob>): Promise<Blob> {
  const zip = new JSZip()
  zip.file('deck.json', JSON.stringify(deck, null, 2))
  for (const [name, blob] of media) {
    if (!isSafeName(name)) throw new DeckFileError(`Nombre de imagen inválido: ${name}`)
    zip.file(`media/${name}`, blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}

function validateCard(raw: unknown, index: number): CardFile {
  const c = (raw ?? {}) as Record<string, unknown>
  const id = str(c.id)
  const question = str(c.question)?.trim()
  const answer = str(c.answer)?.trim()
  if (!id || !question || !answer) {
    throw new DeckFileError(`La carta ${index + 1} no tiene id, pregunta o respuesta.`)
  }
  const card: CardFile = { id, question, answer }
  for (const key of ['reading', 'meaning', 'translation'] as const) {
    const v = str(c[key])
    if (v !== undefined) card[key] = v
  }
  const image = str(c.image)
  if (image !== undefined) {
    if (!isSafeName(image)) throw new DeckFileError(`La carta ${index + 1} tiene una imagen inválida.`)
    card.image = image
  }
  if (Array.isArray(c.tags)) card.tags = c.tags.filter((t): t is string => typeof t === 'string')
  return card
}

export async function parseDeckZip(file: Blob): Promise<ParsedDeckZip> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(file)
  } catch {
    throw new DeckFileError('El archivo no es un .zip válido.')
  }
  const entry = zip.file('deck.json')
  if (!entry) throw new DeckFileError('El .zip no contiene deck.json.')

  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(await entry.async('string'))
  } catch {
    throw new DeckFileError('deck.json no es JSON válido.')
  }
  const id = str(raw.id)
  const name = str(raw.name)?.trim()
  if (!id || !name || !Array.isArray(raw.cards)) {
    throw new DeckFileError('deck.json necesita id, name y cards.')
  }
  const deck: DeckFile = {
    version: 1,
    id,
    name,
    rating: raw.rating === 'red' ? 'red' : 'green',
    cards: raw.cards.map(validateCard),
  }
  const ids = new Set<string>()
  for (const c of deck.cards) {
    if (ids.has(c.id)) throw new DeckFileError(`deck.json tiene dos cartas con el id «${c.id}».`)
    ids.add(c.id)
  }

  const media = new Map<string, Blob>()
  for (const name of new Set(deck.cards.map((c) => c.image).filter((n): n is string => !!n))) {
    const f = zip.file(`media/${name}`)
    if (!f) continue
    const bytes = await f.async('uint8array')
    media.set(name, new Blob([bytes], { type: mimeFor(name) }))
  }
  return { deck, media }
}
