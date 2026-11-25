import type { ArenaFrame, ArenaLevel, PersonalAlgorithms } from '../shared/advanced'
import type { PythonFlowEvent, RunIssue } from '../shared/types'
import { ArenaSession, arenaModules } from './arena'
import { ProgramError, type PythonModules } from './python'
import { isArenaChoice, type ArenaChoice, type RealtimeArenaProgress, type RealtimeArenaResult, type RealtimePolicyStep } from './realtimeProtocol'

type LiveTurn = { frame: ArenaFrame; result?: RealtimeArenaResult; issue?: RunIssue; policyStep?: RealtimePolicyStep }

export class RealtimeArenaSession {
  private readonly arena: ArenaSession
  private readonly modules: PythonModules
  private readonly combat: boolean
  private readonly actions: ArenaChoice[] = []
  private policyOnly = true
  private policy?: string
  private manual?: ArenaChoice

  constructor(level: ArenaLevel, personal?: PersonalAlgorithms, course?: PersonalAlgorithms) {
    this.arena = new ArenaSession(level)
    this.modules = arenaModules(level, personal, course)
    this.combat = Boolean(level.combat)
  }

  static restore(level: ArenaLevel, progress: RealtimeArenaProgress, personal?: PersonalAlgorithms, course?: PersonalAlgorithms) {
    const session = new RealtimeArenaSession(level, personal, course)
    for (const action of progress.actions) {
      if (!isArenaChoice(action, session.combat)) return
      const step = session.advance(action)
      if (!step || step.decision) return
    }
    if (progress.queued !== undefined && !isArenaChoice(progress.queued, session.combat)) return
    session.policy = progress.policy
    session.manual = progress.queued
    // Older saves contain the moves but cannot tell who chose them.
    session.policyOnly = progress.policyOnly === true
    return session
  }

  get snapshot() {
    return this.arena.state
  }

  get progress(): RealtimeArenaProgress {
    return { actions: [...this.actions], policy: this.policy, queued: this.manual, policyOnly: this.policyOnly }
  }

  get latestFrame() {
    return this.arena.frames.at(-1)
  }

  get latestShift() {
    return this.arena.frames.findLast(frame => frame.shift)?.shift
  }

  get playerPositions() {
    return this.arena.frames.map(({ state }) => ({ x: state.actors[0].x, y: state.actors[0].y }))
  }

  setPolicy(source: string): { active: boolean; issue?: RunIssue } {
    if (!source.trim()) {
      this.policy = undefined
      return { active: false }
    }
    try {
      this.arena.chooseAction(source, this.modules)
      this.policy = source
      return { active: true }
    } catch (error) {
      return { active: Boolean(this.policy), issue: this.issueFor(error) }
    }
  }

  queueAction(action: ArenaChoice) {
    if (!isArenaChoice(action, this.combat)) return false
    this.manual = action
    return true
  }

  tick(): LiveTurn | undefined {
    let choice = this.manual ?? 'wait'
    let choseWithPolicy = false
    let issue: RunIssue | undefined
    let policyStep: RealtimePolicyStep | undefined
    if (!this.manual && this.policy) {
      const source = this.policy
      let policyLine: number | undefined
      const flow: PythonFlowEvent[] = []
      let truncated = false
      try {
        const decision = this.arena.chooseAction(source, this.modules, {
          onFlow: event => flow.push(event), onFlowTruncated: () => { truncated = true },
        })
        choice = decision.action
        policyLine = decision.line
        choseWithPolicy = true
      } catch (error) {
        this.policy = undefined
        issue = this.issueFor(error)
      }
      const line = issue?.line ?? policyLine
      if (line) policyStep = { source, line, sourceName: issue?.sourceName,
        ...(flow.length && { flow }), ...(truncated ? { truncated: true } : {}) }
    }
    this.manual = undefined
    const step = this.advance(choice)
    if (!step) return undefined
    if (!choseWithPolicy) this.policyOnly = false
    const result = step.decision && {
      ...step.decision,
      won: step.decision.outcome === 'win',
      policyOnly: this.policyOnly,
      frames: this.arena.frames,
      final: this.arena.state,
      passedCases: Number(step.decision.outcome === 'win'),
      totalCases: 1,
      ...(step.decision.outcome !== 'win' && { failure: this.arena.failure() }),
    }
    return { frame: step.frame, result, issue, policyStep }
  }

  private advance(action: ArenaChoice) {
    const step = this.arena.advance(action)
    if (step) this.actions.push(action)
    return step
  }

  private issueFor(error: unknown): RunIssue {
    return error instanceof ProgramError ? error.issue : { code: error instanceof RangeError ? 'limit' : 'internal' }
  }
}
