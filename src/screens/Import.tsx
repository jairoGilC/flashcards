import { useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useApp } from '../app/AppContext'
import { DeckFileError, parseDeckZip, type ParsedDeckZip } from '../core/deckFile'
import { importDeck } from '../db/repo'
import { parseApkg } from '../io/apkg'
import { FacetButton, ScreenHeader } from '../ui'
import { BoosterPack } from './import/BoosterPack'
import { JobCard, type Job } from './import/JobCard'
import { VaultPanel } from './import/VaultPanel'
import './import/import.css'

function parse(file: File): Promise<ParsedDeckZip> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'apkg') return parseApkg(file)
  if (ext === 'zip') return parseDeckZip(file)
  return Promise.reject(new DeckFileError('Formato no compatible: elige un .zip o un .apkg.'))
}

function errorText(err: unknown): string {
  return err instanceof DeckFileError ? err.message : 'No se pudo abrir el archivo.'
}

export default function Import() {
  const { db } = useApp()
  const [jobs, setJobs] = useState<Job[]>([])
  const [dragging, setDragging] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  // Parsed decks waiting for the merge/replace answer.
  const parsed = useRef(new Map<number, ParsedDeckZip>())
  const nextKey = useRef(0)

  const patch = (key: number, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.key === key ? { ...j, ...p } : j)))

  async function save(key: number, mode: 'merge' | 'replace') {
    const data = parsed.current.get(key)
    if (!data) return
    patch(key, { status: 'saving' })
    try {
      await importDeck(db, data, mode, Date.now())
      patch(key, { status: 'done' })
    } catch {
      patch(key, { status: 'error', error: 'No se pudo guardar el mazo en este dispositivo.' })
    } finally {
      parsed.current.delete(key)
      setRefreshKey((k) => k + 1)
    }
  }

  async function open(file: File, key: number) {
    try {
      const data = await parse(file)
      parsed.current.set(key, data)
      const info = { deckName: data.deck.name, cards: data.deck.cards.length, images: data.media.size }
      const existing = await db.decks.get(data.deck.id)
      if (existing) {
        patch(key, { ...info, existingName: existing.name, status: 'ask' })
      } else {
        patch(key, info)
        await save(key, 'merge')
      }
    } catch (err) {
      patch(key, { status: 'error', error: errorText(err) })
    }
  }

  function start(files: FileList | File[] | null | undefined) {
    const list = [...(files ?? [])]
    if (!list.length) return
    const added = list.map((f) => ({ file: f, key: nextKey.current++ }))
    setJobs((js) => [...added.map(({ file, key }): Job => ({ key, fileName: file.name, status: 'opening' })), ...js])
    for (const { file, key } of added) void open(file, key)
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    start(e.target.files)
    // Allow picking the same file again later.
    e.target.value = ''
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragging(false)
    start(e.dataTransfer?.files)
  }

  const anyDone = jobs.some((j) => j.status === 'done')

  return (
    <main className="screen screen--night import-screen">
      <div className="phone-column import">
        <ScreenHeader title="Abrir sobre" />

        <label
          htmlFor="deck-file"
          className={`dropzone ${dragging ? 'dropzone--over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <BoosterPack />
          <span className="chrome dropzone__title">Abre un sobre nuevo</span>
          <span className="dropzone__hint">
            Elige el .zip que exportaste desde el computador o un .apkg de Anki. Desde Archivos, iCloud o Drive.
          </span>
          <input id="deck-file" className="sr-only" type="file" accept=".zip,.apkg" multiple onChange={onPick} />
        </label>

        <section className="import__results" aria-labelledby="results-title" aria-live="polite">
          <h2 id="results-title" className={`chrome import__h2 ${jobs.length ? '' : 'sr-only'}`}>
            Resultados
          </h2>
          {jobs.length > 0 && (
            <ul className="import__jobs">
              {jobs.map((job) => (
                <JobCard key={job.key} job={job} onChoose={(mode) => void save(job.key, mode)} />
              ))}
            </ul>
          )}
          {anyDone && (
            <FacetButton href="#/" size="s" variant="dark" full>
              Ver mis mazos
            </FacetButton>
          )}
        </section>

        <VaultPanel refreshKey={refreshKey} onRestored={() => setRefreshKey((k) => k + 1)} />
      </div>
    </main>
  )
}
