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
