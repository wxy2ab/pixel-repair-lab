import type { Json } from './types'

export const batteryPipelineHelpers = ['sort_ascending', 'sorted_has_pair', 'prefix_totals'] as const
export type BatteryPipelineHelper = typeof batteryPipelineHelpers[number]

export type BatteryPipelineConfig = {
  trialCase: number
  prediction: { caseIndex: number; orders: number[][]; pairs: number[][]; totals: number[] }
}

export type BatteryPipelineCase = { values: number[]; target: number; left: number; right: number }
export type BatteryPipelineResult = { ordered: number[]; pair: number[]; total: number }

export function isBatteryTotal(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function readBatteryTotals(value: Json | undefined): number[] | undefined {
  if (Array.isArray(value) && value.every(isBatteryTotal)) return value
}

export function readBatteryPipelineCase(sample?: { args: Json[] }): BatteryPipelineCase | undefined {
  if (sample?.args.length !== 4) return undefined
  const [row, target, left, right] = sample.args
  const values = readBatteryTotals(row)
  if (values && values.length >= 1 && values.length <= 8 && values.every(charge => charge <= 20_000)
    && isBatteryTotal(target) && target <= 40_000 && isBatteryTotal(left) && isBatteryTotal(right)
    && left <= right && right < values.length) {
    return { values, target, left, right }
  }
}

export function readBatteryPair(value: Json | undefined): number[] | undefined {
  const pair = readBatteryTotals(value)
  if (pair && (pair.length === 0 || pair.length === 2)) return pair
}

export function readBatteryPipelineResult(value: Json | undefined): BatteryPipelineResult | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined
  const ordered = readBatteryTotals(value[0])
  const pair = readBatteryPair(value[1])
  const total = value[2]
  if (ordered && pair && isBatteryTotal(total)) return { ordered, pair, total }
}
