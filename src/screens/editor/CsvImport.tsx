import { useState } from 'react'
import { useApp } from '../../app/AppContext'
import { saveCard } from '../../db/repo'
import { parseCardCsv, type CsvResult } from './csv'

export function CsvImport({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const { db } = useApp()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<{ added: number; rejected: CsvResult['rejected'] }>()

  const run = async () => {
    const { cards, rejected } = parseCardCsv(text)
    setBusy(true)
    try {
      // Sequential so each card gets the next order number.
      for (const c of cards) {
        await saveCard(db, { deckId, question: c.question, answer: c.answer, reading: c.reading, meaning: c.meaning, translation: c.translation }, Date.now())
      }
    } finally {
      setBusy(false)
    }
    setReport({ added: cards.length, rejected })
    if (cards.length) setText('')
  }

  return (
    <section className="ed-card ed-csv" aria-labelledby="ed-csv-title">
      <div className="ed-row ed-row--between">
        <h2 id="ed-csv-title" className="ed-card__title chrome">
          Importar CSV
        </h2>
        <button type="button" className="ed-btn ed-btn--s chrome" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <p className="ed-help">
        Una carta por línea: pregunta, respuesta, lectura, significado. Separado por comas o tabuladores; la fila de títulos es opcional.
      </p>
      <label className="label" htmlFor="ed-csv-text">
        Pega aquí las filas
      </label>
      <textarea id="ed-csv-text" className="field ed-csv__text" lang="ja" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="ed-row ed-row--between">
        <label className="ed-btn ed-btn--paper chrome ed-csv__file">
          O elige un archivo .csv / .tsv
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setText(await f.text())
              e.target.value = ''
            }}
          />
        </label>
        <button type="button" className="ed-btn ed-btn--dark chrome" disabled={busy || !text.trim()} onClick={run}>
          Importar cartas
        </button>
      </div>
      {report && (
        <div role="status" className="ed-csv__report">
          <p>{report.added === 1 ? '1 carta añadida.' : `${report.added} cartas añadidas.`}</p>
          {report.rejected.length > 0 && (
            <>
              <p className="ed-error">{report.rejected.length === 1 ? '1 línea rechazada:' : `${report.rejected.length} líneas rechazadas:`}</p>
              <ul className="ed-csv__rejected">
                {report.rejected.map((r) => (
                  <li key={r.line}>
                    Línea {r.line}: {r.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </section>
  )
}
