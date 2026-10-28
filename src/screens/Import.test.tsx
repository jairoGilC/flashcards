import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import JSZip from 'jszip'
import initSqlJs from 'sql.js'
import { AppProvider } from '../app/AppContext'
import { exportDeckZip, type DeckFile } from '../core/deckFile'
import { KotobaDB } from '../db/db'
import { importDeck, rateCard } from '../db/repo'
import { exportBackup } from '../io/backup'
import Import from './Import'

// The real loader resolves the wasm by URL (browser only); in Node sql.js finds it on disk.
vi.mock('../io/sqlite', () => ({ loadSqlJs: () => initSqlJs() }))

const download = vi.hoisted(() => vi.fn())
vi.mock('../io/files', async (orig) => ({ ...(await orig<typeof import('../io/files')>()), downloadBlob: download }))

const deck: DeckFile = {
  version: 1,
  id: 'n5',
  name: 'JLPT N5',
  rating: 'green',
  cards: [
    { id: 'c1', question: '食べる', answer: 'comer', image: 'onigiri.webp' },
    { id: 'c2', question: '話す', answer: 'hablar' },
  ],
}
const img = () => new Map([['onigiri.webp', new Blob(['IMG'], { type: 'image/webp' })]])

async function deckZip(d: DeckFile = deck, name = 'n5.zip'): Promise<File> {
  return new File([await exportDeckZip(d, img())], name, { type: 'application/zip' })
}

let db: KotobaDB

function renderImport() {
  render(
    <AppProvider db={db}>
      <Import />
    </AppProvider>,
  )
  return screen.getByLabelText(/abre un sobre nuevo/i) as HTMLInputElement
}

beforeEach(() => {
  db = new KotobaDB(`import-${Math.random()}`)
  download.mockReset()
})

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.delete()
})

describe('Import screen', () => {
  it('opens a new deck.zip and reports cards and images', async () => {
    const input = renderImport()
    expect(screen.getByRole('heading', { name: 'Abrir sobre' })).toBeInTheDocument()
    await userEvent.upload(input, await deckZip())

    const results = screen.getByRole('region', { name: /resultados/i })
    expect(results).toHaveAttribute('aria-live', 'polite')
    expect(await within(results).findByText('2 cartas · 1 imagen · ¡listo!')).toBeInTheDocument()
    expect(within(results).getByText('n5.zip')).toBeInTheDocument()
    expect(await db.cards.count()).toBe(2)
    expect(await db.media.count()).toBe(1)
  })

  it('asks merge vs replace for an existing deck and merging keeps progress', async () => {
    await importDeck(db, { deck, media: img() }, 'merge', Date.now())
    await rateCard(db, 'n5::c1', 'good', Date.now())
    const input = renderImport()
    await userEvent.upload(input, await deckZip({ ...deck, cards: [...deck.cards, { id: 'c3', question: '飲む', answer: 'beber' }] }))

    const merge = await screen.findByRole('button', { name: /combinar y conservar progreso/i })
    expect(screen.getByRole('button', { name: /reemplazar/i })).toBeInTheDocument()
    expect(await db.cards.count()).toBe(2)
    await userEvent.click(merge)

    expect(await screen.findByText('3 cartas · 1 imagen · ¡listo!')).toBeInTheDocument()
    expect((await db.cards.get('n5::c1'))!.srs.reps).toBe(1)
    expect(await db.reviews.count()).toBe(1)
  })

  it('names the deck already on the device when the incoming file is called differently', async () => {
    await importDeck(db, { deck, media: img() }, 'merge', Date.now())
    const input = renderImport()
    await userEvent.upload(input, await deckZip({ ...deck, name: 'Otro nombre' }))
    expect(await screen.findByText(/Ya tienes el mazo «JLPT N5»/)).toHaveTextContent('«Otro nombre»')
  })

  it('replacing an existing deck resets its progress', async () => {
    await importDeck(db, { deck, media: img() }, 'merge', Date.now())
    await rateCard(db, 'n5::c1', 'good', Date.now())
    const input = renderImport()
    await userEvent.upload(input, await deckZip())
    await userEvent.click(await screen.findByRole('button', { name: /reemplazar/i }))

    expect(await screen.findByText(/¡listo!/)).toBeInTheDocument()
    expect((await db.cards.get('n5::c1'))!.srs.reps).toBe(0)
    expect(await db.reviews.count()).toBe(0)
  })

  it('shows a Spanish error for a bad file and still imports the others', async () => {
    const input = renderImport()
    const bad = new File(['nope'], 'roto.zip', { type: 'application/zip' })
    await userEvent.upload(input, [bad, await deckZip({ ...deck, id: 'otro' }, 'otro.zip')])

    expect(await screen.findByText('El archivo no es un .zip válido.')).toBeInTheDocument()
    expect(await screen.findByText(/2 cartas · 1 imagen · ¡listo!/)).toBeInTheDocument()
    expect(await db.decks.count()).toBe(1)
  })

  it('opens an Anki .apkg', async () => {
    const SQL = await initSqlJs()
    const sdb = new SQL.Database()
    sdb.run('CREATE TABLE col (id integer primary key, decks text)')
    sdb.run('CREATE TABLE notes (id integer primary key, guid text, tags text, flds text)')
    sdb.run('CREATE TABLE cards (id integer primary key, nid integer, did integer, ord integer)')
    sdb.run('INSERT INTO col VALUES (1, ?)', [JSON.stringify({ '7': { name: 'Kanji' } })])
    sdb.run("INSERT INTO notes VALUES (1, 'g1', '', ?)", ['山\x1fmontaña'])
    sdb.run('INSERT INTO cards VALUES (1, 1, 7, 0)')
    const zip = new JSZip()
    zip.file('collection.anki2', sdb.export())
    zip.file('media', '{}')
    const input = renderImport()
    await userEvent.upload(input, new File([await zip.generateAsync({ type: 'blob' })], 'kanji.apkg'))

    expect(await screen.findByText('1 carta · 0 imágenes · ¡listo!')).toBeInTheDocument()
    expect((await db.decks.get('apkg-7'))!.name).toBe('Kanji')
  })

  it('accepts files dropped on the pack', async () => {
    const input = renderImport()
    fireEvent.drop(input.closest('label')!, { dataTransfer: { files: [await deckZip()] } })
    expect(await screen.findByText(/¡listo!/)).toBeInTheDocument()
  })
})

describe('Vault panel', () => {
  it('shows usage and asks for persistent storage', async () => {
    const persist = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('navigator', {
      ...navigator,
      storage: { estimate: async () => ({ usage: 146 * 1024 * 1024, quota: 1600 * 1024 * 1024 }), persisted: async () => false, persist },
    })
    renderImport()
    expect(await screen.findByText('146 MB')).toBeInTheDocument()
    expect(screen.getByText(/guardado persistente desactivado/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /activar guardado persistente/i }))
    expect(persist).toHaveBeenCalled()
    expect(await screen.findByText(/guardado persistente activo/i)).toBeInTheDocument()
  })

  it('exports a backup through the download flow', async () => {
    await importDeck(db, { deck, media: img() }, 'merge', Date.now())
    renderImport()
    await userEvent.click(screen.getByRole('button', { name: /exportar copia de seguridad/i }))
    await waitFor(() => expect(download).toHaveBeenCalled())
    expect(download.mock.calls[0][1]).toMatch(/^kotoba-deck-copia-\d{4}-\d{2}-\d{2}\.zip$/)
  })

  it('restores a backup only after inline confirmation', async () => {
    await importDeck(db, { deck, media: img() }, 'merge', Date.now())
    const backup = new File([await exportBackup(db)], 'copia.zip')
    await db.decks.clear()
    await db.cards.clear()
    renderImport()

    await userEvent.upload(screen.getByLabelText(/restaurar copia/i), backup)
    expect(await screen.findByText(/reemplazará todos tus mazos/i)).toBeInTheDocument()
    expect(await db.cards.count()).toBe(0)
    await userEvent.click(screen.getByRole('button', { name: /sí, restaurar/i }))

    expect(await screen.findByText(/copia restaurada: 1 mazo · 2 cartas/i)).toBeInTheDocument()
    expect(await db.cards.count()).toBe(2)
  })
})
