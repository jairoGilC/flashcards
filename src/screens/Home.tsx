import { useApp } from '../app/AppContext'
import { href } from '../app/router'
import { DueDiamond, FacetButton, Icon, IconButton, MiniDiamond, RatingChip, Sparkle, deckArt, type IconName } from '../ui'
import type { DeckCounts } from '../core/queue'
import type { DeckRow } from '../db/db'
import { estimateMinutes, levelFromReviews, plural } from './study/helpers'
import { deckTotal, useStudySummary } from './study/useStudySummary'
import './study/study.css'

const INK = { new: 'var(--sapphire)', learning: 'var(--amber)', review: 'var(--emerald)' }

export default function Home() {
  const summary = useStudySummary()
  const { showRed, setShowRed } = useApp()

  if (!summary) return <main className="home" aria-busy="true" />

  const { decks, visible, counts, total, reviewCount } = summary
  const activeDecks = visible.filter((d) => deckTotal(counts[d.id]) > 0).length
  const redCount = decks.filter((d) => d.rating === 'red').length
  const { level, xp, perLevel } = levelFromReviews(reviewCount)

  return (
    <main className="home">
      <section className="home__hero">
        <div className="phone-column home__hero-inner">
          <header className="home__top">
            <div className="home__logo">
              <span className="mincho home__logo-ja" lang="ja">言葉デッキ</span>
              <span className="chrome home__logo-en">Kotoba Deck</span>
            </div>
            <IconButton label="Ajustes del día" href={href('settings')}>
              <Icon name="sliders" />
            </IconButton>
          </header>

          {decks.length > 0 && (
            <>
              <div className="home__today">
                <DueDiamond count={total} />
                <div className="home__today-text">
                  <span className="chrome home__kicker">Repaso diario · mixto</span>
                  <span className="home__dueline">
                    {total > 0
                      ? `${plural(total, 'carta', 'cartas')} · ${plural(activeDecks, 'mazo', 'mazos')} · ≈${estimateMinutes(total)} min`
                      : 'Todo al día por hoy'}
                  </span>
                  <div className="xp">
                    <span className="chrome xp__level">Nv. {level}</span>
                    <span
                      className="xp__track"
                      role="progressbar"
                      aria-label="Experiencia del nivel"
                      aria-valuemin={0}
                      aria-valuemax={perLevel}
                      aria-valuenow={xp}
                    >
                      <span className="xp__fill" style={{ width: `${(xp / perLevel) * 100}%` }} />
                    </span>
                    <span className="chrome xp__count">
                      {xp}/{perLevel} XP
                    </span>
                  </div>
                </div>
              </div>
              <FacetButton href={href('review')} full className="home__start">
                <Sparkle size={14} />
                Iniciar repaso
                <Sparkle size={14} />
              </FacetButton>
            </>
          )}
        </div>
      </section>

      <div className="phone-column home__body">
        {decks.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="home__decks-head">
              <h2 className="chrome home__h2">Mis mazos</h2>
              <ul className="legend" aria-label="Leyenda">
                <li>
                  <MiniDiamond color={INK.new} />
                  Nuevas
                </li>
                <li>
                  <MiniDiamond color={INK.learning} />
                  Aprendiendo
                </li>
                <li>
                  <MiniDiamond color={INK.review} />
                  Repaso
                </li>
              </ul>
            </div>

            {redCount > 0 && (
              <button type="button" className="red-row" aria-pressed={showRed} onClick={() => setShowRed(!showRed)}>
                <Icon name="lock" size={18} />
                <span className="red-row__text">
                  {showRed ? (
                    <>
                      <strong>Mazos rojos visibles</strong> · toca para ocultar
                    </>
                  ) : (
                    <>
                      <strong>
                        {plural(redCount, 'mazo rojo oculto', 'mazos rojos ocultos')}
                      </strong>{' '}
                      · toca para mostrar
                    </>
                  )}
                </span>
                <span className={`red-row__track ${showRed ? 'red-row__track--on' : ''}`} aria-hidden="true">
                  <span className="red-row__knob" />
                </span>
              </button>
            )}

            {visible.length > 0 ? (
              <ul className="deck-grid">
                {visible.map((d) => (
                  <li key={d.id}>
                    <DeckTile deck={d} counts={counts[d.id]} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="home__note">Todos tus mazos son rojos y están ocultos.</p>
            )}
          </>
        )}
      </div>

      <BottomNav />
    </main>
  )
}

function DeckTile({ deck, counts = { new: 0, learning: 0, review: 0 } }: { deck: DeckRow; counts?: DeckCounts }) {
  const art = deckArt(deck)
  const due = deckTotal(counts)
  const label = `${deck.name}: ${counts.new} nuevas, ${counts.learning} aprendiendo, ${counts.review} repaso${deck.paused ? ', en pausa' : ''}`
  return (
    <a className={`deck-tile deck-tile--${deck.rating}`} href={href('review', { deck: deck.id })} aria-label={label}>
      <span className="deck-tile__art" style={{ background: art.background }}>
        <span className="mincho deck-tile__glyph" lang="ja" aria-hidden="true">
          {art.glyph}
        </span>
        <span className="deck-tile__chip">
          <RatingChip rating={deck.rating} />
        </span>
        <span className="deck-tile__due">
          <span className="chrome">{due}</span>
        </span>
      </span>
      <span className="mincho deck-tile__name" lang="ja">
        {deck.name}
      </span>
      <span className="deck-tile__body">
        <span className="deck-tile__sub">{deck.paused ? 'Solo repasos · en pausa' : due > 0 ? 'Para hoy' : 'Al día'}</span>
        <span className="chrome deck-tile__counts">
          <span>
            <MiniDiamond color={INK.new} size={6} />
            {counts.new}
          </span>
          <span>
            <MiniDiamond color={INK.learning} size={6} />
            {counts.learning}
          </span>
          <span>
            <MiniDiamond color={INK.review} size={6} />
            {counts.review}
          </span>
        </span>
      </span>
    </a>
  )
}

function EmptyState() {
  return (
    <div className="panel home__empty">
      <span className="mincho home__empty-glyph" lang="ja" aria-hidden="true">
        空
      </span>
      <h2 className="chrome home__h2">Aún no tienes mazos</h2>
      <p>Abre un sobre con un mazo exportado (deck.zip) o crea tu primer mazo en el editor.</p>
      <FacetButton href={href('import')} full>
        Abrir un sobre
      </FacetButton>
      <FacetButton href={href('editor')} variant="dark" full>
        Crear un mazo
      </FacetButton>
    </div>
  )
}

const NAV: { label: string; icon: IconName; to: string; current?: boolean }[] = [
  { label: 'Mazos', icon: 'decks', to: href('home'), current: true },
  { label: 'Sobres', icon: 'pack', to: href('import') },
  { label: 'Ajustes', icon: 'sliders', to: href('settings') },
  { label: 'Editor', icon: 'forge', to: href('editor') },
]

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      <div className="phone-column bottom-nav__inner">
        {NAV.map((n) => (
          <a key={n.label} href={n.to} className="chrome bottom-nav__link" aria-current={n.current ? 'page' : undefined}>
            <Icon name={n.icon} />
            {n.label}
          </a>
        ))}
      </div>
    </nav>
  )
}
