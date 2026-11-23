import type { Unit } from '../shared/advanced'
import type { Level, Localized } from '../shared/types'
import { courseFor } from './LearningCourse'
import { isCourseFinal, levelStage } from './lessonTools'

type LessonRecord = { mistakes: number; lastMistakeAt?: number; passedAt?: number; pending: boolean }
export type LearningLog = Record<string, LessonRecord>
export type RecordTab = 'history' | 'mistakes'
export type ReviewMaterial = { title: Localized; animation?: Level; demo?: Level }
export type MistakeItem = { level: Level; count: number; lastAt: number; pending: boolean }
export type ReviewGroup = { id: string; title: Localized; unit?: Unit; materials: ReviewMaterial[]; items: MistakeItem[] }
export type ReviewRecommendation = { group: ReviewGroup; item: MistakeItem }
export type LearningActivity = { level: Level; at?: number; mistakes: number; result: 'completed' | 'needs-review' | 'corrected' }
export type ReviewRecord = { activities: LearningActivity[]; groups: ReviewGroup[]; recommendations: ReviewRecommendation[]; pendingCount: number }

export const learningRecordKey = 'pixel-repair-lab:learning-record'

function date(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 8.64e15 ? value : undefined
}

export function readLearningLog(raw: string | null): LearningLog {
  if (!raw) return {}
  try {
    const rows: unknown = JSON.parse(raw)
    if (!rows || typeof rows !== 'object' || Array.isArray(rows)) return {}
    const entries: [string, LessonRecord][] = []
    for (const [id, value] of Object.entries(rows)) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) || !value || typeof value !== 'object' || Array.isArray(value)) continue
      const lastMistakeAt = date(value.lastMistakeAt)
      const passedAt = date(value.passedAt)
      const mistakes = lastMistakeAt !== undefined && typeof value.mistakes === 'number' && Number.isSafeInteger(value.mistakes) && value.mistakes > 0 ? value.mistakes : 0
      if (passedAt === undefined && !mistakes) continue
      entries.push([id, { mistakes, lastMistakeAt: mistakes ? lastMistakeAt : undefined, passedAt,
        pending: mistakes > 0 && (passedAt === undefined || value.pending !== false) }])
    }
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

export function recordLesson(log: LearningLog, id: string, outcome: 'passed' | 'mistake', at: number): LearningLog {
  const previous = Object.hasOwn(log, id) ? log[id] : { mistakes: 0, pending: false }
  const entry = outcome === 'passed' ? { ...previous, passedAt: at, pending: false }
    : { ...previous, mistakes: Math.min(previous.mistakes + 1, Number.MAX_SAFE_INTEGER), lastMistakeAt: at, pending: true }
  return { ...log, [id]: entry }
}

export function isGradedPractice(level: Level): boolean {
  const stage = levelStage(level)
  return (stage === 'exercise' || stage === 'challenge') && level.kind !== 'lecture' && level.kind !== 'replay'
}

export function reviewMaterialsFor(source: Level, catalog: Level[]): ReviewMaterial[] {
  const scope = isCourseFinal(source) ? courseFor(source)?.units : undefined
  const grouped = new Map<string, { title: Localized; animation?: Level; demo?: Level; order: number; unitOrder: number }>()
  for (const level of catalog) {
    if (scope ? !scope.includes(level.unit?.id ?? '') : level.unit?.id !== source.unit?.id) continue
    if (source.topic && level.topic?.id !== source.topic.id) continue
    const animation = level.kind === 'lecture' && (level.animation || level.execution) ? level : undefined
    const demo = levelStage(level) === 'demo' ? level : undefined
    if (!animation && !demo) continue

    const key = `${level.unit?.id ?? ''}:${level.topic?.id ?? ''}`
    const material = grouped.get(key) ?? {
      title: level.topic?.title ?? level.unit?.title ?? level.title, order: level.topic?.order ?? level.order, unitOrder: level.unit?.order ?? 0,
    }
    material.animation ??= animation
    material.demo ??= demo
    grouped.set(key, material)
  }
  return [...grouped.values()].sort((a, b) => a.unitOrder - b.unitOrder || a.order - b.order)
}

export function buildLearningRecord(catalog: Level[], completed: string[], log: LearningLog): ReviewRecord {
  const completedOrder = new Map(completed.map((id, index) => [id, index]))
  const byTopic = new Map<string, ReviewGroup>()
  const activities: LearningActivity[] = []

  for (const level of catalog) {
    const record = Object.hasOwn(log, level.id) ? log[level.id] : undefined
    if (record || completedOrder.has(level.id)) {
      activities.push({ level, mistakes: record?.mistakes ?? 0, at: record?.pending ? record.lastMistakeAt : record?.passedAt,
        result: record?.pending ? 'needs-review' : record?.mistakes ? 'corrected' : 'completed' })
    }
    if (!record?.mistakes || record.lastMistakeAt === undefined || !isGradedPractice(level)) continue

    const category = level.topic ? 'topic:' + level.topic.id : isCourseFinal(level) ? 'final-project' : 'combined'
    const id = `${level.unit?.id ?? 'other'}:${category}`
    const group = byTopic.get(id) ?? {
      id, unit: level.unit,
      title: level.topic?.title ?? (isCourseFinal(level) ? { zh: '结课项目', en: 'Final project' }
        : { zh: '综合练习', en: 'Mixed practice' }),
      materials: reviewMaterialsFor(level, catalog), items: [],
    }
    group.items.push({ level, count: record.mistakes, lastAt: record.lastMistakeAt, pending: record.pending })
    byTopic.set(id, group)
  }

  activities.sort((a, b) => (b.at ?? -1) - (a.at ?? -1)
    || (completedOrder.get(b.level.id) ?? -1) - (completedOrder.get(a.level.id) ?? -1))
  const groups = [...byTopic.values()]
  for (const group of groups) group.items.sort((a, b) => Number(b.pending) - Number(a.pending) || b.lastAt - a.lastAt)
  groups.sort((a, b) => Number(b.items[0].pending) - Number(a.items[0].pending) || b.items[0].lastAt - a.items[0].lastAt)
  const recommendations = groups.slice(0, 3).flatMap(group => group.items[0].pending ? [{ group, item: group.items[0] }] : [])
  const pendingCount = groups.reduce((count, group) => count + group.items.filter(item => item.pending).length, 0)
  return { activities, groups, recommendations, pendingCount }
}
