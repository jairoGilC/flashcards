import { useMemo, useState } from 'react'
import { useApp } from '../../app/AppContext'
import { parseQuestion } from '../../core/question'
import type { CardRow } from '../../db/db'
import { deleteCard } from '../../db/repo'
import { Icon, QuestionText } from '../../ui'
import { useMediaUrl } from './media'
import { stateLabel } from './validate'

const plain = (question: string) => {
  const q = parseQuestion(question)
  return q.pre + q.word + q.post
}

function matches(card: CardRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [plain(card.question), card.answer, card.reading, card.meaning].some((v) => v?.toLowerCase().includes(q))
}

function Thumb({ imageId }: { imageId?: string }) {
  const url = useMediaUrl(imageId)
  if (!url) return <span className="ed-thumb ed-thumb--empty"><span className="sr-only">Sin pista</span></span>
  return <img className="ed-thumb" src={url} alt="Pista visual" />
}

function Row({ card, now, selected, onEdit, onDeleted }: { card: CardRow; now: number; selected: boolean; onEdit: () => void; onDeleted: () => void }) {
  const { db } = useApp()
  const [confirming, setConfirming] = useState(false)
  const name = plain(card.question)
  const remove = async () => {
    await deleteCard(db, card.id)
    onDeleted()
  }
  return (
    // Whole-row click is a mouse shortcut; the question button is the keyboard path.
    <tr className={`ed-table__row ${selected ? 'ed-table__row--selected' : ''}`} onClick={onEdit}>
      <td>
        <Thumb imageId={card.imageId} />
      </td>
      <td>
        <button type="button" className="ed-table__edit" aria-label={`Editar carta ${name}`} onClick={(e) => (e.stopPropagation(), onEdit())}>
          <QuestionText question={card.question} className="ed-table__q" />
        </button>
      </td>
      <td className="mincho ed-table__answer" lang="ja">
        {card.answer}
      </td>
      <td className="ed-table__dim" lang="ja">
        {card.reading}
      </td>
      <td>{card.meaning}</td>
      <td className="chrome ed-table__state">{stateLabel(card.srs, now)}</td>
      <td className="ed-table__actions" onClick={(e) => e.stopPropagation()}>
        {confirming ? (
          <span className="ed-row ed-row--tight">
            <button type="button" className="ed-btn ed-btn--danger ed-btn--s chrome" aria-label="Sí, eliminar carta" onClick={remove}>
              Sí, eliminar
            </button>
            <button type="button" className="ed-btn ed-btn--s chrome" autoFocus onClick={() => setConfirming(false)}>
              No
            </button>
          </span>
        ) : (
          <button type="button" className="ed-iconbtn" aria-label={`Eliminar carta ${name}`} onClick={() => setConfirming(true)}>
            <Icon name="trash" size={18} />
          </button>
        )}
      </td>
    </tr>
  )
}

export function CardTable({ cards, editingId, onEdit, onDeleted }: { cards: CardRow[]; editingId?: string; onEdit: (id: string) => void; onDeleted: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const shown = useMemo(() => cards.filter((c) => matches(c, query)), [cards, query])
  const now = Date.now()
  return (
    <section className="ed-card" aria-labelledby="ed-table-title">
      <div className="ed-row ed-row--between">
        <h2 id="ed-table-title" className="ed-card__title chrome">
          Cartas del mazo
        </h2>
        <label className="sr-only" htmlFor="ed-search">
          Buscar cartas
        </label>
        <input id="ed-search" type="search" className="field ed-search" placeholder="Buscar…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {cards.length === 0 ? (
        <p className="ed-help">Este mazo aún no tiene cartas. Forja la primera arriba o importa un CSV.</p>
      ) : (
        <div className="ed-table__wrap">
          <table className="ed-table">
            <thead>
              <tr className="chrome">
                <th scope="col">Pista</th>
                <th scope="col">Pregunta</th>
                <th scope="col">Respuesta</th>
                <th scope="col">Lectura</th>
                <th scope="col">Significado</th>
                <th scope="col">Estado</th>
                <th scope="col">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <Row key={c.id} card={c} now={now} selected={c.id === editingId} onEdit={() => onEdit(c.id)} onDeleted={() => onDeleted(c.id)} />
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="ed-help">Ninguna carta coincide con «{query}».</p>}
        </div>
      )}
    </section>
  )
}
