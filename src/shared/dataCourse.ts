import type { LevelMetadata, Localized } from './types'

export type DataCell = string | number | null
export type DataTable = { columns: string[]; rows: DataCell[][] }
export type DataParameters = Record<string, string | number | boolean>
type DataInput = 'raw' | 'clean' | 'previous'

const zones = ['all', 'hangar', 'workshop', 'storage'] as const
const columns = ['reading', 'day'] as const
const groups = ['zone', 'day'] as const
const aggregates = ['count', 'mean', 'min', 'max', 'sum'] as const
const summaryMetrics = ['count', 'mean', 'median', 'range', 'min', 'max'] as const
const summaryOrder = ['key', 'value-asc', 'value-desc'] as const
const threshold = { min: -50, max: 100 }
const groupThreshold = { min: 0, max: 100 }

type Field = readonly string[] | { min: number; max: number } | 'boolean'
export const dataFields = {
  array: { column: columns, start: { min: 0, max: 13 }, stop: { min: 1, max: 14 } },
  mask: { column: columns, comparison: ['gte', 'lte'], threshold },
  table: { columns: ['all', 'day-zone', 'zone-reading'], zone: zones },
  clean: { trim: 'boolean', dropMissing: 'boolean', deduplicate: 'boolean' },
  summary: { statistic: summaryMetrics, zone: zones },
  group: { by: groups, statistic: aggregates },
  query: { columns: ['all', 'zone-reading', 'id-reading'], zone: zones, minimum: threshold, sort: ['id', 'reading-asc', 'reading-desc'] },
  'sql-group': { by: groups, statistic: aggregates, minimum: groupThreshold, sort: summaryOrder },
  report: { minimum: groupThreshold, sort: summaryOrder },
} satisfies Record<string, Record<string, Field>>

export type DataOperation = keyof typeof dataFields
export type DataStepRequest = { operation: DataOperation; input: DataInput; params: DataParameters }
export type DataRequest = { steps: DataStepRequest[] }
export type DataRun = {
  engine: string; code: string; input: DataTable; output: DataTable; sourceRows?: number[]
  removedRows?: ({ index: number; reason: 'invalid-reading' } | { index: number; reason: 'repeated-id'; keptRow: number })[]
}
export type DataResult = { steps: DataRun[] }
type DataStep = {
  operation: DataOperation; input: DataInput; label: Localized; prompt: Localized;
  initial: DataParameters; goal?: DataTable; solution?: DataParameters;
}
export type DataLevel = LevelMetadata & { kind: 'data'; stage: 'demo' | 'exercise' | 'challenge'; steps: DataStep[]; courseFinal?: true }

const readingColumns = ['id', 'day', 'zone', 'reading']

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validDataParameters(operation: DataOperation, value: unknown): value is DataParameters {
  if (!record(value)) return false
  const fields: [string, Field][] = Object.entries(dataFields[operation])
  return Object.keys(value).length === fields.length && fields.every(([key, field]) => {
    if (!Object.hasOwn(value, key)) return false
    const entry = value[key]
    if (field === 'boolean') return typeof entry === 'boolean'
    if ('min' in field) return typeof entry === 'number' && Number.isInteger(entry) && entry >= field.min && entry <= field.max
    return typeof entry === 'string' && field.includes(entry)
  }) && (operation !== 'array' || Number(value.start) < Number(value.stop))
}

export function projectedColumns(step: DataStepRequest, previous?: string[]): string[] | undefined {
  const input = step.input === 'previous' ? previous : readingColumns
  if (!input) return
  const { params } = step
  const by = String(params.by)
  const statistic = String(params.statistic)
  const column = String(params.column)
  switch (step.operation) {
    case 'array': return input.includes(column) ? ['index', column] : undefined
    case 'mask': return input.includes(column) ? input : undefined
    case 'table': {
      const selection = params.columns === 'all' ? readingColumns : String(params.columns).split('-')
      return selection.every(key => input.includes(key)) && (params.zone === 'all' || input.includes('zone')) ? selection : undefined
    }
    case 'clean': return readingColumns.every(key => input.includes(key)) ? readingColumns : undefined
    case 'summary': return input.includes('reading') && (params.zone === 'all' || input.includes('zone')) ? ['statistic', 'value'] : undefined
    case 'group': return input.includes(by) && input.includes('reading') ? [by, statistic] : undefined
    case 'query': return readingColumns.every(key => input.includes(key))
      ? params.columns === 'all' ? readingColumns : String(params.columns).split('-') : undefined
    case 'sql-group': return input.includes(by) && input.includes('reading') ? [by, statistic] : undefined
    case 'report': return step.input === 'previous' && input.length === 2
      && groups.some(key => key === input[0]) && aggregates.some(key => key === input[1]) ? input : undefined
  }
}

export function parseDataRequest(value: unknown): DataRequest | null {
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.steps) || !value.steps.length || value.steps.length > 4) return null
  const steps: DataStepRequest[] = []
  let columns: string[] | undefined
  for (const step of value.steps as unknown[]) {
    if (!record(step) || Object.keys(step).length !== 3 || typeof step.operation !== 'string'
      || !Object.hasOwn(dataFields, step.operation) || (step.input !== 'raw' && step.input !== 'clean' && step.input !== 'previous')) return null
    const operation = step.operation as DataOperation
    if (!validDataParameters(operation, step.params)) return null
    const parsed: DataStepRequest = { operation, input: step.input, params: step.params }
    columns = projectedColumns(parsed, columns)
    if (!columns) return null
    steps.push(parsed)
  }
  return { steps }
}

export function dataMeetsGoal(output: DataTable, goal: DataTable): boolean {
  return output.columns.length === goal.columns.length && output.columns.every((column, index) => column === goal.columns[index])
    && output.rows.length === goal.rows.length && output.rows.every((row, index) => row.length === goal.rows[index].length
      && row.every((cell, column) => cell === goal.rows[index][column]))
}
