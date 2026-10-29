import type { CSSProperties, ReactNode } from 'react'
import { parseQuestion } from '../core/question'
import type { DeckRating } from '../core/queue'
import './ui.css'

export { HintArt } from './HintArt'

// ---------- Facet button ----------

export type FacetVariant = 'gold' | 'dark' | 'ruby' | 'amber' | 'emerald' | 'sapphire'

interface FacetButtonProps {
  children: ReactNode
  variant?: FacetVariant
  size?: 'm' | 's'
  /** Stretch to the container width. */
  full?: boolean
  href?: string
  onClick?: () => void
  disabled?: boolean
  type?: 'button' | 'submit'
  ariaLabel?: string
  /** Glow, for the suggested choice. */
  highlight?: boolean
  className?: string
}

export function FacetButton({
  children,
  variant = 'gold',
  size = 'm',
  full,
  href,
  onClick,
  disabled,
  type = 'button',
  ariaLabel,
  highlight,
  className = '',
}: FacetButtonProps) {
  const cls = `facet-btn facet ${size === 's' ? 'facet-s' : ''} facet-btn--${variant} facet-btn--${size} ${full ? 'facet-btn--full' : ''} ${highlight ? 'facet-btn--glow' : ''} ${className}`
  const inner = <span className={`facet-btn__body facet ${size === 's' ? 'facet-s' : ''}`}>{children}</span>
  if (href) {
    return (
      <a className={cls} href={href} aria-label={ariaLabel}>
        {inner}
      </a>
    )
  }
  return (
    <button className={cls} type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {inner}
    </button>
  )
}

/** 44px square chrome button for icons (back, close, settings, audio). */
export function IconButton({ label, onClick, href, children }: { label: string; onClick?: () => void; href?: string; children: ReactNode }) {
  return (
    <FacetButton variant="dark" size="s" onClick={onClick} href={href} ariaLabel={label} className="icon-btn">
      {children}
    </FacetButton>
  )
}

// ---------- Diamonds ----------

export function DueDiamond({ count, size = 70 }: { count: number; size?: number }) {
  const due = count > 0
  return (
    <div
      role="img"
      aria-label={due ? `${count} cartas por repasar` : 'Nada por repasar'}
      className={`due-diamond ${due ? 'due-diamond--due pulse' : ''}`}
      style={{ width: size, height: size, margin: size * 0.15 }}
    >
      <span className="chrome" style={{ fontSize: due ? size * 0.46 : size * 0.2 }}>
        {due ? count : 'Listo'}
      </span>
    </div>
  )
}

export function MiniDiamond({ color, size = 7, children }: { color: string; size?: number; children?: ReactNode }) {
  return (
    <span className="mini-diamond" style={{ width: size, height: size, background: color }}>
      {children}
    </span>
  )
}

export function DiamondPips({ total, done, max = 20 }: { total: number; done: number; max?: number }) {
  const shown = Math.min(total, max)
  const start = Math.max(0, Math.min(done - Math.floor(shown / 2), total - shown))
  return (
    <div className="pips" role="img" aria-label={`Carta ${Math.min(done + 1, total)} de ${total}`}>
      {Array.from({ length: shown }, (_, k) => {
        const i = start + k
        const state = i < done ? 'done' : i === done ? 'current' : 'upcoming'
        return <span key={i} data-pip={state} className={`pip pip--${state}`} />
      })}
    </div>
  )
}

// ---------- Text ----------

export function QuestionText({ question, className = '', style }: { question: string; className?: string; style?: CSSProperties }) {
  const q = parseQuestion(question)
  return (
    <p className={`question mincho ${className}`} lang="ja" style={style}>
      {q.isSentence ? (
        <>
          {q.pre}
          <u>{q.word}</u>
          {q.post}
        </>
      ) : (
        q.word
      )}
    </p>
  )
}

// ---------- Controls ----------

export function Toggle({ checked, onChange, label, tone = 'ruby' }: { checked: boolean; onChange: (v: boolean) => void; label: string; tone?: 'ruby' | 'gold' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle toggle--${tone} ${checked ? 'toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__knob" />
    </button>
  )
}

export function RatingChip({ rating }: { rating: DeckRating }) {
  return <span className={`rating-chip chrome rating-chip--${rating}`}>{rating === 'red' ? 'Rojo' : 'Verde'}</span>
}

export function ScreenHeader({ title, backHref = '#/', backLabel = 'Volver', right }: { title: ReactNode; backHref?: string; backLabel?: string; right?: ReactNode }) {
  return (
    <header className="screen-header">
      <IconButton label={backLabel} href={backHref}>
        <Icon name="back" />
      </IconButton>
      <h1 className="chrome screen-header__title">{title}</h1>
      {right}
    </header>
  )
}

// ---------- TCG card ----------

export function TcgCard({
  art,
  band,
  children,
  width = 300,
  glow = 'purple',
  artHeight,
  className = '',
}: {
  /** Omit for a text-only card: the band then sits at the top. */
  art?: ReactNode
  band: ReactNode
  children: ReactNode
  width?: number | string
  glow?: 'purple' | 'gold' | 'red' | 'none'
  artHeight?: number | string
  className?: string
}) {
  return (
    <article className={`tcg-card tcg-card--${glow} ${art == null ? 'tcg-card--no-art' : ''} ${className}`} style={{ width }}>
      {art != null && (
        <div className="tcg-card__art" style={{ height: artHeight }}>
          {art}
        </div>
      )}
      <div className="tcg-card__band">{band}</div>
      <div className="tcg-card__body">{children}</div>
    </article>
  )
}

// ---------- Deck art ----------

const PALETTES = [
  ['#A48BF0', '#7B5FD0', '#241C44'],
  ['#F0C25A', '#D99A1F', '#5A3A06'],
  ['#5BB6E6', '#1D7FB5', '#0D2F47'],
  ['#6CC58A', '#2E8A48', '#0F3019'],
  ['#F2A0C4', '#C2477F', '#3D0F25'],
  ['#7FD6D0', '#2A9D96', '#0C3331'],
]
const RED_PALETTE = ['#E5677A', '#8E1426', '#1A0509']

function hash(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) >>> 0
  return h
}

export function deckArt(deck: { id: string; name: string; rating: DeckRating }): { glyph: string; background: string } {
  const [light, mid, dark] = deck.rating === 'red' ? RED_PALETTE : PALETTES[hash(deck.id) % PALETTES.length]
  const cjk = deck.name.match(/[぀-ヿ㐀-鿿]/u)
  const glyph = cjk ? cjk[0] : (deck.name.trim()[0] ?? '?').toUpperCase()
  return {
    glyph,
    background: `var(--speed-lines), radial-gradient(circle at 50% 60%, ${light}, ${mid} 45%, ${dark})`,
  }
}

// ---------- Icons (stroke, currentColor) ----------

const PATHS: Record<string, ReactNode> = {
  back: <path d="M15 6l-6 6 6 6" />,
  close: (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h10" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h4" />
      <path d="M12 12h8" />
      <circle cx="10" cy="12" r="2" />
      <path d="M4 18h12" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  speaker: (
    <>
      <path d="M11 5L6 9H2v6h4l5 4V5z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M19 5a10 10 0 0 1 0 14" />
    </>
  ),
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  decks: (
    <>
      <rect x="3" y="6" width="12" height="16" rx="2" />
      <path d="M8 3.5l1-.5 11 3a2 2 0 0 1 1.4 2.4L18 20" />
    </>
  ),
  pack: <path d="M5 5l2-2 2 2 2-2 2 2 2-2 2 2 2-2v18l-2 2-2-2-2 2-2-2-2 2-2-2-2 2z" />,
  forge: (
    <>
      <path d="M14 4l6 6-9 9H5v-6z" />
      <path d="M12 6l6 6" />
    </>
  ),
  check: <path d="M5 12l5 5L20 7" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  )
}

export function Sparkle({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z" fill={color} />
    </svg>
  )
}
