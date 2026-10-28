import Dexie, { type Table } from 'dexie'
import type { DeckRating } from '../core/queue'
import type { GradeName, Srs } from '../core/scheduler'

export interface DeckRow {
  id: string
  name: string
  rating: DeckRating
  share: number
  paused: boolean
  createdAt: number
  updatedAt: number
}

export interface CardRow {
  /** `${deckId}::${fileId}` so ids from different deck files never collide. */
  id: string
  deckId: string
  /** Card id inside the deck file; stable across re-imports. */
  fileId: string
  order: number
  question: string
  answer: string
  reading?: string
  meaning?: string
  translation?: string
  imageId?: string
  tags?: string[]
  srs: Srs
}

// Bytes instead of Blob: older iOS Safari builds lose Blobs stored in IndexedDB.
export interface MediaRow {
  id: string
  deckId: string
  name: string
  type: string
  data: ArrayBuffer
}

export interface ReviewRow {
  id?: number
  cardId: string
  deckId: string
  grade: GradeName
  at: number
  wasNew: boolean
}

export interface SettingRow {
  key: string
  value: unknown
}

export class KotobaDB extends Dexie {
  decks!: Table<DeckRow, string>
  cards!: Table<CardRow, string>
  media!: Table<MediaRow, string>
  reviews!: Table<ReviewRow, number>
  settings!: Table<SettingRow, string>

  constructor(name = 'kotoba-deck') {
    super(name)
    this.version(1).stores({
      decks: 'id',
      cards: 'id, deckId',
      media: 'id, deckId',
      reviews: '++id, cardId, deckId, at',
      settings: 'key',
    })
  }
}
