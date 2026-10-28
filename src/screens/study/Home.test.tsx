import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '../Home'
import type { KotobaDB } from '../../db/db'
import { card, deck, dueSrs, freshDb, renderWith, seed } from './testUtils'

let db: KotobaDB
// Unmount first so live queries stop before the DB closes (afterEach runs before RTL's auto-cleanup).
afterEach(() => {
  cleanup()
  db?.close()
})

async function seedThree() {
  db = freshDb()
  await seed(
    db,
    [deck('verbos', { name: 'JLPT N5 · 動詞' }), deck('slang', { name: 'スラング', rating: 'red' }), deck('kata', { name: 'カタカナ語', paused: true })],
    [
      card('verbos', 'v1', { srs: dueSrs() }),
      card('verbos', 'v2', { srs: dueSrs() }),
      card('verbos', 'v3', { order: 1 }),
      card('slang', 's1', { srs: dueSrs() }),
      card('slang', 's2', { order: 1 }),
      card('kata', 'k1'),
    ],
  )
}

describe('Home', () => {
  it('shows today’s total and per-deck counts, hiding red decks until toggled', async () => {
    await seedThree()
    renderWith(db, <Home />)

    // verbos: 2 reviews + 1 new; kata is paused so no new cards; slang is hidden.
    expect(await screen.findByRole('img', { name: '3 cartas por repasar' })).toBeInTheDocument()
    expect(screen.getByText('3 cartas · 1 mazo · ≈1 min')).toBeInTheDocument()
    expect(screen.queryByText('スラング')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /JLPT N5 · 動詞/ })).toHaveAttribute('href', '#/review?deck=verbos')

    const toggle = screen.getByRole('button', { name: /1 mazo rojo oculto/ })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(toggle)

    expect(await screen.findByRole('img', { name: '5 cartas por repasar' })).toBeInTheDocument()
    expect(screen.getByText('5 cartas · 2 mazos · ≈1 min')).toBeInTheDocument()
    const slang = screen.getByRole('link', { name: /スラング/ })
    expect(within(slang).getByText('Rojo')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Mazos rojos visibles/ }))
    expect(await screen.findByRole('img', { name: '3 cartas por repasar' })).toBeInTheDocument()
    expect(screen.queryByText('スラング')).not.toBeInTheDocument()
  })

  it('marks paused decks and links the start button and nav', async () => {
    await seedThree()
    renderWith(db, <Home />)
    const kata = await screen.findByRole('link', { name: /カタカナ語/ })
    expect(within(kata).getByText(/en pausa/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Iniciar repaso/ })).toHaveAttribute('href', '#/review')
    const nav = screen.getByRole('navigation', { name: 'Navegación principal' })
    expect(within(nav).getByRole('link', { name: 'Sobres' })).toHaveAttribute('href', '#/import')
    expect(within(nav).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '#/settings')
    expect(within(nav).getByRole('link', { name: 'Editor' })).toHaveAttribute('href', '#/editor')
    expect(screen.getByRole('link', { name: 'Ajustes del día' })).toHaveAttribute('href', '#/settings')
  })

  it('derives level and XP from the review log', async () => {
    await seedThree()
    await db.reviews.bulkAdd(
      Array.from({ length: 53 }, (_, i) => ({ cardId: 'verbos::v1', deckId: 'verbos', grade: 'good' as const, at: i, wasNew: false })),
    )
    renderWith(db, <Home />)
    expect(await screen.findByText('Nv. 2')).toBeInTheDocument()
    expect(screen.getByText('30/500 XP')).toBeInTheDocument()
  })

  it('shows a friendly empty state when there are no decks', async () => {
    db = freshDb()
    renderWith(db, <Home />)
    expect(await screen.findByText(/Aún no tienes mazos/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Abrir un sobre/ })).toHaveAttribute('href', '#/import')
    expect(screen.getByRole('link', { name: /Crear un mazo/ })).toHaveAttribute('href', '#/editor')
  })
})
