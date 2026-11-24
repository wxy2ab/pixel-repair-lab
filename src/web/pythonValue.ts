import type { Json } from '../shared/types'

export function pythonValue(value: Json): string {
  if (value === null) return 'None'
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (Array.isArray(value)) return `[${value.map(pythonValue).join(', ')}]`
  if (typeof value === 'object') {
    return `{${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)}: ${pythonValue(entry)}`).join(', ')}}`
  }
  return JSON.stringify(value)
}

function fillLines(items: string[], width: number, indent: string) {
  const lines: string[] = []
  let line = ''
  for (const [index, item] of items.entries()) {
    const piece = item + (index < items.length - 1 ? ',' : '')
    if (line && indent.length + line.length + 1 + piece.length > width) {
      lines.push(indent + line)
      line = piece
    } else line = line ? line + ' ' + piece : piece
  }
  if (line) lines.push(indent + line)
  return lines.join('\n')
}

/**
 * A Python literal laid out for reading. Short values stay on one line. A grid gets one row per line,
 * and a long flat list wraps like a paragraph, so no value turns into one number per line.
 */
export function pythonLayout(value: Json, width = 58, indent = ''): string {
  const flat = pythonValue(value)
  if (value === null || typeof value !== 'object' || indent.length + flat.length <= width) return flat
  const inner = indent + '  '
  if (Array.isArray(value)) {
    // Rows of a map line up under each other, like the board they describe.
    const mapRows = value.length > 1 && value.every(item => typeof item === 'string' && item.length === String(value[0]).length)
    if (!mapRows && value.every(item => item === null || typeof item !== 'object')) {
      return '[\n' + fillLines(value.map(pythonValue), width, inner) + '\n' + indent + ']'
    }
    return '[\n' + value.map(item => inner + pythonLayout(item, width, inner)).join(',\n') + '\n' + indent + ']'
  }
  return '{\n' + Object.entries(value).map(([key, entry]) => inner + JSON.stringify(key) + ': ' + pythonLayout(entry, width, inner)).join(',\n')
    + '\n' + indent + '}'
}

/** Parameter names of `def name(...)` in a starter program, or nothing when it is not declared there. */
export function functionParameters(source: string, name: string): string[] {
  const match = new RegExp('^\\s*def\\s+' + name.replace(/[^A-Za-z0-9_]/g, '') + '\\s*\\(([^)]*)\\)', 'm').exec(source)
  if (!match) return []
  return match[1].split(',').map(parameter => parameter.split(/[=:]/)[0].replace(/^\*+/, '').trim()).filter(Boolean)
}
