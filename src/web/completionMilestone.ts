import { challengeZoneId } from '../shared/coursePrerequisites'
import { shortSeries } from '../shared/shortChallenges'
import type { Level, Localized } from '../shared/types'
import { courseFor } from './LearningCourse'
import { isOptionalChallenge } from './lessonTools'

export type CompletionMilestone = {
  levelId: string
  levelTitle: Localized
  tier: 'level' | 'stage'
  scope: 'lesson' | 'optional' | 'topic' | 'unit' | 'course' | 'series'
  title: Localized
  progress?: { done: number; total: number; label: Localized }
}

/** Only the largest group closed by this particular win gets a celebration. */
export function completionMilestone(level: Level, catalog: readonly Level[], before: readonly string[]): CompletionMilestone | undefined {
  if (before.includes(level.id)) return
  const base = { levelId: level.id, levelTitle: level.title }
  const completed = new Set([...before, level.id])
  const count = (members: Level[], label: Localized) => ({
    done: members.filter(member => completed.has(member.id)).length, total: members.length, label,
  })

  if (level.unit?.id === challengeZoneId) {
    const series = shortSeries(level)
    if (!series) return
    const members = catalog.filter(member => member.unit?.id === challengeZoneId && shortSeries(member) === series)
    const title = series === 'ferry' ? { zh: '渡口短挑战', en: 'Ferry challenges' } : { zh: '激光短挑战', en: 'Laser challenges' }
    const progress = count(members, title)
    if (progress.total && progress.done === progress.total) return { ...base, tier: 'stage', scope: 'series', title, progress }
    return
  }

  const lesson: CompletionMilestone = { ...base, tier: 'level', scope: 'lesson', title: level.title }
  const course = courseFor(level)
  const unit = level.unit
  if (!course || !unit) return lesson
  if (isOptionalChallenge(level)) return { ...lesson, scope: 'optional' }

  const required = catalog.filter(member => member.unit && course.units.includes(member.unit.id) && !isOptionalChallenge(member))
  const withinUnit = required.filter(member => member.unit?.id === unit.id)
  const groups: { scope: 'course' | 'unit' | 'topic'; title: Localized; members: Level[] }[] = [
    { scope: 'course', title: course.name, members: required },
    { scope: 'unit', title: unit.title, members: withinUnit },
  ]
  if (level.topic) groups.push({
    scope: 'topic', title: level.topic.title, members: withinUnit.filter(member => member.topic?.id === level.topic?.id),
  })
  for (const group of groups) {
    const progress = count(group.members, group.title)
    if (!progress.total) continue
    if (progress.done === progress.total) return { ...base, tier: 'stage', scope: group.scope, title: group.title, progress }
    lesson.progress = progress
  }
  return lesson
}
