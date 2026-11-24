import { challengeZoneId } from '../shared/coursePrerequisites'
import type { ChallengeDifficulty, Level, Localized } from '../shared/types'
import { isOptionalChallenge } from './lessonTools'
import type { LearningGroup } from './roadmapModel'

export const challengeTypes = ['grid', 'warehouse', 'arena', 'algorithm', 'systems', 'data', 'vision', 'ai', 'other'] as const
export type ChallengeType = typeof challengeTypes[number]
export const challengeDifficulties = ['starter', 'intermediate', 'advanced'] as const satisfies readonly ChallengeDifficulty[]

export const challengeTypeLabels: Record<ChallengeType, Localized> = {
  grid: { zh: '网格解谜', en: 'Grid puzzles' },
  warehouse: { zh: '推箱子', en: 'Sokoban' },
  arena: { zh: '机器人对抗', en: 'Robot battles' },
  algorithm: { zh: '算法编程', en: 'Python algorithms' },
  systems: { zh: '计算机系统', en: 'Computer systems' },
  data: { zh: '数据分析', en: 'Data analysis' },
  vision: { zh: '计算机视觉', en: 'Computer vision' },
  ai: { zh: 'AI 协作', en: 'AI collaboration' },
  other: { zh: '其他挑战', en: 'Other challenges' },
}

export const challengeDifficultyLabels: Record<ChallengeDifficulty, Localized> = {
  starter: { zh: '入门', en: 'Starter' },
  intermediate: { zh: '进阶', en: 'Intermediate' },
  advanced: { zh: '高难', en: 'Advanced' },
}

type CourseFilter = { unitId: string; topicId?: string }
type LessonProgress = {
  totalLessons: number
  completedLessons: number
  missingLessons: Level[]
}
export type ChallengePrerequisite = CourseFilter & LessonProgress & {
  label?: Localized
  lessonId?: string
  complete: boolean
}
export type ChallengePreparation = LessonProgress & {
  prerequisites: ChallengePrerequisite[]
  requiredLessons: Level[]
}
type CourseFilterOption = { unitId: string; label: Localized; topics: { topicId: string; label: Localized }[] }
export type ChallengeFilters = { type?: ChallengeType; difficulty?: ChallengeDifficulty; course?: CourseFilter }
export type ChallengeEntry = {
  level: Level
  type: ChallengeType
  difficulty: ChallengeDifficulty
  won: boolean
  ready: boolean
  preparation: ChallengePreparation
}

export function challengeType(level: Level): ChallengeType {
  switch (level.kind) {
    case 'grid': return level.warehouse ? 'warehouse' : 'grid'
    case 'arena':
    case 'algorithm':
    case 'data':
    case 'vision':
    case 'ai': return level.kind
    case 'circuit':
    case 'arduino':
    case 'breadboard':
    case 'machine': return 'systems'
    case 'lab': return level.recipe === 'opencv' || level.recipe === 'yolox' ? 'vision' : 'data'
    default: return 'other'
  }
}

function lessonProgress(lessons: Level[], completed: ReadonlySet<string>): LessonProgress {
  const missingLessons = lessons.filter(lesson => !completed.has(lesson.id))
  return { totalLessons: lessons.length, completedLessons: lessons.length - missingLessons.length, missingLessons }
}

export function buildChallengePreparation(level: Level, courseGroups: LearningGroup[], completed: ReadonlySet<string>): ChallengePreparation {
  const required = new Map<string, Level>()
  const prerequisites = (level.prerequisites ?? []).map(({ unit: unitId, topic: topicId }): ChallengePrerequisite => {
    const group = courseGroups.find(({ unit }) => unit.id !== challengeZoneId && unit.id === unitId)
    const lessons = group?.levels.filter(lesson => !isOptionalChallenge(lesson) && (topicId === undefined || lesson.topic?.id === topicId)) ?? []
    const progress = lessonProgress(lessons, completed)
    const lesson = lessons[0]
    if (!group || !lesson) return { unitId, topicId, complete: false, ...progress }

    for (const requiredLesson of lessons) required.set(requiredLesson.id, requiredLesson)
    const moduleName = group.unit.title
    const topicName = topicId ? lesson.topic?.title : undefined
    const label = topicName ? { zh: moduleName.zh + ' · ' + topicName.zh, en: moduleName.en + ' · ' + topicName.en } : moduleName
    return { unitId, topicId, label, lessonId: lesson.id, complete: progress.missingLessons.length === 0, ...progress }
  })
  const requiredLessons = [...required.values()]
  return { prerequisites, requiredLessons, ...lessonProgress(requiredLessons, completed) }
}

function courseFilterOptions(groups: LearningGroup[], entries: ChallengeEntry[]): CourseFilterOption[] {
  const usedTopics = new Map<string, Set<string>>()
  for (const entry of entries) {
    for (const { unitId, topicId, lessonId } of entry.preparation.prerequisites) {
      if (!lessonId) continue
      const topics = usedTopics.get(unitId) ?? new Set<string>()
      if (topicId) topics.add(topicId)
      usedTopics.set(unitId, topics)
    }
  }

  return groups.flatMap(({ unit, levels }) => {
    const referenced = usedTopics.get(unit.id)
    if (!referenced) return []
    const topics = new Map(levels.flatMap(({ topic }) => topic && referenced.has(topic.id) ? [[topic.id, topic] as const] : []))
    return [{ unitId: unit.id, label: unit.title, topics: [...topics.values()].sort((a, b) => a.order - b.order)
      .map(topic => ({ topicId: topic.id, label: topic.title })) }]
  })
}

export function compareDifficulty(left: ChallengeEntry, right: ChallengeEntry) {
  return challengeDifficulties.indexOf(left.difficulty) - challengeDifficulties.indexOf(right.difficulty)
    || left.level.order - right.level.order || left.level.id.localeCompare(right.level.id, 'en')
}

export function buildChallengeCatalog(levels: Level[], courseGroups: LearningGroup[], completed: string[]) {
  const passed = new Set(completed)
  const entries: ChallengeEntry[] = levels.map(level => {
    const preparation = buildChallengePreparation(level, courseGroups, passed)
    return {
      level, type: challengeType(level), difficulty: level.difficulty ?? 'intermediate', won: passed.has(level.id), preparation,
      ready: preparation.prerequisites.length > 0 && preparation.prerequisites.every(prerequisite => prerequisite.complete),
    }
  })
  entries.sort((left, right) => challengeTypes.indexOf(left.type) - challengeTypes.indexOf(right.type) || compareDifficulty(left, right))
  const recommendations = entries.filter(entry => entry.ready && !entry.won).sort(compareDifficulty).slice(0, 3)
  const nearest = entries.filter(({ won, preparation }) => !won && preparation.missingLessons.length > 0
    && preparation.prerequisites.every(prerequisite => prerequisite.lessonId))
    .sort((left, right) => left.preparation.missingLessons.length - right.preparation.missingLessons.length
      || compareDifficulty(left, right))[0]
  return { entries, recommendations, nearest, courses: courseFilterOptions(courseGroups, entries) }
}

export function filterChallenges(entries: ChallengeEntry[], { type, difficulty, course }: ChallengeFilters) {
  return entries.filter(entry => (!type || type === entry.type) && (!difficulty || difficulty === entry.difficulty)
    && (!course || entry.preparation.prerequisites.some(({ unitId, topicId }) => unitId === course.unitId
      && (course.topicId === undefined || topicId === course.topicId))))
}

export function nextChallenge(entries: ChallengeEntry[], currentId: string): ChallengeEntry | undefined {
  const current = entries.find(entry => entry.level.id === currentId)
  if (!current) return
  const tier = challengeDifficulties.indexOf(current.difficulty)
  const candidates = entries.filter(entry => entry.level.id !== currentId && !entry.won)
  const gap = (entry: ChallengeEntry) => entry.preparation.prerequisites.length
    && entry.preparation.prerequisites.every(course => course.lessonId) ? entry.preparation.missingLessons.length : Number.MAX_SAFE_INTEGER
  const distance = (entry: ChallengeEntry) => Math.abs(challengeDifficulties.indexOf(entry.difficulty) - tier)
  return candidates.sort((left, right) => Number(right.ready) - Number(left.ready)
    || gap(left) - gap(right)
    || Number(right.type === current.type) - Number(left.type === current.type)
    || distance(left) - distance(right)
    || Number(challengeDifficulties.indexOf(left.difficulty) < tier) - Number(challengeDifficulties.indexOf(right.difficulty) < tier)
    || compareDifficulty(left, right))[0]
}
