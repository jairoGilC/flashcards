import { useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useApp } from '../../app/AppContext'
import { go, href } from '../../app/router'
import { exportDeckZip } from '../../core/deckFile'
import type { CardRow, DeckRow } from '../../db/db'
import { deleteDeck, exportDeck, updateDeck } from '../../db/repo'
import { downloadBlob, fileSlug } from '../../io/files'
import { Icon } from '../../ui'
import { RatingRadios } from './RatingRadios'
import { formatBytes } from './validate'

function RenameForm({ deck, onClose }: { deck: DeckRow; onClose: () => void }) {
  const { db } = useApp()
  const [name, setName] = useState(deck.name)
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed && trimmed !== deck.name) await updateDeck(db, deck.id, { name: trimmed })
    onClose()
  }
  return (
    <form className="ed-rename" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <label className="sr-only" htmlFor="ed-rename">
        Nombre del mazo
      </label>
      <input id="ed-rename" className="field ed-rename__input mincho" lang="ja" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="ed-btn ed-btn--dark chrome">
        Guardar
      </button>
      <button type="button" className="ed-btn chrome" onClick={onClose}>
        Cancelar
      </button>
    </form>
  )
}

export function DeckHeader({ deck, cards, csvOpen, onToggleCsv }: { deck: DeckRow; cards: CardRow[]; csvOpen: boolean; onToggleCsv: () => void }) {
  const { db } = useApp()
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [packing, setPacking] = useState(false)
  const [error, setError] = useState('')
  const bytes = useLiveQuery(
    async () => {
      let sum = 0
      await db.media.where('deckId').equals(deck.id).each((m) => (sum += m.data.byteLength))
      return sum
    },
    [db, deck.id],
  )
  const withImage = cards.filter((c) => c.imageId).length

  const pack = async () => {
    setPacking(true)
    setError('')
    try {
      const { deck: file, media } = await exportDeck(db, deck.id)
      downloadBlob(await exportDeckZip(file, media), `${fileSlug(deck.name)}.zip`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo empaquetar el mazo.')
    } finally {
      setPacking(false)
    }
  }

  const remove = async () => {
    await deleteDeck(db, deck.id)
    go('editor')
  }

  return (
    <div className="ed-deckhead">
      <div className="ed-deckhead__info">
        {renaming ? (
          <RenameForm deck={deck} onClose={() => setRenaming(false)} />
        ) : (
          <div className="ed-row">
            <h1 className="ed-deckhead__title mincho" lang="ja">
              {deck.name}
            </h1>
            <button type="button" className="ed-iconbtn" aria-label="Renombrar mazo" onClick={() => setRenaming(true)}>
              <Icon name="forge" size={18} />
            </button>
          </div>
        )}
        <span className="ed-deckhead__stats">
          {cards.length} {cards.length === 1 ? 'carta' : 'cartas'} · {withImage} con pista visual · {formatBytes(bytes ?? 0)}
        </span>
        <div className="ed-row">
          <span className="label" aria-hidden="true">
            Clasificación
          </span>
          <RatingRadios value={deck.rating} onChange={(rating) => updateDeck(db, deck.id, { rating })} label="Clasificación del mazo" />
          {!confirmDelete && (
            <button type="button" className="ed-btn ed-btn--danger-ghost chrome" onClick={() => setConfirmDelete(true)}>
              <Icon name="trash" size={16} />
              Eliminar mazo
            </button>
          )}
        </div>
        {confirmDelete && (
          <div className="ed-confirm" role="group" aria-label="Confirmar eliminación">
            <span>
              ¿Eliminar «{deck.name}» y sus {cards.length} cartas? No se puede deshacer.
            </span>
            <button type="button" className="ed-btn ed-btn--danger chrome" onClick={remove}>
              Sí, eliminar
            </button>
            <button type="button" className="ed-btn chrome" autoFocus onClick={() => setConfirmDelete(false)}>
              Cancelar
            </button>
          </div>
        )}
      </div>
      <div className="ed-deckhead__actions">
        <button type="button" className="ed-btn ed-btn--paper chrome" aria-expanded={csvOpen} onClick={onToggleCsv}>
          Importar CSV
        </button>
        <a className="ed-btn ed-btn--paper chrome" href={href('import')}>
          Importar .apkg
        </a>
        <button type="button" className="ed-btn ed-btn--gold chrome" onClick={pack} disabled={packing || cards.length === 0}>
          {packing ? 'Empaquetando…' : 'Empaquetar sobre (.zip) para el móvil'}
        </button>
        {error && (
          <span role="alert" className="ed-error">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
