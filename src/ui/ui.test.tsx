import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DiamondPips, DueDiamond, FacetButton, QuestionText, RatingChip, TcgCard, Toggle, deckArt } from './index'

describe('DueDiamond', () => {
  it('shows the count and an accessible label', () => {
    render(<DueDiamond count={47} />)
    expect(screen.getByRole('img', { name: '47 cartas por repasar' })).toHaveTextContent('47')
  })
  it('goes quiet when nothing is due', () => {
    render(<DueDiamond count={0} />)
    expect(screen.getByRole('img', { name: 'Nada por repasar' })).toHaveTextContent(/listo/i)
  })
})

describe('QuestionText', () => {
  it('underlines only the marked word', () => {
    const { container } = render(<QuestionText question="毎朝おにぎりを[食べます]。" />)
    expect(container).toHaveTextContent('毎朝おにぎりを食べます。')
    expect(container.querySelector('u')).toHaveTextContent('食べます')
  })
  it('renders a bare word without underline', () => {
    const { container } = render(<QuestionText question="話す" />)
    expect(container.querySelector('u')).toBeNull()
    expect(container).toHaveTextContent('話す')
  })
})

describe('Toggle', () => {
  it('reports pressed state and calls onChange with the next value', async () => {
    const onChange = vi.fn()
    render(<Toggle checked={false} onChange={onChange} label="Mostrar mazos rojos" />)
    const btn = screen.getByRole('switch', { name: 'Mostrar mazos rojos' })
    expect(btn).toHaveAttribute('aria-checked', 'false')
    await userEvent.click(btn)
    expect(onChange).toHaveBeenCalledWith(true)
  })
})

describe('DiamondPips', () => {
  it('marks done, current and upcoming pips', () => {
    const { container } = render(<DiamondPips total={4} done={1} />)
    const pips = [...container.querySelectorAll('[data-pip]')].map((p) => p.getAttribute('data-pip'))
    expect(pips).toEqual(['done', 'current', 'upcoming', 'upcoming'])
    expect(screen.getByRole('img', { name: 'Carta 2 de 4' })).toBeInTheDocument()
  })
  it('caps the row and still labels real progress', () => {
    const { container } = render(<DiamondPips total={80} done={10} max={20} />)
    expect(container.querySelectorAll('[data-pip]')).toHaveLength(20)
    expect(screen.getByRole('img', { name: 'Carta 11 de 80' })).toBeInTheDocument()
  })
})

describe('FacetButton', () => {
  it('is a real button that fires onClick', async () => {
    const onClick = vi.fn()
    render(<FacetButton onClick={onClick}>Girar carta</FacetButton>)
    await userEvent.click(screen.getByRole('button', { name: 'Girar carta' }))
    expect(onClick).toHaveBeenCalled()
  })
  it('renders as a link when given href', () => {
    render(<FacetButton href="#/review">Iniciar repaso</FacetButton>)
    expect(screen.getByRole('link', { name: 'Iniciar repaso' })).toHaveAttribute('href', '#/review')
  })
})

describe('RatingChip / deckArt', () => {
  it('labels green and red decks', () => {
    render(<><RatingChip rating="green" /><RatingChip rating="red" /></>)
    expect(screen.getByText('Verde')).toBeInTheDocument()
    expect(screen.getByText('Rojo')).toBeInTheDocument()
  })
  it('derives a stable glyph and gradient per deck', () => {
    const a = deckArt({ id: 'n5', name: 'JLPT N5 · 動詞', rating: 'green' })
    expect(a.glyph).toBe('動')
    expect(deckArt({ id: 'n5', name: 'JLPT N5 · 動詞', rating: 'green' })).toEqual(a)
    expect(deckArt({ id: 'x', name: 'Slang', rating: 'red' }).background).toMatch(/#8E1426/i)
  })
})

describe('TcgCard', () => {
  it('leaves out the art window when there is no art', () => {
    const { container } = render(<TcgCard band="Pregunta">本</TcgCard>)
    expect(container.querySelector('.tcg-card__art')).toBeNull()
    expect(container.querySelector('.tcg-card--no-art')).not.toBeNull()
  })
})
