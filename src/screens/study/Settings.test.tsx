import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Settings from '../Settings'
import type { KotobaDB } from '../../db/db'
import { getNewPerDay, setNewPerDay } from '../../db/repo'
import { deck, freshDb, renderWith, seed } from './testUtils'

let db: KotobaDB
// Unmount first so live queries stop before the DB closes (afterEach runs before RTL's auto-cleanup).
afterEach(() => {
  cleanup()
  db?.close()
})

describe('Settings', () => {
  it('steps new cards per day by 5 within 0–50 and persists it', async () => {
    db = freshDb()
    renderWith(db, <Settings />)
    expect(await screen.findByRole('heading', { name: 'Ajustes del día' })).toBeInTheDocument()
    expect(await screen.findByText('15')).toBeInTheDocument()
    expect(screen.getByText('En unas semanas: ≈ 135 repasos/día · ≈ 23 min')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Más cartas nuevas' }))
    expect(await screen.findByText('20')).toBeInTheDocument()
    expect(await getNewPerDay(db)).toBe(20)

    await setNewPerDay(db, 50)
    expect(await screen.findByText('50')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Más cartas nuevas' }))
    expect(await getNewPerDay(db)).toBe(50)

    await setNewPerDay(db, 0)
    expect(await screen.findByText('0')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Menos cartas nuevas' }))
    expect(await getNewPerDay(db)).toBe(0)
  })

  it('updates deck share and pause state', async () => {
    db = freshDb()
    await seed(db, [deck('a', { name: 'Verbos', share: 3 }), deck('b', { name: 'Anime', share: 1 })], [])
    renderWith(db, <Settings />)

    expect(await screen.findByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: 'Porcentaje de nuevas para Anime' }), { target: { value: '3' } })
    await waitFor(async () => expect((await db.decks.get('b'))!.share).toBe(3))
    expect((await screen.findAllByText('50%')).length).toBe(2)

    await userEvent.click(screen.getByRole('button', { name: 'Pausar Verbos' }))
    await waitFor(async () => expect((await db.decks.get('a'))!.paused).toBe(true))
    expect(await screen.findByText('Solo repasos')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Reanudar Verbos' }))
    await waitFor(async () => expect((await db.decks.get('a'))!.paused).toBe(false))
  })

  it('lists red decks only while the red toggle is on', async () => {
    db = freshDb()
    await seed(db, [deck('a', { name: 'Verbos' }), deck('r', { name: 'Jerga', rating: 'red' })], [])
    renderWith(db, <Settings />)
    expect(await screen.findByText('Verbos')).toBeInTheDocument()
    expect(screen.queryByText('Jerga')).not.toBeInTheDocument()

    const toggle = screen.getByRole('switch', { name: 'Mostrar mazos rojos' })
    await userEvent.click(toggle)
    expect(await screen.findByText('Jerga')).toBeInTheDocument()
    expect(toggle).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/Vuelven a ocultarse cada vez que abres la app/)).toBeInTheDocument()
  })
})
