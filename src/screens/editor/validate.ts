import { CardState, type Srs } from '../../core/scheduler'

/** Spanish message for a malformed [marker], or undefined when the brackets are fine. */
export function bracketError(question: string): string | undefined {
  let open = -1
  for (let i = 0; i < question.length; i++) {
    const ch = question[i]
    if (ch === '[') {
      if (open >= 0) return 'No pongas un corchete dentro de otro.'
      open = i
    } else if (ch === ']') {
      if (open < 0) return 'Falta el «[» que abre la palabra marcada.'
      if (i === open + 1) return 'Los corchetes están vacíos: escribe la palabra dentro.'
      open = -1
    }
  }
  return open >= 0 ? 'Cierra el corchete: falta «]».' : undefined
}

export interface CardErrors {
  question?: string
  answer?: string
}

export function validateCard({ question, answer }: { question: string; answer: string }): CardErrors {
  const errors: CardErrors = {}
  const q = question.trim()
  if (!q) errors.question = 'Escribe la pregunta.'
  else {
    const b = bracketError(q)
    if (b) errors.question = b
  }
  if (!answer.trim()) errors.answer = 'Escribe la respuesta.'
  return errors
}

const DAY = 86_400_000

export function stateLabel(srs: Srs, now: number): string {
  if (srs.state === CardState.New) return 'Nueva'
  if (srs.state !== CardState.Review) return 'Aprendiendo'
  const days = Math.ceil((srs.due - now) / DAY)
  return days <= 0 ? 'Hoy' : `${days} d`
}

export function formatBytes(bytes: number): string {
  const mb = bytes / 1_048_576
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}
