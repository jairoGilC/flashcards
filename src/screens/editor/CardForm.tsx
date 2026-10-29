import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent, type KeyboardEvent } from 'react'
import { useApp } from '../../app/AppContext'
import type { CardRow, DeckRow } from '../../db/db'
import { saveCard } from '../../db/repo'
import { resizeImage } from '../../media/resizeImage'
import { Icon, QuestionText, TcgCard, deckArt } from '../../ui'
import { useBlobUrl, useMediaUrl } from './media'
import { formatBytes, validateCard, type CardErrors } from './validate'

interface Fields {
  question: string
  answer: string
  reading: string
  meaning: string
  translation: string
}

const EMPTY: Fields = { question: '', answer: '', reading: '', meaning: '', translation: '' }

function fieldsOf(card?: CardRow): Fields {
  if (!card) return EMPTY
  return {
    question: card.question,
    answer: card.answer,
    reading: card.reading ?? '',
    meaning: card.meaning ?? '',
    translation: card.translation ?? '',
  }
}

/** Image picked in this form: a new one, `null` = remove the stored one, undefined = untouched. */
type ImageChoice = { name: string; blob: Blob } | null | undefined

function imageFrom(list: FileList | File[] | undefined | null): File | undefined {
  return list ? [...list].find((f) => f.type.startsWith('image/')) : undefined
}

export function CardForm({ deck, editing, onDone }: { deck: DeckRow; editing?: CardRow; onDone: () => void }) {
  const { db } = useApp()
  const [fields, setFields] = useState<Fields>(() => fieldsOf(editing))
  const [errors, setErrors] = useState<CardErrors>({})
  const [image, setImage] = useState<ImageChoice>(undefined)
  const [imageError, setImageError] = useState('')
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('')
  const questionRef = useRef<HTMLInputElement>(null)
  const answerRef = useRef<HTMLInputElement>(null)

  const chosenUrl = useBlobUrl(image?.blob)
  const storedId = image === undefined ? editing?.imageId : undefined
  const storedUrl = useMediaUrl(storedId)
  const thumbUrl = chosenUrl ?? storedUrl
  const art = deckArt(deck)

  // Ready for typing as soon as the form appears (new card, or a row picked for editing).
  useEffect(() => questionRef.current?.focus(), [])

  const set = (key: keyof Fields) => (e: { target: { value: string } }) => {
    setFields((f) => ({ ...f, [key]: e.target.value }))
    if (key in errors) setErrors((er) => ({ ...er, [key]: undefined }))
  }

  const takeFile = async (file?: File) => {
    if (!file) return
    setImageError('')
    try {
      setImage(await resizeImage(file))
    } catch {
      setImageError('No se pudo leer esa imagen. Prueba con PNG, JPEG o WebP.')
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLFormElement>) => {
    const file = imageFrom(e.clipboardData.files) ?? imageFrom([...(e.clipboardData.items ?? [])].map((i) => i.getAsFile()).filter((f): f is File => !!f))
    if (!file) return
    e.preventDefault()
    void takeFile(file)
  }

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = imageFrom(e.dataTransfer.files)
    if (file) void takeFile(file)
    else setImageError('Suelta un archivo de imagen.')
  }

  const save = async () => {
    if (saving) return
    const found = validateCard(fields)
    setErrors(found)
    if (found.question) return questionRef.current?.focus()
    if (found.answer) return answerRef.current?.focus()
    setSaving(true)
    try {
      await saveCard(db, { id: editing?.id, deckId: deck.id, ...fields, image }, Date.now())
    } finally {
      setSaving(false)
    }
    if (editing) return onDone()
    setFields(EMPTY)
    setImage(undefined)
    setStatus('Carta forjada. Escribe la siguiente.')
    questionRef.current?.focus()
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void save()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
    } else if (e.key === 'Escape' && editing) onDone()
  }

  const describe = (key: keyof CardErrors, help?: string) => [errors[key] ? `ed-err-${key}` : '', help ?? ''].filter(Boolean).join(' ') || undefined

  return (
    <div className="ed-forge">
      <form className="ed-card ed-form" onSubmit={onSubmit} onKeyDown={onKeyDown} onPaste={onPaste} noValidate>
        <h2 className="ed-card__title chrome">{editing ? 'Editar carta' : 'Nueva carta'}</h2>

        <div className="ed-field">
          <label className="label" htmlFor="ed-question">
            Pregunta · palabra o frase
          </label>
          <input
            id="ed-question"
            ref={questionRef}
            className="field ed-input--question mincho"
            lang="ja"
            autoComplete="off"
            value={fields.question}
            onChange={set('question')}
            aria-invalid={!!errors.question}
            aria-describedby={describe('question', 'ed-question-help')}
          />
          {errors.question && (
            <span id="ed-err-question" className="ed-error">
              {errors.question}
            </span>
          )}
          <span id="ed-question-help" className="ed-help">
            Pon entre [corchetes] la palabra que se subraya. Si es solo una palabra, escríbela sin corchetes.
          </span>
        </div>

        <div className="ed-grid3">
          <div className="ed-field">
            <label className="label" htmlFor="ed-answer">
              Respuesta
            </label>
            <input
              id="ed-answer"
              ref={answerRef}
              className="field ed-input--answer mincho"
              lang="ja"
              autoComplete="off"
              value={fields.answer}
              onChange={set('answer')}
              aria-invalid={!!errors.answer}
              aria-describedby={describe('answer')}
            />
            {errors.answer && (
              <span id="ed-err-answer" className="ed-error">
                {errors.answer}
              </span>
            )}
          </div>
          <div className="ed-field">
            <label className="label" htmlFor="ed-reading">
              Lectura
            </label>
            <input id="ed-reading" className="field" lang="ja" autoComplete="off" value={fields.reading} onChange={set('reading')} />
          </div>
          <div className="ed-field">
            <label className="label" htmlFor="ed-meaning">
              Significado
            </label>
            <input id="ed-meaning" className="field" autoComplete="off" value={fields.meaning} onChange={set('meaning')} />
          </div>
        </div>

        <div className="ed-field">
          <label className="label" htmlFor="ed-translation">
            Traducción de la frase (opcional)
          </label>
          <input id="ed-translation" className="field" autoComplete="off" value={fields.translation} onChange={set('translation')} />
        </div>

        <div className="ed-field">
          <span className="label">Imagen de la respuesta (opcional)</span>
          <div
            className={`ed-drop ${dragging ? 'ed-drop--over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <label htmlFor="ed-image" className="ed-drop__label">
              <span className="ed-drop__thumb" style={thumbUrl ? undefined : { background: art.background }}>
                {thumbUrl ? (
                  <img src={thumbUrl} alt="Imagen elegida" />
                ) : (
                  <Icon name="plus" size={26} />
                )}
              </span>
              <span className="ed-drop__text">
                <strong>Arrastra, pega (Ctrl+V) o elige una imagen</strong>
                <span className="ed-help">
                  {image
                    ? `${image.name} · ${formatBytes(image.blob.size)} · aparece como ayuda, no como pregunta`
                    : 'Se reduce a 800 px WebP · aparece como ayuda, no como pregunta'}
                </span>
              </span>
              <input
                id="ed-image"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  void takeFile(imageFrom(e.target.files))
                  e.target.value = ''
                }}
              />
            </label>
            {thumbUrl && (
              <button type="button" className="ed-iconbtn" aria-label="Quitar imagen" onClick={() => setImage(editing?.imageId ? null : undefined)}>
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          {imageError && (
            <span role="alert" className="ed-error">
              {imageError}
            </span>
          )}
        </div>

        <div className="ed-row ed-row--end">
          <span role="status" className="ed-help">
            {status}
          </span>
          {editing && (
            <button type="button" className="ed-btn chrome" onClick={onDone}>
              Cancelar edición
            </button>
          )}
          <button type="submit" className="ed-btn ed-btn--dark chrome" disabled={saving} aria-keyshortcuts="Control+Enter Meta+Enter">
            {editing ? 'Guardar cambios' : 'Forjar carta y siguiente'}
          </button>
        </div>
      </form>

      <section className="ed-preview" aria-label="Vista previa">
        <span className="label" aria-hidden="true">
          Vista previa
        </span>
        <TcgCard
          width={240}
          glow="none"
          band={<span>Pregunta</span>}
        >
          {fields.question.trim() ? (
            <QuestionText question={fields.question} className="ed-preview__q" />
          ) : (
            <span className="ed-help">Escribe la pregunta…</span>
          )}
        </TcgCard>
      </section>
    </div>
  )
}
