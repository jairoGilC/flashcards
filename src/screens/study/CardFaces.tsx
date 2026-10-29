import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { parseQuestion } from '../../core/question'
import type { CardRow, DeckRow } from '../../db/db'
import { HintArt, Icon, IconButton, MiniDiamond, QuestionText, TcgCard, deckArt } from '../../ui'
import { answerFont, fitFrame, ratingColor } from './helpers'

// Sizes the card to fill the stage (see .study-slot); the card itself is a container for its text's cqw sizes.
function CardSlot({ children, slotRef }: { children: ReactNode; slotRef?: RefObject<HTMLDivElement> }) {
  return (
    <div className="study-slot" ref={slotRef}>
      {children}
    </div>
  )
}

/** Smallest share of the card the image keeps when the text needs a lot of room (the text then scrolls). */
const MIN_ART_SHARE = 0.28

/** A computed CSS length in px; 0 when it isn't set (e.g. in tests without layout). */
const px = (v: string) => parseFloat(v) || 0

/**
 * Size of the image frame: the image's own proportions, as large as fits above the text. Re-measured
 * whenever the card resizes. Undefined until the image has loaded and the card has been laid out.
 */
function useImageFrame(slotRef: RefObject<HTMLDivElement>, ratio: number | undefined) {
  const [frame, setFrame] = useState<{ width: number; height: number; narrow: boolean }>()
  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot || !ratio) return
    const measure = () => {
      const card = slot.querySelector<HTMLElement>('.study-card')
      const band = card?.querySelector<HTMLElement>('.tcg-card__band')
      const body = card?.querySelector<HTMLElement>('.tcg-card__body')
      if (!card || !band || !body || !body.firstElementChild || !body.lastElementChild) return
      const cardStyle = getComputedStyle(card)
      const bodyStyle = getComputedStyle(body)
      const cardPad = px(cardStyle.paddingTop) + px(cardStyle.paddingBottom)
      // Layout offsets, not getBoundingClientRect: the back face measures while its flip-in animation (a 3D
      // transform) may still be running, and transformed boxes would read too tall.
      const first = body.firstElementChild as HTMLElement
      const last = body.lastElementChild as HTMLElement
      const textHeight =
        last.offsetTop + last.offsetHeight - first.offsetTop +
        px(bodyStyle.paddingTop) +
        px(bodyStyle.paddingBottom)
      const inner = card.clientHeight - cardPad
      const room = Math.max(inner * MIN_ART_SHARE, inner - band.offsetHeight - textHeight)
      const width = card.clientWidth - px(cardStyle.paddingLeft) - px(cardStyle.paddingRight)
      const fit = fitFrame(ratio, width, room)
      setFrame({ ...fit, narrow: fit.width < width - 1 })
    }
    measure()
    let live = true
    // Web fonts change the text's height when they swap in.
    void document.fonts?.ready.then(() => live && measure())
    if (typeof ResizeObserver === 'undefined') return () => void (live = false)
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    // The text box's first and last children size with the text, not with the art window, so this can't loop.
    // (Middle children are only re-measured through these or fonts.ready.)
    const body = slot.querySelector('.tcg-card__body')
    for (const child of [body?.firstElementChild, body?.lastElementChild]) if (child) observer.observe(child)
    return () => {
      live = false
      observer.disconnect()
    }
  }, [slotRef, ratio])
  return frame
}

function DeckBand({ label, deck }: { label: string; deck: DeckRow }) {
  return (
    <>
      <span>{label}</span>
      <span className="face-band__deck">
        <MiniDiamond color={ratingColor(deck.rating)} size={6} />
        <span lang="ja">{deck.name}</span>
      </span>
    </>
  )
}

export function FrontFace({ card, deck }: { card: CardRow; deck: DeckRow }) {
  const prompt = parseQuestion(card.question).isSentence ? '¿Cuál es la palabra subrayada?' : '¿Qué significa?'
  // No art window: the image lives on the answer side only, where it can't give the meaning away.
  return (
    <CardSlot>
      <TcgCard width="100%" className="study-card" band={<DeckBand label="Pregunta" deck={deck} />}>
        <QuestionText question={card.question} className="face-question" />
        <p className="face-prompt">{prompt}</p>
      </TcgCard>
    </CardSlot>
  )
}

function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

function speak(text: string) {
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  // Some browsers ignore `lang` unless a matching voice is picked explicitly.
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'))
  if (voice) u.voice = voice
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

export function BackFace({ card, deck }: { card: CardRow; deck: DeckRow }) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState<number>()
  // A missing or undecodable image leaves a text-only answer rather than an empty frame.
  const [failed, setFailed] = useState(false)
  const onFail = useCallback(() => setFailed(true), [])
  const hasImage = !!card.imageId && !failed
  const frame = useImageFrame(slotRef, hasImage ? ratio : undefined)
  return (
    <CardSlot slotRef={slotRef}>
      <TcgCard
        width="100%"
        glow="gold"
        className={`flip-in study-card ${hasImage ? 'study-card--image' : ''}`}
        // The art window is exactly as tall as the image frame; the text box below gets the rest.
        artHeight={frame ? frame.height : undefined}
        // Only the image goes in the art window; without one the card is text only.
        art={
          hasImage ? (
            <>
              {/* Fills the side strips of a portrait frame; not needed when the frame spans the card. */}
              {frame?.narrow && (
                <div className="answer-backdrop" aria-hidden="true">
                  <HintArt imageId={card.imageId} fallbackGlyph="" label="" fill />
                </div>
              )}
            <div
              className={`answer-frame ${frame ? 'answer-frame--sized' : ''}`}
              data-ratio={ratio?.toFixed(3)}
              style={frame ? { width: frame.width, height: frame.height } : undefined}
            >
              <HintArt imageId={card.imageId} fallbackGlyph={deckArt(deck).glyph} fill onRatio={setRatio} onFail={onFail} />
            </div>
            </>
          ) : undefined
        }
        band={<DeckBand label="Respuesta" deck={deck} />}
      >
        <div className="answer-row">
          <span className="mincho answer-word" lang="ja" data-testid="answer" style={{ fontSize: answerFont(card.answer) }}>
            {card.answer}
          </span>
          {canSpeak() && (
            <IconButton label="Escuchar pronunciación" onClick={() => speak(card.answer)}>
              <Icon name="speaker" />
            </IconButton>
          )}
        </div>
        {card.reading && (
          <span className="answer-reading" lang="ja">
            {card.reading}
          </span>
        )}
        {card.meaning && (
          <span className="answer-divider" aria-hidden="true">
            <span />
            <MiniDiamond color="var(--gold)" />
            <span />
          </span>
        )}
        {card.meaning && <span className="answer-meaning">{card.meaning}</span>}
        {(parseQuestion(card.question).isSentence || card.question.trim() !== card.answer.trim()) && (
          <QuestionText question={card.question} className="answer-sentence" />
        )}
      </TcgCard>
    </CardSlot>
  )
}
