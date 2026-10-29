import { parseQuestion } from '../../core/question'
import type { CardRow, DeckRow } from '../../db/db'
import { Filigree, HintArt, Icon, IconButton, MiniDiamond, QuestionText, TcgCard, deckArt } from '../../ui'
import { answerFont, ratingColor } from './helpers'

// Shrinks the card on short screens so the grade buttons stay above the fold.
const CARD_WIDTH = 'min(300px, 100%, calc((100dvh - 300px) * 0.714))'

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
  return (
    <Filigree>
      <TcgCard
        width={CARD_WIDTH}
        // The image lives on the answer side only: on the front it would give the meaning away.
        art={<HintArt fallbackGlyph={deckArt(deck).glyph} />}
        band={<DeckBand label="Pregunta" deck={deck} />}
      >
        <QuestionText question={card.question} className="face-question" />
        <p className="face-prompt">{prompt}</p>
      </TcgCard>
    </Filigree>
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
    <TcgCard
      width={CARD_WIDTH}
      glow="gold"
      artHeight={card.imageId ? '36%' : '27%'}
      className="flip-in face-back"
      art={
        <div className={card.imageId ? 'answer-art answer-art--image' : 'answer-art'}>
          <div className="answer-art__img">
            <HintArt imageId={card.imageId} fallbackGlyph={deckArt(deck).glyph} size="100%" />
          </div>
          <QuestionText question={card.question} className="answer-art__q" />
        </div>
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
      {(card.meaning || card.translation) && (
        <span className="answer-divider" aria-hidden="true">
          <span />
          <MiniDiamond color="var(--gold)" />
          <span />
        </span>
      )}
      {card.meaning && <span className="answer-meaning">{card.meaning}</span>}
      {card.translation && <span className="answer-translation">{card.translation}</span>}
    </TcgCard>
  )
}
