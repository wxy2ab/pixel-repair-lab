export type Primitive = null | boolean | number | string
export type JsonValue = Primitive | JsonValue[] | { [key: string]: JsonValue }
export type OriginKind = 'list-index' | 'stack-pop' | 'queue-pop' | 'dict-index' | 'memory-load'

export interface Origin {
  readonly kind: OriginKind
  readonly container: number
}

export interface Value {
  readonly data: Primitive | Value[] | Map<Primitive, Value>
  readonly origins: readonly Origin[]
  readonly container?: number
  readonly range?: true
}

export const MAX_COLLECTION = 128
export const MAX_STRING = 600

export function bare(data: Primitive): Value {
  return { data, origins: [] }
}

export function addOrigin(value: Value, origin: Origin): Value {
  if (value.origins.some(({ kind, container }) => kind === origin.kind && container === origin.container)) return value
  return { ...value, origins: [...value.origins, origin] }
}

export function derived(data: Primitive, from: readonly Value[]): Value {
  const origins = new Map<string, Origin>()
  for (const value of from) {
    for (const origin of value.origins) {
      if (origin.kind === 'memory-load' || data === value.data) origins.set(`${origin.kind}:${origin.container}`, origin)
    }
  }
  return { data, origins: [...origins.values()] }
}

export function valuesEqual(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length && left.every((item, index) => valuesEqual(item, right[index]))
  }
  if (Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length && keys.every((key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key]))
}

export class Values {
  private nextContainer = 1

  list(data: Value[] = []): Value {
    return { data, container: this.nextContainer++, origins: [] }
  }

  dictionary(data = new Map<Primitive, Value>()): Value {
    return { data, container: this.nextContainer++, origins: [] }
  }

  range(data: Value[]): Value {
    return { data, range: true, origins: [] }
  }

  fromJson(input: JsonValue): Value {
    let remaining = 1_024
    const convert = (current: JsonValue, depth: number): Value => {
      if (remaining-- <= 0 || depth > 32) throw new RangeError('collection size')
      if (Array.isArray(current)) {
        if (current.length > MAX_COLLECTION) throw new RangeError('list size')
        return this.list(current.map((child) => convert(child, depth + 1)))
      }
      if (current !== null && typeof current === 'object') {
        const pairs = Object.entries(current)
        if (pairs.length > MAX_COLLECTION) throw new RangeError('dictionary size')
        const entries = pairs.map(([key, value]) => [key, convert(value, depth + 1)] as const)
        return this.dictionary(new Map(entries))
      }
      if (typeof current === 'string' && current.length > MAX_STRING) throw new RangeError('string size')
      return bare(current)
    }
    return convert(input, 0)
  }
}

export function plain(value: Value): JsonValue {
  let remaining = 1_024
  function serialize(current: Value, depth: number): JsonValue {
    if (remaining-- <= 0 || depth > 32) throw new RangeError('collection size')
    if (Array.isArray(current.data)) return current.data.map((child) => serialize(child, depth + 1))
    if (current.data instanceof Map) {
      return Object.fromEntries([...current.data].map(([key, child]) => [String(key), serialize(child, depth + 1)]))
    }
    return current.data
  }
  return serialize(value, 0)
}

export function collectionContains(container: Value, item: Value, seen = new Set<Value['data']>()): boolean {
  if (!item.container || seen.has(item.data)) return false
  if (container.data === item.data) return true
  seen.add(item.data)
  const children = Array.isArray(item.data) ? item.data : item.data instanceof Map ? item.data.values() : []
  for (const child of children) {
    if (collectionContains(container, child, seen)) return true
  }
  return false
}

export function display(value: Value): string {
  if (typeof value.data === 'string') return value.data
  if (value.data === true) return 'True'
  if (value.data === false) return 'False'
  if (value.data === null) return 'None'
  return JSON.stringify(plain(value))
}
