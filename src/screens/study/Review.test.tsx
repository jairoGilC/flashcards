import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Review from '../Review'
import type { KotobaDB } from '../../db/db'
import { CardState } from '../../core/scheduler'
import { card, deck, dueSrs, freshDb, renderWith, seed } from './testUtils'

let db: KotobaDB
// Unmount first so live queries stop before the DB closes (afterEach runs before RTL's auto-cleanup).
// Only Date is faked: the double-tap guard reads the clock, while timers, Dexie and userEvent run for real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
  db?.close()
  vi.restoreAllMocks()
})

// Taps within the double-tap window after a button swap are ignored, as on the phone; a person pauses longer.
const afterHold = () => vi.setSystemTime(Date.now() + 500)
/** A tap right away, as the second half of a double tap. */
const tap = (name: string | RegExp) => userEvent.click(screen.getByRole('button', { name }))
const flip = () => {
  afterHold()
  return tap('Girar carta')
}
const grade = (name: RegExp) => {
  afterHold()
  return tap(name)
}

// jsdom has no object URLs; stub them for the image.
function stubUrls() {
  URL.createObjectURL = () => ''
  URL.revokeObjectURL = () => {}
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  return vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hint')
}

/** `n` due cards in deck `d` sharing one image. */
async function seedCats(n: number) {
  await seed(db, [deck('d')], Array.from({ length: n }, (_, i) => card('d', `c${i}`, { order: i, question: `[猫${i}]がいる。`, answer: `猫${i}`, imageId: 'd::cat.webp', srs: dueSrs() })))
  await db.media.put({ id: 'd::cat.webp', deckId: 'd', name: 'cat.webp', type: 'image/webp', data: new ArrayBuffer(3) })
}

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
    // A sentence card shows what the whole sentence means.
    expect(screen.getByText('Como un onigiri cada mañana.')).toHaveClass('answer-translation')
    // Four grade buttons with interval previews.
    expect(screen.getByRole('button', { name: /^Otra vez/ })).toHaveTextContent(/min/)
  })

  it('hides the translation on a bare-word card, where it repeats the meaning', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { question: '話す', answer: '話す', meaning: 'hablar', translation: 'Hablar.', srs: dueSrs() })])
    renderWith(db, <Review />)
    expect(await screen.findByText('¿Qué significa?')).toBeInTheDocument()
    await flip()
    expect(screen.getByText('hablar')).toBeInTheDocument()
    expect(screen.queryByText('Hablar.')).toBeNull()
  })

  it('shows the translation with an unmarked sentence, and skips a blank or bracket-only one', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [
      // An imported sentence without [brackets] still shows, so its translation does too.
      card('d', 'a', { order: 0, question: '毎朝おにぎりを食べます。', answer: '食べる', meaning: 'comer', translation: 'Como un onigiri cada mañana.', srs: dueSrs() }),
      card('d', 'b', { order: 1, question: '[話す]', answer: '話す', meaning: 'hablar', translation: 'Hablar.', srs: dueSrs() }),
      card('d', 'c', { order: 2, question: '[猫]がいる。', answer: '猫', meaning: 'gato', translation: '  ', srs: dueSrs() }),
    ])
    renderWith(db, <Review deckId="d" />)
    const seen: Record<string, string | null> = {}
    for (let i = 0; i < 3; i++) {
      await screen.findByRole('button', { name: 'Girar carta' })
      await flip()
      const answer = (await screen.findByTestId('answer')).textContent!
      seen[answer] = document.querySelector('.answer-translation')?.textContent ?? null
      await grade(/^Bien/)
    }
    expect(seen).toEqual({ 食べる: 'Como un onigiri cada mañana.', 話す: null, 猫: null })
  })

  it('keeps the image hidden until the card is graded Bien, then shows it until Siguiente', async () => {
    // jsdom has no object URLs; stub them for the image.
    URL.createObjectURL = () => ''
    URL.revokeObjectURL = () => {}
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:hint')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { question: '[おにぎり]を食べます。', answer: '御握り', imageId: 'd::onigiri.webp', srs: dueSrs() })])
    await db.media.put({ id: 'd::onigiri.webp', deckId: 'd', name: 'onigiri.webp', type: 'image/webp', data: new ArrayBuffer(3) })
    renderWith(db, <Review />)
    await screen.findByRole('button', { name: 'Girar carta' })
    await flip()
    expect(await screen.findByTestId('answer')).toHaveTextContent('御握り')
    // Give a (wrong) image lookup time to finish before asserting it never happened.
    await new Promise((r) => setTimeout(r, 50))
    // The answer is text only until the learner says they knew it.
    expect(createUrl).not.toHaveBeenCalled()
    expect(document.querySelector('.tcg-card__art')).toBeNull()

    await grade(/^Bien/)
    expect(await screen.findByRole('img', { name: 'Pista visual' })).toBeInTheDocument()
    // The grade is already saved; only the image is left to see.
    expect(await db.reviews.count()).toBe(1)
    expect(screen.queryByRole('button', { name: /^Bien/ })).toBeNull()
    // The art window holds just the image; the sentence sits in the text box below.
    const art = document.querySelector('.tcg-card__art')
    expect(art).not.toBeNull()
    // The frame takes the image's own proportions once it has loaded, so the image fills it exactly.
    expect(document.querySelector('.study-card')).toHaveClass('study-card--image')
    const img = screen.getByRole('img', { name: 'Pista visual' })
    expect(img).toHaveClass('hint-art__img--fill')
    // The blurred backdrop only appears once the frame is sized (and only for frames narrower than the card).
    expect(document.querySelector('.answer-backdrop')).toBeNull()
    Object.defineProperty(img, 'naturalWidth', { value: 800 })
    Object.defineProperty(img, 'naturalHeight', { value: 600 })
    fireEvent.load(img)
    await waitFor(() => expect(document.querySelector('.answer-frame')).toHaveAttribute('data-ratio', '1.333'))
    expect(art).not.toHaveTextContent('おにぎり')
    expect(document.querySelector('.tcg-card__body')).toHaveTextContent('おにぎり')

    afterHold()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('¡Repaso completado!')).toBeInTheDocument()
  })

  it('goes straight to the next card after Otra vez or Difícil, without the image', async () => {
    const createUrl = stubUrls()
    db = freshDb()
    await seedCats(3)
    renderWith(db, <Review deckId="d" />)
    for (const g of [/^Otra vez/, /^Difícil/]) {
      await screen.findByRole('button', { name: 'Girar carta' })
      await flip()
      await grade(g)
      expect(await screen.findByRole('button', { name: 'Girar carta' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
    }
    expect(createUrl).not.toHaveBeenCalled()
  })

  it('focuses Siguiente, keeps the count on the graded card and ignores grade keys while the image shows', async () => {
    stubUrls()
    db = freshDb()
    await seedCats(2)
    renderWith(db, <Review deckId="d" />)
    await screen.findByRole('button', { name: 'Girar carta' })
    await flip()
    await userEvent.keyboard('4')
    expect(await screen.findByRole('img', { name: 'Pista visual' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveFocus()
    // Still the first card's place in the session.
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await userEvent.keyboard('1')
    expect(await db.reviews.count()).toBe(1)
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeInTheDocument()
    await userEvent.keyboard(' ')
    expect(await screen.findByRole('button', { name: 'Girar carta' })).toBeInTheDocument()
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('does not flip the next card from a held key or a double tap on Siguiente', async () => {
    stubUrls()
    db = freshDb()
    await seedCats(3)
    renderWith(db, <Review deckId="d" />)
    // Held Enter: the first press continues, the repeats must not flip the next card.
    await screen.findByRole('button', { name: 'Girar carta' })
    await flip()
    await grade(/^Bien/)
    await screen.findByRole('button', { name: 'Siguiente' })
    afterHold()
    await userEvent.keyboard('{Enter}')
    // The browser's auto-repeat while Enter stays down.
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true })
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true })
    expect(await screen.findByRole('button', { name: 'Girar carta' })).toBeInTheDocument()
    expect(screen.queryByTestId('answer')).toBeNull()
    // Double tap on Siguiente: the second tap lands on Girar carta, in the same spot, and is ignored.
    await flip()
    await grade(/^Bien/)
    afterHold()
    await tap('Siguiente')
    await tap('Girar carta')
    expect(screen.queryByTestId('answer')).toBeNull()
  })

  it('ignores the second tap of a double tap on Girar carta, a grade or Bien', async () => {
    stubUrls()
    db = freshDb()
    await seedCats(3)
    renderWith(db, <Review deckId="d" />)
    // Girar carta → the grade row appears under the finger: no grade is saved.
    await screen.findByRole('button', { name: 'Girar carta' })
    afterHold()
    await tap('Girar carta')
    await tap(/^Bien/)
    expect(await db.reviews.count()).toBe(0)
    // Difícil → the next card's Girar carta appears under the finger: it stays unflipped.
    await grade(/^Difícil/)
    await tap('Girar carta')
    expect(screen.queryByTestId('answer')).toBeNull()
    // Bien → Siguiente appears under the finger: the image stays up.
    await flip()
    await grade(/^Bien/)
    await tap('Siguiente')
    expect(screen.getByRole('img', { name: 'Pista visual' })).toBeInTheDocument()
    expect(await db.reviews.count()).toBe(2)
  })

  it('shows the image of a learning card graded Bien, then brings the card back text-only', async () => {
    stubUrls()
    db = freshDb()
    // A new card graded Bien stays in learning and comes back later in the session.
    await seed(db, [deck('d')], [card('d', 'a', { question: '[猫]がいる。', answer: '猫', imageId: 'd::cat.webp' })])
    await db.media.put({ id: 'd::cat.webp', deckId: 'd', name: 'cat.webp', type: 'image/webp', data: new ArrayBuffer(3) })
    renderWith(db, <Review deckId="d" />)
    await screen.findByRole('button', { name: 'Girar carta' })
    await flip()
    await grade(/^Bien/)
    expect(await screen.findByRole('img', { name: 'Pista visual' })).toBeInTheDocument()
    afterHold()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    afterHold()
    await flip()
    expect(await screen.findByTestId('answer')).toHaveTextContent('猫')
    expect(document.querySelector('.tcg-card__art')).toBeNull()
  })

  it('goes straight on after Bien when the card has no image', async () => {
    db = freshDb()
    await seed(db, [deck('d')], [card('d', 'a', { question: '[猫]がいる。', answer: '猫', srs: dueSrs() })])
    renderWith(db, <Review />)
    await screen.findByRole('button', { name: 'Girar carta' })
    await flip()
    await grade(/^Bien/)
    expect(await screen.findByText('¡Repaso completado!')).toBeInTheDocument()
  })

  it('skips Siguiente when the image is missing or cannot be decoded', async () => {
    URL.createObjectURL = () => ''
    URL.revokeObjectURL = () => {}
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:broken')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    db = freshDb()
    await seed(db, [deck('d')], [
      // Points at a media row that was never imported.
      card('d', 'a', { order: 0, question: '[猫]がいる。', answer: '猫', imageId: 'd::missing.webp', srs: dueSrs() }),
      card('d', 'b', { order: 1, question: '[犬]がいる。', answer: '犬', imageId: 'd::bad.webp', srs: dueSrs() }),
    ])
    await db.media.put({ id: 'd::bad.webp', deckId: 'd', name: 'bad.webp', type: 'image/webp', data: new ArrayBuffer(3) })
    renderWith(db, <Review deckId="d" />)
    for (let i = 0; i < 2; i++) {
      await screen.findByRole('button', { name: 'Girar carta' })
      await flip()
      // Graded without the image, as always.
      expect(screen.getByTestId('answer')).toHaveTextContent(/^(猫|犬)$/)
      await grade(/^Bien/)
      // The missing row fails on its own; the undecodable image fails once its <img> renders and errors.
      // Either way there is no image to show, so it moves on without waiting for Siguiente.
      await waitFor(() => {
        const broken = screen.queryByRole('img', { name: 'Pista visual' })
        if (broken) fireEvent.error(broken)
        expect(screen.queryByRole('button', { name: 'Siguiente' })).toBeNull()
      })
      afterHold()
      await waitFor(() => expect(screen.queryByText('¡Repaso completado!') ?? screen.getByRole('button', { name: 'Girar carta' })).toBeInTheDocument())
    }
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
