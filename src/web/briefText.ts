const openers = '(（[［「『“'
const closers = ')）]］」』”'

/**
 * Split a mission brief into its sentences so a long rule list can be read one rule per line.
 * Punctuation inside brackets or quotes stays with its sentence, and so do decimals such as 1.8.
 */
export function briefSentences(text: string): string[] {
  const sentences: string[] = []
  let depth = 0
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]
    if (openers.includes(char)) depth++
    else if (closers.includes(char)) depth = Math.max(0, depth - 1)
    if (depth > 0) continue
    const next = text[index + 1]
    const ends = '。！？'.includes(char)
      || ('.!?'.includes(char) && (next === undefined || next === ' ') && !/\b(?:e\.g|i\.e|vs|etc)$/i.test(text.slice(start, index)))
    if (!ends) continue
    // Keep a closing quote or bracket that directly follows the full stop.
    let end = index + 1
    while (end < text.length && closers.includes(text[end])) end++
    const sentence = text.slice(start, end).trim()
    if (sentence) sentences.push(sentence)
    start = end
    index = end - 1
  }
  const rest = text.slice(start).trim()
  if (rest) sentences.push(rest)
  return sentences
}

export type BriefPart = { text: string; code?: boolean }

const codePattern = /[A-Za-z_][A-Za-z0-9_.]*\([^()\s]{0,24}\)|\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b|\[[^\[\]\n]{0,40}\](?=[^\[\]]|$)/g

/**
 * Mark function calls, snake_case names and short list literals so they read as code.
 * `names` adds the identifiers a level defines itself, such as its function parameters.
 */
export function briefParts(text: string, names: readonly string[] = []): BriefPart[] {
  const known = names.filter(name => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
  const pattern = known.length
    ? new RegExp(codePattern.source + '|(?<![A-Za-z0-9_])(?:' + known.join('|') + ')(?![A-Za-z0-9_])', 'g')
    : codePattern
  const parts: BriefPart[] = []
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const token = match[0]
    // A bracketed aside in prose is not code. Lists in briefs always carry a comma or an index.
    if (token.startsWith('[') && !/[,，0-9]|^\[\]$/.test(token)) continue
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    parts.push({ text: token, code: true })
    last = match.index + token.length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** The function name and parameters a starter program declares, in order. */
export function declaredNames(source: string): string[] {
  const names: string[] = []
  for (const match of source.matchAll(/^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm)) {
    names.push(match[1], ...match[2].split(',').map(parameter => parameter.split(/[=:]/)[0].trim()).filter(Boolean))
  }
  return [...new Set(names)]
}
