import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Review from '../Review'
import type { KotobaDB } from '../../db/db'
import { CardState } from '../../core/scheduler'
import { card, deck, dueSrs, freshDb, renderWith, seed } from './testUtils'

let db: KotobaDB
// Unmount first so live queries stop before the DB closes (afterEach runs before RTL's auto-cleanup).
afterEach(() => {
  cleanup()
  db?.close()
  vi.restoreAllMocks()
})

const flip = () => userEvent.click(screen.getByRole('button', { name: 'Girar carta' }))
const grade = (name: RegExp) => userEvent.click(screen.getByRole('button', { name }))

describe('Review', () => {
  it('flips, grades, persists the rating and ends with a summary', async () => {
    db = freshDb()
    await seed(db, [deck('d', { name: 'JLPT N5' })], [
      card('d', 'a', { question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', translation: 'Como un onigiri cada mañana.', srs: dueSrs() }),
      card('d', 'b', { question: '話す', answer: '話す', meaning: 'hablar', srs: dueSrs() }),
    ])
    renderWith(db, <Review />)

    expect(await screen.findByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveClass('review--card')
    expect(screen.getByText('Repaso diario · mixto')).toBeInTheDocument()
    await flip()
    const first = screen.getByTestId('answer').textContent!
    const bien = screen.getByRole('button', { name: /^Bien/ })
    expect(bien.className).toMatch(/glow/)
    await grade(/^Bien/)

    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    const rows = await db.reviews.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0].grade).toBe('good')
    const rated = await db.cards.get(rows[0].cardId)
    expect(rated!.answer).toBe(first)
    expect(rated!.srs.due).toBeGreaterThan(Date.now() + 60 * 60 * 1000)

    await flip()
    expect(screen.getByTestId('answer').textContent).not.toBe(first)
    await grade(/^Fácil/)

    expect(await screen.findByText('¡Repaso completado!')).toBeInTheDocument()
    // The one-viewport-tall card layout is only for cards; the summary can grow and scroll.
    expect(screen.getByRole('main')).not.toHaveClass('review--card')
    expect(screen.getByText('Bien').closest('li')).toHaveTextContent('1')
    expect(screen.getByText('Fácil').closest('li')).toHaveTextContent('1')
    expect(screen.getByRole('link', { name: /Volver a mis mazos/ })).toHaveAttribute('href', '#/')
    expect(await db.reviews.count()).toBe(2)
  })

  it('shows the answer side details', async () => {
    db = freshDb()
    await seed(db, [deck('d', { name: 'JLPT N5' })], [
      card('d', 'a', { question: '毎朝おにぎりを[食べます]。', answer: '食べる', reading: 'たべる', meaning: 'comer', translation: 'Como un onigiri cada mañana.', srs: dueSrs() }),
    ])
    renderWith(db, <Review />)
    expect(await screen.findByText('¿Cuál es la palabra subrayada?')).toBeInTheDocument()
    await flip()
    expect(screen.getByTestId('answer')).toHaveTextContent('食べる')
    expect(screen.getByTestId('answer')).toHaveAttribute('lang', 'ja')
    expect(screen.getByText('たべる')).toBeInTheDocument()
    expect(screen.getByText('comer')).toBeInTheDocument()
    // The translation is redundant next to the answer and meaning, so it isn't shown.
    expect(screen.queryByText('Como un onigiri cada mañana.')).toBeNull()
    // Four grade buttons with interval previews.
    expect(screen.getByRole('button', { name: /^Otra vez/ })).toHaveTextContent(/min/)
  })

  it('keeps the image off the question side and shows it with the answer', async () => {
    // jsdom has no object URLs; stub them for the image on the answer side.
    URL.createObjectURL = () => ''
    URL.revokeObjectURL = () => {}
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hint')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { question: '[おにぎり]を食べます。', answer: '御握り', imageId: 'd::onigiri.webp', srs: dueSrs() })])
    await db.media.put({ id: 'd::onigiri.webp', deckId: 'd', name: 'onigiri.webp', type: 'image/webp', data: new ArrayBuffer(3) })
    renderWith(db, <Review />)
    await screen.findByRole('button', { name: 'Girar carta' })
    // Give a (wrong) image lookup on the question side time to finish before asserting it never happened.
    await new Promise((r) => setTimeout(r, 50))
    expect(createUrl).not.toHaveBeenCalled()
    expect(screen.queryByRole('img', { name: 'Pista visual' })).toBeNull()
    await flip()
    expect(await screen.findByRole('img', { name: 'Pista visual' })).toBeInTheDocument()
    // Only the answer side ever loaded the image: once for the frame, once for its blurred backdrop.
    expect(createUrl).toHaveBeenCalledTimes(2)
    // The art window holds just the image; the sentence sits in the text box below.
    const art = document.querySelector('.tcg-card__art')
    expect(art).not.toBeNull()
    // The frame takes the image's own proportions once it has loaded, so the image fills it exactly.
    expect(document.querySelector('.study-card')).toHaveClass('study-card--image')
    const img = screen.getByRole('img', { name: 'Pista visual' })
    expect(img).toHaveClass('hint-art__img--fill')
    Object.defineProperty(img, 'naturalWidth', { value: 800 })
    Object.defineProperty(img, 'naturalHeight', { value: 600 })
    fireEvent.load(img)
    await waitFor(() => expect(document.querySelector('.answer-frame')).toHaveAttribute('data-ratio', '1.333'))
    // Behind the frame, a blurred copy of the image fills any side strips (decorative, hidden from screen readers).
    expect(document.querySelector('.answer-backdrop img')).toHaveAttribute('alt', '')
    expect(art).not.toHaveTextContent('おにぎり')
    expect(document.querySelector('.tcg-card__body')).toHaveTextContent('おにぎり')
  })

  it('has no art window on the question side, nor on an answer without an image', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { question: '毎朝おにぎりを[食べます]。', answer: '食べる', srs: dueSrs() })])
    renderWith(db, <Review />)
    await screen.findByRole('button', { name: 'Girar carta' })
    expect(document.querySelector('.tcg-card__art')).toBeNull()
    await flip()
    expect(document.querySelector('.tcg-card__art')).toBeNull()
    // The sentence moves into the answer's text box.
    expect(document.querySelector('.tcg-card__body u')).toHaveTextContent('食べます')
  })

  it('repeats a bare-word question on the answer side only when it differs from the answer', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [
      card('d', 'a', { order: 0, question: 'たべる', answer: '食べる', srs: dueSrs() }),
      card('d', 'b', { order: 1, question: '猫', answer: '猫', srs: dueSrs() }),
    ])
    renderWith(db, <Review deckId="d" />)
    for (let i = 0; i < 2; i++) {
      await screen.findByRole('button', { name: 'Girar carta' })
      await flip()
      const body = document.querySelector('.tcg-card__body')!
      const answer = screen.getByTestId('answer').textContent
      if (answer === '食べる') expect(body).toHaveTextContent('たべる')
      else expect(body.textContent!.split('猫')).toHaveLength(2)
      await grade(/^Bien/)
      await waitFor(() => expect(screen.queryByText('¡Repaso completado!') ?? screen.getByRole('button', { name: 'Girar carta' })).toBeInTheDocument())
    }
  })

  it('asks "¿Qué significa?" for a bare word', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { question: '話す', srs: dueSrs() })])
    renderWith(db, <Review />)
    expect(await screen.findByText('¿Qué significa?')).toBeInTheDocument()
  })

  it('brings an "Otra vez" card back later in the same session', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'nuevo', { answer: '猫' })])
    renderWith(db, <Review />)

    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    await flip()
    await grade(/^Otra vez/)

    expect(await screen.findByText('2 / 2')).toBeInTheDocument()
    const c = await db.cards.get('d::nuevo')
    expect(c!.srs.state).toBe(CardState.Learning)
    await flip()
    expect(screen.getByTestId('answer')).toHaveTextContent('猫')
    await grade(/^Bien/)
    // A good answer on a learning step may need one more step; finish whatever is left.
    // Grading is async (DB write), so wait for the next card or the summary before each step.
    const next = () => waitFor(() => expect(screen.queryByText('¡Repaso completado!') ?? screen.getByRole('button', { name: 'Girar carta' })).toBeInTheDocument())
    await next()
    while (!screen.queryByText('¡Repaso completado!')) {
      await flip()
      await grade(/^Fácil/)
      await next()
    }
    expect(await db.reviews.count()).toBeGreaterThanOrEqual(2)
  })

  it('supports Space to flip and 1–4 to grade', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { srs: dueSrs() })])
    renderWith(db, <Review />)
    await screen.findByText('1 / 1')
    await userEvent.keyboard(' ')
    expect(await screen.findByTestId('answer')).toBeInTheDocument()
    await userEvent.keyboard('3')
    expect(await screen.findByText('¡Repaso completado!')).toBeInTheDocument()
    expect((await db.reviews.toArray())[0].grade).toBe('good')
  })

  it('focuses on one deck and titles the session with its name', async () => {
    db = freshDb()
    await seed(db, [deck('a', { name: 'Verbos' }), deck('b', { name: 'Otro' })], [
      card('a', '1', { srs: dueSrs() }),
      card('b', '1', { srs: dueSrs() }),
    ])
    renderWith(db, <Review deckId="a" />)
    expect(await screen.findByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Verbos' })).toBeInTheDocument()
  })

  it('locks a red deck while red decks are hidden', async () => {
    db = freshDb()
    await seed(db, [deck('r', { name: 'Jerga', rating: 'red' })], [card('r', '1', { srs: dueSrs() })])
    renderWith(db, <Review deckId="r" />)
    expect(await screen.findByText(/Este mazo es rojo/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Girar carta' })).not.toBeInTheDocument()
  })

  it('shows a calm state when nothing is due', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [])
    renderWith(db, <Review />)
    expect(await screen.findByText('Nada por repasar hoy')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Volver a mis mazos/ })).toHaveAttribute('href', '#/')
  })

  it('shows an error instead of hanging when the cards cannot be read', async () => {
    db = freshDb()
    await db.open()
    db.close()
    renderWith(db, <Review />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/No se pudieron cargar las cartas/)
    expect(screen.queryByText('Barajando cartas…')).toBeNull()
  })

  it('has a close button back home', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { srs: dueSrs() })])
    renderWith(db, <Review />)
    expect(await screen.findByRole('link', { name: 'Cerrar repaso' })).toHaveAttribute('href', '#/')
    await screen.findByRole('button', { name: 'Girar carta' })
  })
})
