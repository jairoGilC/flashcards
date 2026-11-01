import { useState, type ChangeEvent } from 'react'
import { useApp } from '../../app/AppContext'
import type { CardRow } from '../../db/db'
import { assignImages } from '../../db/repo'
import { resizeImage } from '../../media/resizeImage'

const HELP = 'Se asignan por nombre de archivo a las cartas que aún no tienen imagen, en su orden.'

// File pickers don't keep the click order, so the file name decides: 2.png before 10.png.
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

function report(answers: string[], unused: number, unreadable: string[]): string {
  const n = answers.length
  const parts = [
    n === 0
      ? 'Ninguna imagen asignada.'
      : n === 1
        ? `1 imagen asignada a «${answers[0]}».`
        : `${n} imágenes asignadas, de «${answers[0]}» a «${answers[n - 1]}».`,
  ]
  if (unused) parts.push(`${unused} ${unused === 1 ? 'sobró' : 'sobraron'}: ya no quedan cartas sin imagen.`)
  if (unreadable.length) parts.push(`No se pudo leer: ${unreadable.join(', ')}.`)
  return parts.join(' ')
}

/** Picks many images at once and hands them, by file name, to the deck's cards that have none yet. */
export function BulkImages({ deckId, cards }: { deckId: string; cards: CardRow[] }) {
  const { db } = useApp()
  const [progress, setProgress] = useState<string>()
  const [message, setMessage] = useState('')

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])].sort(byName)
    e.target.value = ''
    if (!files.length) return
    setMessage('')
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
      const answers = assigned.map((id) => cards.find((c) => c.id === id)?.answer ?? '')
      setMessage(report(answers, unused, unreadable))
    } catch {
      setMessage('No se pudieron guardar las imágenes.')
    } finally {
      setProgress(undefined)
    }
  }

  return (
    <>
      <label className="ed-btn ed-btn--paper chrome" title={HELP}>
        {progress ?? 'Imágenes para varias cartas'}
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          disabled={!!progress}
          aria-describedby="ed-bulk-help"
          onChange={(e) => void pick(e)}
        />
      </label>
      <span id="ed-bulk-help" className="sr-only">
        {HELP}
      </span>
      <span role="status" className="ed-help ed-bulk-status">
        {message}
      </span>
    </>
  )
}
