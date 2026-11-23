import type { LabRecipe } from '../shared/advanced'

export const zones = ['all', 'hangar', 'workshop', 'storage'] as const
type Zone = typeof zones[number]
export const groupings = ['zone', 'item'] as const
type Grouping = typeof groupings[number]

export type DemoRequest =
  | { recipe: 'numpy'; parameters: { minimumCharge: number } }
  | { recipe: 'pandas'; parameters: { groupBy: Grouping } }
  | { recipe: 'analysis'; parameters: { days: number } }
  | { recipe: 'sql'; parameters: { minimum: number; zone: Zone } }
  | { recipe: 'opencv'; parameters: { threshold: number } }
  | { recipe: 'yolox'; parameters: { confidence: number } }

export type DemoStatus = { available: boolean; recipes: Record<LabRecipe, boolean> }

type Row = (string | number)[]
export type TableResult = { engine: string; rows: Row[]; input: Row[] } & (
  | { recipe: 'numpy'; code: string }
  | { recipe: 'pandas'; code: string; groupBy: Grouping }
  | { recipe: 'analysis'; code: string; summary: { median: number; spread: number } }
  | { recipe: 'sql'; query: string; duckRows: Row[]; comparisonMatches: boolean }
)
export type VisionResult = {
  engine: string; recipe: 'opencv'; source: string; image: string; regions: number; pixels: number; code: string
}
export type DetectionResult = {
  engine: string; recipe: 'yolox'; image: string; width: number; height: number; code: string
  detections: { label: string; score: number; box: [number, number, number, number] }[]
}
export type DemoResult = TableResult | VisionResult | DetectionResult

export function defaultRequest(recipe: LabRecipe): DemoRequest {
  switch (recipe) {
    case 'numpy': return { recipe, parameters: { minimumCharge: 60 } }
    case 'pandas': return { recipe, parameters: { groupBy: 'zone' } }
    case 'analysis': return { recipe, parameters: { days: 3 } }
    case 'sql': return { recipe, parameters: { minimum: 4, zone: 'all' } }
    case 'opencv': return { recipe, parameters: { threshold: 115 } }
    case 'yolox': return { recipe, parameters: { confidence: 50 } }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}

function isZone(value: unknown): value is Zone {
  return zones.some((zone) => zone === value)
}

export function parseDemoRequest(value: unknown): DemoRequest | null {
  if (!isRecord(value) || Object.keys(value).length !== 2 || !isRecord(value.parameters)) return null
  const { recipe, parameters } = value
  const count = Object.keys(parameters).length
  if (recipe === 'sql' && count === 2 && isInteger(parameters.minimum, 0, 10) && isZone(parameters.zone)) {
    return { recipe, parameters: { minimum: parameters.minimum, zone: parameters.zone } }
  }
  if (count !== 1) return null
  if (recipe === 'numpy' && isInteger(parameters.minimumCharge, 0, 100)) return { recipe, parameters: { minimumCharge: parameters.minimumCharge } }
  if (recipe === 'pandas' && (parameters.groupBy === 'zone' || parameters.groupBy === 'item')) return { recipe, parameters: { groupBy: parameters.groupBy } }
  if (recipe === 'analysis' && isInteger(parameters.days, 1, 5)) return { recipe, parameters: { days: parameters.days } }
  if (recipe === 'opencv' && isInteger(parameters.threshold, 40, 240)) return { recipe, parameters: { threshold: parameters.threshold } }
  if (recipe === 'yolox' && isInteger(parameters.confidence, 10, 95)) return { recipe, parameters: { confidence: parameters.confidence } }
  return null
}

export function observedLabCount(result: DemoResult): number | null {
  switch (result.recipe) {
    case 'numpy': case 'pandas': return result.rows.length
    case 'sql': return result.comparisonMatches ? result.rows.length : null
    case 'analysis': return result.rows.reduce((count, row) => count + Number(row[2]), 0)
    case 'opencv': return result.regions
    case 'yolox': return result.detections.length
  }
}
