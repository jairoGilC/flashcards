import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../app/AppContext'
import { href } from '../app/router'
import type { DeckRow } from '../db/db'
import { Icon } from '../ui'
import { CardForm } from './editor/CardForm'
import { CardTable } from './editor/CardTable'
import { CsvImport } from './editor/CsvImport'
import { DeckHeader } from './editor/DeckHeader'
import { Sidebar } from './editor/Sidebar'
import './editor/editor.css'

function DeckWorkspace({ deck }: { deck: DeckRow }) {
  const { db } = useApp()
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(deck.id).sortBy('order'), [db, deck.id])
  const [editingId, setEditingId] = useState<string>()
  const [csvOpen, setCsvOpen] = useState(false)
  if (!cards) return null
  const editing = cards.find((c) => c.id === editingId)

  return (
    <>
      <DeckHeader deck={deck} cards={cards} csvOpen={csvOpen} onToggleCsv={() => setCsvOpen((v) => !v)} />
      {csvOpen && <CsvImport deckId={deck.id} onClose={() => setCsvOpen(false)} />}
      {/* Remount per card so the form starts from that card's saved values. */}
      <CardForm key={editing?.id ?? 'new'} deck={deck} editing={editing} onDone={() => setEditingId(undefined)} />
      <CardTable
        cards={cards}
        editingId={editing?.id}
        onEdit={setEditingId}
        onDeleted={(id) => setEditingId((cur) => (cur === id ? undefined : cur))}
      />
    </>
  )
}

export default function Editor({ deckId }: { deckId?: string }) {
  const { db } = useApp()
  const decks = useLiveQuery(async () => (await db.decks.toArray()).sort((a, b) => a.createdAt - b.createdAt), [db])
  // deckId index lists one key per card: cheap per-deck counts without loading card bodies.
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    for (const id of (await db.cards.orderBy('deckId').keys()) as string[]) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [db])
  const deck = decks?.find((d) => d.id === deckId) ?? decks?.[0]

  return (
    <div className="editor">
      <header className="ed-topbar">
        <div className="ed-topbar__brand">
          <span className="mincho ed-topbar__logo" lang="ja">
            言葉デッキ
          </span>
          <span className="chrome ed-topbar__sub">Forja de mazos · computador</span>
        </div>
        <a className="ed-topbar__home" href={href('home')}>
          <Icon name="back" size={18} />
          Volver al móvil
        </a>
      </header>
      <div className="ed-layout">
        <Sidebar decks={decks ?? []} counts={counts ?? new Map()} selectedId={deck?.id} />
        <main className="ed-main">
          {deck ? (
            <DeckWorkspace key={deck.id} deck={deck} />
          ) : (
            decks && (
              <div className="ed-card ed-empty">
                <h1 className="ed-card__title chrome">Aún no tienes mazos</h1>
                <p>Crea el primero con «+ Nuevo mazo». Después podrás forjar cartas, importar un CSV y empaquetar el sobre para el móvil.</p>
              </div>
            )
          )}
        </main>
      </div>
    </div>
  )
}
