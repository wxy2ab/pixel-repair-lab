import type { Json } from './types'

export type BatteryDispatchConfig = {
  trialCase: number
  predictions: { caseIndex: number; orders: string[][]; records: Record<string, number>[] }[]
}

export type DispatchAction = 'stage' | 'retrieve'

export type DispatchCase = {
  arrivals: string[]
  records: Record<string, number>
  increment: number
  actions: DispatchAction[]
}

export type DispatchResult = { order: string[]; records: Record<string, number> }

export function isDispatchName(value: Json | undefined): value is string {
  return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,15}$/u.test(value)
}

export function isDispatchCharge(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 20000
}

export function readDispatchNames(value: Json | undefined): string[] | undefined {
  if (Array.isArray(value) && value.every(isDispatchName)) return value
}

export function readDispatchRecords(value: Json | undefined): Record<string, number> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value).every(([name, charge]) => isDispatchName(name) && isDispatchCharge(charge))) {
    return value as Record<string, number>
  }
}

export function readDispatchCase(sample?: { args: Json[] }): DispatchCase | undefined {
  if (sample?.args.length !== 4) return undefined
  const [names, initialRecords, increment, actions] = sample.args
  const arrivals = readDispatchNames(names)
  const records = readDispatchRecords(initialRecords)
  if (arrivals && records && isDispatchCharge(increment) && increment > 0 && increment <= 1000
    && Array.isArray(actions) && actions.every(action => action === 'stage' || action === 'retrieve')) {
    return { arrivals, records, increment, actions }
  }
}

export function readDispatchResult(value: Json | undefined): DispatchResult | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined
  const order = readDispatchNames(value[0])
  const records = readDispatchRecords(value[1])
  if (order && records) return { order, records }
}

export function dispatchOrdersMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index])
}
