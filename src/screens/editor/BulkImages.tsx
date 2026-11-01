import { useState, type ChangeEvent } from 'react'
import { useApp } from '../../app/AppContext'
import type { CardRow } from '../../db/db'
import { assignImages, clearImages, type AssignedImage } from '../../db/repo'
import { resizeImage } from '../../media/resizeImage'

const HELP = 'Van por nombre de archivo (1, 2, 10…) a las cartas que aún no tienen imagen, en su orden.'

// File pickers don't keep the click order, so the file name decides: 2.png before 10.png.
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

function report(assigned: AssignedImage[], unused: number, unreadable: string[], saved = true): string {
  const n = assigned.length
  const parts = [
    !saved
      ? 'No se pudieron guardar las imágenes.'
      : n === 0
        ? 'Ninguna imagen asignada.'
        : n === 1
          ? `1 imagen asignada a «${assigned[0].answer}».`
          : `${n} imágenes asignadas, de «${assigned[0].answer}» a «${assigned[n - 1].answer}».`,
  ]
  if (unused) parts.push(`${unused} ${unused === 1 ? 'sobró' : 'sobraron'}: ya no quedan cartas sin imagen.`)
  if (unreadable.length) parts.push(`${unreadable.length === 1 ? 'No se pudo leer' : 'No se pudieron leer'}: ${unreadable.join(', ')}.`)
  return parts.join(' ')
}

/** Picks many images at once and hands them, by file name, to the deck's cards that have none yet. */
export function BulkImages({ deckId, cards }: { deckId: string; cards: CardRow[] }) {
  const { db } = useApp()
  const [progress, setProgress] = useState<string>()
  const [message, setMessage] = useState('')
  // The last batch, so it can be undone.
  const [last, setLast] = useState<AssignedImage[]>([])
  const noneEmpty = cards.every((c) => c.imageId)

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].sort(byName)
    e.target.value = ''
    if (!files.length) return
    setMessage('')
    setLast([])
    const images: { name: string; blob: Blob }[] = []
    const unreadable: string[] = []
    try {
      // One at a time: each decode holds a full-size bitmap in memory.
      for (const [i, file] of files.entries()) {
        setProgress(`Preparando imágenes… ${i + 1}/${files.length}`)
        try {
          images.push(await resizeImage(file))
        } catch {
          unreadable.push(file.name)
        }
      }
      const { assigned, unused } = await assignImages(db, deckId, images)
      setLast(assigned)
      setMessage(report(assigned, unused, unreadable))
    } catch {
      setMessage(report([], 0, unreadable, false))
    } finally {
      setProgress(undefined)
    }
  }

  const undo = async () => {
    await clearImages(db, last)
    setLast([])
    setMessage('Imágenes quitadas.')
  }

  return (
    <>
      <label className="ed-btn ed-btn--paper chrome ed-filebtn" aria-busy={!!progress}>
        {progress ?? 'Imágenes para cartas sin imagen'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={!!progress || noneEmpty}
          aria-describedby="ed-bulk-help"
          onChange={(e) => void pick(e)}
        />
      </label>
      <div className="ed-bulk-status">
        <span id="ed-bulk-help" className="ed-help" hidden={!!message}>
          {HELP}
        </span>
        <span role="status" className="ed-help">
          {message}
        </span>
        {last.length > 0 && (
          <button type="button" className="ed-btn ed-btn--s chrome" onClick={() => void undo()}>
            Deshacer
          </button>
        )}
      </div>
    </>
  )
}
