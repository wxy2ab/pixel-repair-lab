import type { CoursePrerequisite, Issue, Level } from './types'

export const challengeZoneId = 'challenge-zone'

export function matchesCoursePrerequisite(level: Level, { unit, topic }: CoursePrerequisite) {
  return unit !== challengeZoneId && level.unit?.id === unit && level.stage !== 'challenge'
    && (topic === undefined || level.topic?.id === topic)
}

export function prerequisiteIssues(level: Level, catalog: Level[]): Issue[] {
  return (level.prerequisites ?? []).flatMap((prerequisite, index) => {
    if (catalog.some(candidate => matchesCoursePrerequisite(candidate, prerequisite))) return []
    const { unit, topic } = prerequisite
    const target = topic ? unit + '/' + topic : unit
    return [{
      code: 'course-prerequisite',
      path: '/prerequisites/' + index,
      message: 'No course or topic matches "' + target + '".',
    }]
  })
}
