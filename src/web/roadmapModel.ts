import type { Unit } from '../shared/advanced'
import type { Level } from '../shared/types'
import { learningCourses, type Course } from './LearningCourse'
import { isOptionalChallenge } from './lessonTools'

export type LearningGroup = { unit: Unit; levels: Level[] }
export type RoadmapStage = { unit: Unit; done: number; total: number }
export type RoadmapTrack = { course: Course; stages: RoadmapStage[]; prerequisites: RoadmapStage[]; done: number; total: number }
export type RoadmapLesson = { course: Course; unit: Unit; level: Level }
export type Roadmap = { tracks: RoadmapTrack[]; done: number; total: number; resume?: RoadmapLesson; recommended?: RoadmapLesson }

export function modulesForCourse(course: Course, groups: LearningGroup[]) {
  return course.units.flatMap(id => groups.find(group => group.unit.id === id) ?? [])
}

export function buildRoadmap(groups: LearningGroup[], completed: string[], remembered?: string): Roadmap {
  const passed = new Set(completed)
  const stages = new Map(groups.map(({ unit, levels }) => {
    const core = levels.filter(level => !isOptionalChallenge(level))
    return [unit.id, { unit, core, total: core.length, done: core.filter(level => passed.has(level.id)).length }] as const
  }))
  const tracks: RoadmapTrack[] = []
  const lessons: RoadmapLesson[] = []

  for (const course of learningCourses) {
    const courseStages = course.units.flatMap(id => stages.get(id) ?? []).filter(stage => stage.total > 0)
    if (!courseStages.length) continue
    tracks.push({ course, stages: courseStages,
      prerequisites: course.prerequisites.flatMap(id => stages.get(id) ?? []).filter(stage => stage.total > 0),
      done: courseStages.reduce((total, stage) => total + stage.done, 0),
      total: courseStages.reduce((total, stage) => total + stage.total, 0),
    })
    for (const stage of courseStages) {
      lessons.push(...stage.core.map(level => ({ course, unit: stage.unit, level })))
    }
  }

  const pending = (entry: RoadmapLesson) => !passed.has(entry.level.id)
  const recommended = lessons.find(pending)
  const positionById = new Map(lessons.map((entry, index) => [entry.level.id, index]))
  const recentId = remembered && positionById.has(remembered) ? remembered : completed.findLast(id => positionById.has(id))
  const recentIndex = recentId === undefined ? undefined : positionById.get(recentId)
  let resume = recommended

  if (recentIndex !== undefined) {
    const { course } = lessons[recentIndex]
    const pendingInCourse = (entry: RoadmapLesson) => entry.course.id === course.id && pending(entry)
    resume = lessons.find((entry, index) => index >= recentIndex && pendingInCourse(entry)) ?? lessons.find(pendingInCourse) ?? recommended
  }

  return { tracks, done: lessons.filter(entry => !pending(entry)).length, total: lessons.length, resume, recommended }
}
