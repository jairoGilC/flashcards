import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider } from '../../app/AppContext'
import { useRoute } from '../../app/router'
import { KotobaDB } from '../../db/db'
import { createDeck, rateCard, saveCard } from '../../db/repo'
import { CardState } from '../../core/scheduler'
import { downloadBlob } from '../../io/files'
import { parseDeckZip } from '../../core/deckFile'
import Editor from '../Editor'
import { resizeImage } from '../../media/resizeImage'

vi.mock('../../io/files', async (orig) => ({ ...(await orig<typeof import('../../io/files')>()), downloadBlob: vi.fn() }))
vi.mock('../../media/resizeImage', () => ({
  resizeImage: vi.fn(async () => ({ blob: new Blob(['WEBP'], { type: 'image/webp' }), name: 'small.webp' })),
}))

let db: KotobaDB
let n = 0

beforeEach(async () => {
  db = new KotobaDB(`editor-${++n}`)
  await db.open()
  window.location.hash = ''
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
})
afterEach(async () => {
  // Unmount before closing the DB so live queries do not read a deleted database.
  cleanup()
  vi.mocked(downloadBlob).mockClear()
  db.close()
  await db.delete()
})

// Mirrors App.tsx so ?deck= navigation works as in the real app.
function Harness() {
  const route = useRoute()
  return <Editor deckId={route.params.deck} />
}

function renderEditor() {
  return render(
    <AppProvider db={db}>
      <Harness />
    </AppProvider>,
  )
}

async function withDeck(name = 'JLPT N5', rating: 'green' | 'red' = 'green') {
  const id = await createDeck(db, { name, rating }, Date.now())
  window.location.hash = `#/editor?deck=${id}`
  return id
}

const user = () => userEvent.setup()

async function fillCard(u: ReturnType<typeof user>, values: { question: string; answer: string; reading?: string; meaning?: string; translation?: string }) {
  await u.type(screen.getByLabelText(/^Pregunta/), values.question.replace(/\[/g, '[['))
  await u.type(screen.getByLabelText('Respuesta'), values.answer)
  if (values.reading) await u.type(screen.getByLabelText('Lectura'), values.reading)
  if (values.meaning) await u.type(screen.getByLabelText('Significado'), values.meaning)
  if (values.translation) await u.type(screen.getByLabelText(/^Traducción de la frase/), values.translation)
}

describe('Editor · decks', () => {
  it('shows an empty state and creates a deck from the inline form', async () => {
    const u = user()
    renderEditor()
    expect(await screen.findByText(/aún no tienes mazos/i)).toBeInTheDocument()

    await u.click(screen.getAllByRole('button', { name: /nuevo mazo/i })[0])
    await u.type(screen.getByLabelText('Nombre del mazo'), 'スラング')
    await u.click(screen.getByRole('radio', { name: 'Rojo' }))
    await u.click(screen.getByRole('button', { name: 'Crear mazo' }))

    const decks = await waitFor(async () => {
      const all = await db.decks.toArray()
      expect(all).toHaveLength(1)
      return all
    })
    expect(decks[0]).toMatchObject({ name: 'スラング', rating: 'red' })
    expect(window.location.hash).toBe(`#/editor?deck=${decks[0].id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'スラング' })).toBeInTheDocument()
  })

  it('lists every deck (red too) with rating chip and card count, and links home', async () => {
    const id = await withDeck('JLPT N5')
    await createDeck(db, { name: 'スラング', rating: 'red' }, Date.now())
    await saveCard(db, { deckId: id, question: '話す', answer: '話す' }, Date.now())
    renderEditor()
    const nav = await screen.findByRole('navigation', { name: 'Mazos' })
    const n5 = await within(nav).findByRole('link', { name: /JLPT N5/ })
    expect(n5).toHaveAttribute('aria-current', 'page')
    await waitFor(() => expect(n5).toHaveTextContent('1'))
    expect(within(nav).getByRole('link', { name: /スラング/ })).toHaveTextContent('Rojo')
    expect(screen.getByRole('link', { name: /volver al móvil/i })).toHaveAttribute('href', '#/')
  })

  it('renames the deck inline', async () => {
    const u = user()
    const id = await withDeck('JLPT N5')
    renderEditor()
    await u.click(await screen.findByRole('button', { name: 'Renombrar mazo' }))
    const input = screen.getByLabelText('Nombre del mazo')
    await u.clear(input)
    await u.type(input, 'JLPT N4{Enter}')
    await waitFor(async () => expect((await db.decks.get(id))?.name).toBe('JLPT N4'))
  })

  it('changes the rating with the Verde/Rojo radio group', async () => {
    const u = user()
    const id = await withDeck()
    renderEditor()
    const group = await screen.findByRole('radiogroup', { name: 'Clasificación del mazo' })
    expect(within(group).getByRole('radio', { name: 'Verde' })).toHaveAttribute('aria-checked', 'true')
    await u.click(within(group).getByRole('radio', { name: 'Rojo' }))
    await waitFor(async () => expect((await db.decks.get(id))?.rating).toBe('red'))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Rojo' })).toHaveAttribute('aria-checked', 'true'))
  })

  it('deletes a deck only after the inline confirmation', async () => {
    const u = user()
    const id = await withDeck('JLPT N5')
    renderEditor()
    await u.click(await screen.findByRole('button', { name: 'Eliminar mazo' }))
    await u.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await db.decks.get(id)).toBeDefined()

    await u.click(screen.getByRole('button', { name: 'Eliminar mazo' }))
    expect(screen.getByText(/¿eliminar «JLPT N5»/i)).toBeInTheDocument()
    await u.click(screen.getByRole('button', { name: 'Sí, eliminar' }))
    await waitFor(async () => expect(await db.decks.get(id)).toBeUndefined())
    expect(window.location.hash).toBe('#/editor')
  })

  it('packs the deck into a zip named after it', async () => {
    const u = user()
    const id = await withDeck('JLPT N5 · 動詞')
    await saveCard(db, { deckId: id, question: '話す', answer: '話す' }, Date.now())
    renderEditor()
    await u.click(await screen.findByRole('button', { name: /empaquetar sobre/i }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalled())
    const [blob, name] = vi.mocked(downloadBlob).mock.calls[0]
    expect(name).toBe('JLPT-N5-動詞.zip')
    const parsed = await parseDeckZip(blob)
    expect(parsed.deck.cards.map((c) => c.question)).toEqual(['話す'])
  })

  it('links to the .apkg importer', async () => {
    await withDeck()
    renderEditor()
    expect(await screen.findByRole('link', { name: /importar \.apkg/i })).toHaveAttribute('href', '#/import')
  })
})

describe('Editor · card form', () => {
  it('forges a card, clears the form and focuses Pregunta again', async () => {
    const u = user()
    const id = await withDeck()
    renderEditor()
    await screen.findByRole('heading', { name: 'Nueva carta' })
    await fillCard(u, { question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', translation: 'Como un onigiri cada mañana.' })
    await u.click(screen.getByRole('button', { name: /forjar carta y siguiente/i }))

    await waitFor(async () => expect(await db.cards.where('deckId').equals(id).count()).toBe(1))
    const [card] = await db.cards.toArray()
    expect(card).toMatchObject({ question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', translation: 'Como un onigiri cada mañana.' })
    await waitFor(() => expect(screen.getByLabelText(/^Pregunta/)).toHaveValue(''))
    expect(screen.getByLabelText(/^Traducción de la frase/)).toHaveValue('')
    expect(screen.getByLabelText(/^Pregunta/)).toHaveFocus()
    const table = screen.getByRole('table')
    expect(await within(table).findByText('食べる')).toBeInTheDocument()
    expect(within(table).getByText('Nueva')).toBeInTheDocument()
  })

  it('saves with Cmd/Ctrl+Enter', async () => {
    const u = user()
    await withDeck()
    renderEditor()
    await screen.findByRole('heading', { name: 'Nueva carta' })
    await fillCard(u, { question: '話す', answer: '話す' })
    await u.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(async () => expect(await db.cards.count()).toBe(1))
  })

  it('shows Spanish errors and saves nothing when invalid', async () => {
    const u = user()
    await withDeck()
    renderEditor()
    await u.click(await screen.findByRole('button', { name: /forjar carta y siguiente/i }))
    expect(screen.getByText('Escribe la pregunta.')).toBeInTheDocument()
    expect(screen.getByText('Escribe la respuesta.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Pregunta/)).toHaveAttribute('aria-invalid', 'true')

    await u.type(screen.getByLabelText(/^Pregunta/), '本を[[読む')
    await u.type(screen.getByLabelText('Respuesta'), '読む')
    await u.click(screen.getByRole('button', { name: /forjar carta y siguiente/i }))
    expect(screen.getByText(/cierra el corchete/i)).toBeInTheDocument()
    expect(await db.cards.count()).toBe(0)
  })

  it('updates the live preview while typing', async () => {
    const u = user()
    await withDeck()
    renderEditor()
    const preview = await screen.findByRole('region', { name: 'Vista previa' })
    await u.type(screen.getByLabelText(/^Pregunta/), '本を[[読む]。')
    expect(within(preview).getByText('Pregunta')).toBeInTheDocument()
    expect(preview.querySelector('u')).toHaveTextContent('読む')
    // Same as the study question side: no art window.
    expect(preview.querySelector('.tcg-card__art')).toBeNull()
  })

  it('edits an existing card from the table and keeps its review progress', async () => {
    const u = user()
    const id = await withDeck()
    const cardId = await saveCard(db, { deckId: id, question: '話す', answer: '話す', meaning: 'hablar', translation: 'Hablo.', tags: ['n5'] }, Date.now())
    await rateCard(db, cardId, 'good', Date.now())
    const before = (await db.cards.get(cardId))!.srs
    expect(before.state).not.toBe(CardState.New)

    renderEditor()
    await u.click(await screen.findByRole('button', { name: /editar carta 話す/i }))
    expect(screen.getByRole('heading', { name: 'Editar carta' })).toBeInTheDocument()
    expect(screen.getByLabelText(/^Traducción de la frase/)).toHaveValue('Hablo.')
    // A bare word never shows its translation; the field says so.
    expect(screen.getByLabelText(/^Traducción de la frase/)).toHaveAccessibleDescription(/solo se muestra .*frase/i)
    const meaning = screen.getByLabelText('Significado')
    expect(meaning).toHaveValue('hablar')
    await u.clear(meaning)
    await u.type(meaning, 'hablar, decir')
    await u.click(screen.getByRole('button', { name: /guardar cambios/i }))

    await waitFor(async () => expect((await db.cards.get(cardId))?.meaning).toBe('hablar, decir'))
    expect((await db.cards.get(cardId))!.translation).toBe('Hablo.')
    // Tags from deck.json / .apkg imports have no field in the form; they are kept, not wiped.
    expect((await db.cards.get(cardId))!.tags).toEqual(['n5'])
    expect((await db.cards.get(cardId))!.srs).toEqual(before)
    expect(await db.cards.count()).toBe(1)
    expect(await screen.findByRole('heading', { name: 'Nueva carta' })).toBeInTheDocument()
  })

  it('clears a translation when the field is emptied', async () => {
    const u = user()
    const id = await withDeck()
    const cardId = await saveCard(db, { deckId: id, question: '[猫]がいる。', answer: '猫', translation: 'Hay un gato.' }, Date.now())
    renderEditor()
    await u.click(await screen.findByRole('button', { name: /editar carta 猫/i }))
    const field = screen.getByLabelText(/^Traducción de la frase/)
    expect(field).not.toHaveAccessibleDescription(/solo se muestra/i)
    await u.clear(field)
    await u.click(screen.getByRole('button', { name: /guardar cambios/i }))
    await waitFor(async () => expect((await db.cards.get(cardId))?.translation).toBeUndefined())
  })

  it('attaches a hint image from the file picker and can remove it before saving', async () => {
    const u = user()
    const id = await withDeck()
    renderEditor()
    await screen.findByRole('heading', { name: 'Nueva carta' })
    const file = new File(['PNG'], 'onigiri.png', { type: 'image/png' })
    await u.upload(screen.getByLabelText(/elige una imagen/i), file)
    expect(await screen.findByRole('img', { name: 'Imagen elegida' })).toBeInTheDocument()
    // The preview is the question side, which never shows the image.
    expect(within(screen.getByRole('region', { name: 'Vista previa' })).queryByRole('img')).toBeNull()

    await u.click(screen.getByRole('button', { name: 'Quitar imagen' }))
    expect(screen.queryByRole('img', { name: 'Imagen elegida' })).toBeNull()

    await u.upload(screen.getByLabelText(/elige una imagen/i), file)
    await screen.findByRole('img', { name: 'Imagen elegida' })
    await fillCard(u, { question: '[おにぎり]', answer: 'おにぎり' })
    await u.click(screen.getByRole('button', { name: /forjar carta y siguiente/i }))
    await waitFor(async () => expect(await db.cards.count()).toBe(1))
    await waitFor(async () => expect((await db.cards.toArray())[0]?.imageId).toBe(`${id}::small.webp`))
    expect((await db.media.get(`${id}::small.webp`))?.type).toBe('image/webp')
    expect(await screen.findByText('1 carta · 1 con pista visual · 0 KB')).toBeInTheDocument()
  })

  it('accepts a pasted image while the form is focused', async () => {
    await withDeck()
    renderEditor()
    const q = await screen.findByLabelText(/^Pregunta/)
    const file = new File(['PNG'], 'clip.png', { type: 'image/png' })
    await act(async () => {
      fireEvent.paste(q, { clipboardData: { files: [file], items: [], getData: () => '' } })
    })
    expect(await screen.findByRole('img', { name: 'Imagen elegida' })).toBeInTheDocument()
  })
})

describe('Editor · card table', () => {
  it('filters by question, answer, reading or meaning', async () => {
    const u = user()
    const id = await withDeck()
    await saveCard(db, { deckId: id, question: '本を[読む]', answer: '読む', reading: 'よむ', meaning: 'leer' }, Date.now())
    await saveCard(db, { deckId: id, question: '話す', answer: '話す', reading: 'はなす', meaning: 'hablar' }, Date.now())
    renderEditor()
    const table = await screen.findByRole('table')
    await within(table).findByRole('button', { name: 'Editar carta 本を読む' })
    expect(within(table).getAllByRole('row')).toHaveLength(3)

    await u.type(screen.getByLabelText('Buscar cartas'), 'habl')
    expect(within(table).getAllByRole('row')).toHaveLength(2)
    expect(within(table).queryByRole('button', { name: 'Editar carta 本を読む' })).toBeNull()
    await u.clear(screen.getByLabelText('Buscar cartas'))
    await u.type(screen.getByLabelText('Buscar cartas'), 'よむ')
    expect(within(table).getByRole('button', { name: 'Editar carta 本を読む' })).toBeInTheDocument()
    expect(within(table).getAllByRole('row')).toHaveLength(2)
  })

  it('deletes a card after an inline confirmation', async () => {
    const u = user()
    const id = await withDeck()
    await saveCard(db, { deckId: id, question: '話す', answer: '話す' }, Date.now())
    renderEditor()
    await u.click(await screen.findByRole('button', { name: 'Eliminar carta 話す' }))
    await u.click(screen.getByRole('button', { name: 'No' }))
    expect(await db.cards.count()).toBe(1)
    await u.click(screen.getByRole('button', { name: 'Eliminar carta 話す' }))
    await u.click(screen.getByRole('button', { name: 'Sí, eliminar carta' }))
    await waitFor(async () => expect(await db.cards.count()).toBe(0))
  })
})

describe('Editor · CSV import', () => {
  it('imports pasted rows and reports rejected lines', async () => {
    const u = user()
    const id = await withDeck()
    renderEditor()
    await u.click(await screen.findByRole('button', { name: 'Importar CSV' }))
    const area = screen.getByLabelText(/pega aquí/i)
    fireEvent.change(area, { target: { value: 'pregunta,respuesta\n話す,話す,はなす,hablar\n本を[読む,読む\n読む,読む' } })
    await u.click(screen.getByRole('button', { name: 'Importar cartas' }))

    expect(await screen.findByText('2 cartas añadidas.')).toBeInTheDocument()
    expect(screen.getByText(/línea 3/i)).toBeInTheDocument()
    const cards = await db.cards.where('deckId').equals(id).sortBy('order')
    expect(cards.map((c) => [c.question, c.reading])).toEqual([
      ['話す', 'はなす'],
      ['読む', undefined],
    ])
  })
})

describe('Editor · images for many cards', () => {
  // Each picked file becomes its own small image, named after it.
  const resizeByName = () => {
    vi.mocked(resizeImage).mockImplementation(async (f) => ({ blob: new Blob(['WEBP'], { type: 'image/webp' }), name: `${(f as File).name}.webp` }))
  }
  const png = (name: string) => new File(['PNG'], name, { type: 'image/png' })
  const defaultResize = vi.mocked(resizeImage).getMockImplementation()
  afterEach(() => {
    vi.mocked(resizeImage).mockReset()
    if (defaultResize) vi.mocked(resizeImage).mockImplementation(defaultResize)
  })

  async function deckWith(answers: string[], withImage: string[] = []) {
    const id = await withDeck()
    for (const a of answers) {
      await saveCard(db, { deckId: id, question: a, answer: a, image: withImage.includes(a) ? { name: `${a}.webp`, blob: new Blob(['W'], { type: 'image/webp' }) } : undefined }, Date.now())
    }
    return id
  }
  const imageOf = async (id: string, answer: string) => (await db.cards.where('deckId').equals(id).toArray()).find((c) => c.answer === answer)?.imageId

  it('gives the picked images, sorted by file name, to the first cards without one', async () => {
    resizeByName()
    const u = user()
    const id = await deckWith(['犬', '猫', '鳥', '魚', '馬'], ['猫'])
    renderEditor()
    const input = await screen.findByLabelText(/imágenes para cartas sin imagen/i)
    expect(input).toHaveAttribute('multiple')
    // The rule is on screen, not only in a tooltip.
    expect(screen.getByText(/por nombre de archivo/i)).toBeVisible()
    // Picked in any order; 2 comes before 10, and case doesn't matter.
    await u.upload(input, [png('img_10.png'), png('IMG_0002.png'), png('Img_1.png')])

    expect(await screen.findByText('3 imágenes asignadas, de «犬» a «魚».')).toBeInTheDocument()
    expect(await imageOf(id, '犬')).toBe(`${id}::Img_1.png.webp`)
    expect(await imageOf(id, '猫')).toBe(`${id}::猫.webp`)
    expect(await imageOf(id, '鳥')).toBe(`${id}::IMG_0002.png.webp`)
    expect(await imageOf(id, '魚')).toBe(`${id}::img_10.png.webp`)
    expect(await imageOf(id, '馬')).toBeUndefined()
  })

  it('says how many images were left over when there are fewer cards without one', async () => {
    resizeByName()
    const u = user()
    const id = await deckWith(['犬', '猫'], ['猫'])
    renderEditor()
    await u.upload(await screen.findByLabelText(/imágenes para cartas sin imagen/i), [png('a.png'), png('b.png'), png('c.png')])
    expect(await screen.findByText('1 imagen asignada a «犬». 2 sobraron: ya no quedan cartas sin imagen.')).toBeInTheDocument()
    expect(await imageOf(id, '犬')).toBe(`${id}::a.png.webp`)
    // The picker is now off; the reason stays next to the report.
    expect(screen.getByText('Todas las cartas ya tienen imagen.')).toBeVisible()
  })

  it('skips a file it cannot read and keeps going', async () => {
    resizeByName()
    vi.mocked(resizeImage).mockRejectedValueOnce(new Error('bad'))
    const u = user()
    const id = await deckWith(['犬', '猫'])
    renderEditor()
    await u.upload(await screen.findByLabelText(/imágenes para cartas sin imagen/i), [png('a.png'), png('b.png')])
    expect(await screen.findByText('1 imagen asignada a «犬». No se pudo leer: a.png.')).toBeInTheDocument()
    expect(await imageOf(id, '犬')).toBe(`${id}::b.png.webp`)
    expect(await imageOf(id, '猫')).toBeUndefined()
  })
  it('undoes the last batch', async () => {
    resizeByName()
    const u = user()
    const id = await deckWith(['犬', '猫'], ['猫'])
    renderEditor()
    await u.upload(await screen.findByLabelText(/imágenes para cartas sin imagen/i), [png('a.png')])
    await screen.findByText('1 imagen asignada a «犬».')
    await u.click(screen.getByRole('button', { name: 'Deshacer' }))
    await waitFor(async () => expect(await imageOf(id, '犬')).toBeUndefined())
    expect(await imageOf(id, '猫')).toBe(`${id}::猫.webp`)
    expect(await screen.findByText('1 imagen quitada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deshacer' })).toBeNull()
  })

  it('keeps Deshacer after a failed undo so it can be retried', async () => {
    resizeByName()
    const u = user()
    const id = await deckWith(['犬', '猫'])
    renderEditor()
    await u.upload(await screen.findByLabelText(/imágenes para cartas sin imagen/i), [png('a.png'), png('b.png')])
    await screen.findByText('2 imágenes asignadas, de «犬» a «猫».')
    const spy = vi.spyOn(db, 'transaction').mockRejectedValueOnce(new Error('quota'))
    await u.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(await screen.findByText('No se pudieron quitar las imágenes.')).toBeInTheDocument()
    spy.mockRestore()
    await u.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(await screen.findByText('2 imágenes quitadas.')).toBeInTheDocument()
    expect(await imageOf(id, '犬')).toBeUndefined()
  })

  it('is disabled, and says why, when every card already has an image or there are no cards', async () => {
    await deckWith(['犬', '猫'], ['犬', '猫'])
    renderEditor()
    expect(await screen.findByLabelText(/imágenes para cartas sin imagen/i)).toBeDisabled()
    expect(screen.getByText('Todas las cartas ya tienen imagen.')).toBeVisible()
    cleanup()
    await withDeck('Vacío')
    renderEditor()
    expect(await screen.findByLabelText(/imágenes para cartas sin imagen/i)).toBeDisabled()
    expect(screen.getByText('El mazo aún no tiene cartas.')).toBeVisible()
  })

  it('names every file it could not read', async () => {
    resizeByName()
    vi.mocked(resizeImage).mockRejectedValueOnce(new Error('bad')).mockRejectedValueOnce(new Error('bad'))
    const u = user()
    await deckWith(['犬'])
    renderEditor()
    await u.upload(await screen.findByLabelText(/imágenes para cartas sin imagen/i), [png('a.png'), png('b.png')])
    expect(await screen.findByText('Ninguna imagen asignada. No se pudieron leer: a.png, b.png.')).toBeInTheDocument()
  })
})
