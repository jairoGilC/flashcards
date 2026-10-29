import type { ReactNode } from 'react'
import { parseQuestion } from '../../core/question'
import type { CardRow, DeckRow } from '../../db/db'
import { HintArt, Icon, IconButton, MiniDiamond, QuestionText, TcgCard, deckArt } from '../../ui'
import { answerFont, ratingColor } from './helpers'

// Sizes the card to fill the stage (see .study-slot); the card itself is a container for its text's cqw sizes.
function CardSlot({ children }: { children: ReactNode }) {
  return <div className="study-slot">{children}</div>
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
  return (
    <CardSlot>
      <TcgCard
        width="100%"
        glow="gold"
        artHeight="40%"
        className="flip-in study-card"
        // Only the image goes in the art window; without one the card is text only.
        art={card.imageId ? <HintArt imageId={card.imageId} fallbackGlyph={deckArt(deck).glyph} size="88%" /> : undefined}
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
        {(card.meaning || card.translation) && (
          <span className="answer-divider" aria-hidden="true">
            <span />
            <MiniDiamond color="var(--gold)" />
            <span />
          </span>
        )}
        {card.meaning && <span className="answer-meaning">{card.meaning}</span>}
        {parseQuestion(card.question).isSentence && <QuestionText question={card.question} className="answer-sentence" />}
        {card.translation && <span className="answer-translation">{card.translation}</span>}
      </TcgCard>
    </CardSlot>
  )
}
