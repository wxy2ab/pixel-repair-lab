export type CodeEdit = { value: string; selectionStart: number; selectionEnd: number }

const indentUnit = '    '

function lineStart(text: string, position: number) {
  return text.lastIndexOf('\n', position - 1) + 1
}

function lineEnd(text: string, position: number) {
  const end = text.indexOf('\n', position)
  return end < 0 ? text.length : end
}

/** Insert spaces up to the next four-column stop, or shift every selected line one level. */
export function indentSelection(text: string, start: number, end: number): CodeEdit {
  if (start === end || !text.slice(start, end).includes('\n')) {
    const column = start - lineStart(text, start)
    const spaces = ' '.repeat(indentUnit.length - column % indentUnit.length)
    const value = text.slice(0, start) + spaces + text.slice(end)
    return { value, selectionStart: start + spaces.length, selectionEnd: start + spaces.length }
  }
  const from = lineStart(text, start)
  const to = lineEnd(text, end > start && text[end - 1] === '\n' ? end - 1 : end)
  const lines = text.slice(from, to).split('\n')
  const shifted = lines.map(line => line.trim() ? indentUnit + line : line)
  const value = text.slice(0, from) + shifted.join('\n') + text.slice(to)
  const first = lines[0].trim() ? indentUnit.length : 0
  return { value, selectionStart: start + first, selectionEnd: end + value.length - text.length }
}

/** Remove up to one level of leading spaces from every line the selection touches. */
export function outdentSelection(text: string, start: number, end: number): CodeEdit {
  const from = lineStart(text, start)
  const to = lineEnd(text, end > start && text[end - 1] === '\n' ? end - 1 : end)
  const lines = text.slice(from, to).split('\n')
  const removed = lines.map(line => Math.min(indentUnit.length, line.length - line.trimStart().length, /^ */.exec(line)![0].length))
  const value = text.slice(0, from) + lines.map((line, index) => line.slice(removed[index])).join('\n') + text.slice(to)
  const firstShift = Math.min(removed[0], start - from)
  return {
    value,
    selectionStart: start - firstShift,
    selectionEnd: Math.max(start - firstShift, end - (text.length - value.length)),
  }
}

/** Continue the current indentation on a new line, one level deeper after a Python block opener. */
export function newlineWithIndent(text: string, start: number, end: number, python = true): CodeEdit {
  const before = text.slice(lineStart(text, start), start)
  const current = /^ */.exec(before)![0]
  const opensBlock = python && /:\s*(#.*)?$/.test(before)
  const insert = '\n' + current + (opensBlock ? indentUnit : '')
  const value = text.slice(0, start) + insert + text.slice(end)
  return { value, selectionStart: start + insert.length, selectionEnd: start + insert.length }
}

/** Backspace inside leading spaces steps back to the previous four-column stop. */
export function backspaceIndent(text: string, start: number, end: number): CodeEdit | undefined {
  if (start !== end) return
  const from = lineStart(text, start)
  const before = text.slice(from, start)
  if (!before || before.trim()) return
  const remove = before.length % indentUnit.length || indentUnit.length
  if (remove < 2) return
  return { value: text.slice(0, start - remove) + text.slice(start), selectionStart: start - remove, selectionEnd: start - remove }
}
