import type { Issue, LevelMetadata } from './types'

export type ButtonPosition = 'pressed' | 'released'
export type BlinkTiming = { onMs: number; offMs: number }
export type ArduinoSketch =
  | ({ mode: 'blink'; delayChoices: number[]; goal?: BlinkTiming } & BlinkTiming)
  | { mode: 'button'; lightWhen: ButtonPosition; goal?: { lightWhen: ButtonPosition } }
export type ArduinoLevel = LevelMetadata & {
  kind: 'arduino'; stage: 'demo' | 'exercise' | 'challenge'; sketch: ArduinoSketch; courseFinal?: true
}

export function arduinoIssues(level: ArduinoLevel): Issue[] {
  const { sketch, stage } = level
  const issues: Issue[] = []
  const needsGoal = stage !== 'demo'
  if (Boolean(sketch.goal) !== needsGoal) {
    issues.push({ path: '/sketch/goal', code: 'arduino-goal', message: 'Provide a goal for exercises and challenges, and leave demonstrations open to exploration.' })
  }
  if (level.courseFinal && stage !== 'challenge') {
    issues.push({ path: '/courseFinal', code: 'arduino-final', message: 'Use a challenge for the course finale.' })
  }
  if (sketch.mode === 'blink') {
    const timings = [sketch.onMs, sketch.offMs, ...(sketch.goal ? [sketch.goal.onMs, sketch.goal.offMs] : [])]
    if (!timings.every(ms => sketch.delayChoices.includes(ms))) issues.push({
      path: '/sketch/delayChoices', code: 'arduino-delays', message: 'Include all starting and target times among the delay controls.',
    })
  }
  return issues
}
