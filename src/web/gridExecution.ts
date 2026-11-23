import type { ApiName, GridMapRun, PythonFlowEvent, RackStep, RunFrame, RunIssue } from '../shared/types'
import type { ExecutionLocation } from './ExecutionSource'
import { flowActivity } from './station3d/types'

export function actionViewingDelay(action?: ApiName | PythonFlowEvent['kind'], stepCount = 1): number | undefined {
  switch (action) {
    case 'scan': case 'read_map': case 'submit': return 540
    case 'call': case 'return': case 'if': case 'for': case 'while': case 'continue': case 'break':
      return Math.min(480, Math.max(250, 12_000 / stepCount))
    case 'pick': case 'say': case 'load': case 'store': case 'step': case 'wait': return 380
    default: return undefined
  }
}

type GridStep = {
  position?: ExecutionLocation
  frameIndex: number
  action?: RunFrame
  flow?: PythonFlowEvent
  rack?: RackStep
  issue?: RunIssue
}

export function gridStepActivity(step?: GridStep) {
  if (step?.flow) return flowActivity(step.flow)
  const frame = step?.action
  if (frame) return { token: frame, action: frame.action, value: frame.value, pickupKind: frame.pickupKind, failed: Boolean(frame.issue) }
  if (step?.issue?.attemptedAction) return { token: step.issue, action: step.issue.attemptedAction, failed: true }
}

// Events carry the number of game actions already committed. In particular, a scan
// inside a condition precedes its decision, even when both have the same source line.
export function gridPlayback(run?: GridMapRun, rows?: RackStep[], showHelpers = true): GridStep[] {
  if (!run) return []
  const frames = run.frames, events = run.flowEvents ?? []
  let actions = 0, eventIndex = 0
  let rack: RackStep | undefined
  const steps: GridStep[] = []

  function addActions(until: number) {
    while (actions < until) {
      const action = frames[actions++]
      steps.push({ position: { line: action.line, sourceName: action.sourceName ?? action.issue?.sourceName }, frameIndex: actions - 1, action, rack })
    }
  }

  function advance(until: number, rowIndex: number) {
    while (eventIndex < events.length) {
      const flow = events[eventIndex]
      if (flow.boardActions > until || (flow.rackIndex ?? 0) > rowIndex) break
      addActions(flow.boardActions)
      steps.push({ position: flow, frameIndex: actions - 1, flow, rack })
      eventIndex++
    }
    addActions(until)
  }

  rows?.forEach((row, index) => {
    const start = steps.length
    advance(row.boardActions ?? actions, index)
    const last = steps.at(-1)
    // Reuse the same stop for a source line and the action it just completed.
    if (steps.length > start && last?.position?.line === row.line && (last.position.sourceName ?? 'main.py') === row.sourceName) {
      last.rack = row
    } else {
      steps.push({ position: row, frameIndex: actions - 1, rack: row })
    }
    rack = row
  })
  advance(frames.length, Infinity)
  if (run.issue && !frames.at(-1)?.issue) {
    const position = run.issue.line ? { line: run.issue.line, sourceName: run.issue.sourceName } : steps.at(-1)?.position
    steps.push({ position, frameIndex: actions - 1, rack, issue: run.issue })
  }
  if (showHelpers) return steps
  let mainRack: RackStep | undefined
  return steps.flatMap(step => {
    if (step.rack?.sourceName === 'main.py') mainRack = step.rack
    if (!step.position?.sourceName || step.position.sourceName === 'main.py') return [{ ...step, rack: mainRack }]
    const flow = step.flow
    if (flow?.kind === 'return' && flow.targetSourceName === 'main.py' && flow.resumeLine) {
      return [{ ...step, position: { line: flow.resumeLine, sourceName: 'main.py' }, rack: mainRack }]
    }
    return []
  })
}
