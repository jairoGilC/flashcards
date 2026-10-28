export interface ParsedQuestion {
  pre: string
  word: string
  post: string
  /** True when the question is a sentence with a marked word, false for a bare word. */
  isSentence: boolean
}

// Lazy first match so only the first [segment] is underlined; later brackets stay literal.
const MARKED = /^(.*?)\[([^\]]+)\](.*)$/s

export function parseQuestion(raw: string): ParsedQuestion {
  const text = raw.trim()
  const m = MARKED.exec(text)
  if (!m) return { pre: '', word: text, post: '', isSentence: false }
  return { pre: m[1], word: m[2], post: m[3], isSentence: true }
}
