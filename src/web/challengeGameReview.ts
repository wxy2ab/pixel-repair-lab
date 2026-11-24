import type { ArenaResult } from '../shared/advanced'
import type { CoursePrerequisite, GridGoalGap, Localized, RunIssue, RunResult } from '../shared/types'
import { runIssueText } from './text'

function location(result: { passedCases: number; totalCases: number }, turn: number, issue?: RunIssue): Localized {
  const parts: Localized[] = []
  if (result.totalCases > 1) parts.push({
    zh: `场景 ${result.passedCases + 1} / ${result.totalCases}`,
    en: `Scenario ${result.passedCases + 1} of ${result.totalCases}`,
  })
  if (issue?.line) parts.push({ zh: `第 ${issue.line} 行`, en: `Line ${issue.line}` })
  if (turn > 0) parts.push({ zh: `已用 ${turn} 回合`, en: `Turns used: ${turn}` })
  if (!parts.length) return { zh: '开始运行时', en: 'At the start of the run' }
  return { zh: parts.map(part => part.zh).join(' · '), en: parts.map(part => part.en).join(' · ') }
}

function issueWithoutLine(issue: RunIssue): Localized {
  const { code, detail } = issue
  return { zh: runIssueText('zh', { code, detail }), en: runIssueText('en', { code, detail }) }
}

function gridGap(gap: GridGoalGap): Localized {
  switch (gap.type) {
    case 'parkBoxes': return {
      zh: `还有 ${gap.remaining} 个货位没有放上箱子。`,
      en: `Empty loading pads: ${gap.remaining}.`,
    }
    case 'collect': return {
      zh: `还有 ${gap.remaining} 件目标物品未拾取。`,
      en: `Required pickups remaining: ${gap.remaining}.`,
    }
    case 'submit': return {
      zh: `还差 ${gap.remaining} 次符合要求的提交。`,
      en: `Valid submissions remaining: ${gap.remaining}.`,
    }
    case 'memory': return {
      zh: `内存格 ${gap.address} 里的值还未达到本关要求。`,
      en: `Memory cell ${gap.address} has not reached the required value.`,
    }
    case 'halt': return { zh: 'CPU 还没有停机。', en: 'The CPU has yet to halt.' }
    case 'exit': return { zh: '机器人还没有停在出口。', en: 'Sprout still needs to stop at the exit.' }
    case 'moves': return { zh: '还没有完成符合要求的移动。', en: 'A move using the required operation is still missing.' }
  }
}

const route: CoursePrerequisite = { unit: 'routing', topic: 'breadth-first' }
const rivals: CoursePrerequisite = { unit: 'algorithm-advanced', topic: 'rival-strategy' }
const sequence: CoursePrerequisite = { unit: 'foundations', topic: 'sequence' }
const branch: CoursePrerequisite = { unit: 'python-intermediate', topic: 'branches' }
const dictionary: CoursePrerequisite = { unit: 'structures', topic: 'dictionaries' }
const cpu: CoursePrerequisite = { unit: 'architecture', topic: 'instructions' }

export function gridFailureReview(result: RunResult) {
  const failure = result.failure
  if (!failure) return
  const { issue, turn, turnLimit } = failure
  const gaps = failure.gaps.map(gridGap)
  if (issue.code !== 'unfinished') gaps.unshift(issueWithoutLine(issue))
  if (turnLimit !== undefined) gaps.push({
    zh: `本场景用了 ${turn} / ${turnLimit} 回合。`,
    en: `This scenario used ${turn} of ${turnLimit} turns.`,
  })
  const topics = issue.code === 'missingKey' || failure.gaps.some(gap => 'origin' in gap && gap.origin === 'dict-index')
    ? [dictionary, branch]
    : issue.code.startsWith('cpu') || issue.code === 'memoryAddress' || failure.gaps.some(gap => gap.type === 'memory' || gap.type === 'halt')
      ? [cpu]
      : ['enemy', 'blocked', 'boxBlocked', 'turnLimit'].includes(issue.code) || failure.gaps.some(gap => gap.type === 'parkBoxes')
        ? [route, sequence] : [sequence, branch]
  return { location: location(result, turn, issue), gaps, topics }
}

export function arenaFailureReview(result: ArenaResult) {
  const failure = result.failure
  if (!failure) return
  const { issue, turn } = failure
  const gaps: Localized[] = []
  if (issue) gaps.push(issueWithoutLine(issue))

  if (result.reason === 'disabled') gaps.push({ zh: '芽芽的能量耗尽了。', en: 'Sprout ran out of energy.' })
  if (result.reason === 'timeout') gaps.push({ zh: '对抗的回合已经用完。', en: 'The match reached its turn limit.' })
  if (failure.goal === 'score') {
    const { score, leaderScore } = failure
    gaps.push({ zh: `你的得分是 ${score}，得分最高的对手有 ${leaderScore} 分。`, en: `You scored ${score}. The leading rival scored ${leaderScore}.` })
    if (result.reason === 'score') {
      const needed = leaderScore - score + 1
      gaps.push({
        zh: `还需要 ${needed} 分才能超过这次的最高对手得分。`,
        en: `You needed ${needed} more ${needed === 1 ? 'point' : 'points'} to beat the top rival score in this match.`,
      })
    }
  } else if (failure.goal === 'eliminate') {
    gaps.push({ zh: `还有 ${failure.remaining} 台对手机器人在场上。`, en: `Rivals still active: ${failure.remaining}.` })
  } else {
    if (result.reason === 'caught') gaps.push({ zh: '这一回合被对手拦住了。', en: 'A rival intercepted you this turn.' })
    if (failure.remaining > 0) gaps.push({
      zh: failure.goal === 'escape' ? `还差 ${failure.remaining} 件撤离所需的物品。` : `还差 ${failure.remaining} 件目标物资。`,
      en: `Required items still missing: ${failure.remaining}.`,
    })
    if (failure.goal === 'escape' && !failure.atExit) gaps.push({ zh: '还没有抵达出口。', en: 'The exit still needs to be reached.' })
  }

  const topics = issue?.code === 'missingKey' || issue?.code === 'type'
    ? [dictionary, branch]
    : result.reason === 'error' ? [sequence, branch] : [rivals, route]
  return { location: location(result, turn, issue), gaps, topics }
}
