import type { ArenaFrame, ArenaLevel, ArenaResult, PersonalAlgorithms } from '../shared/advanced'
import type { PythonFlowEvent, RunIssue } from '../shared/types'
import { ArenaSession, arenaModules } from './arena'
import { ProgramError, PythonProgram, type PythonModules } from './python'
import { isArenaChoice, type ArenaChoice, type RealtimeArenaProgress, type RealtimePolicyStep } from './realtimeProtocol'
import { Values } from './values'

type LiveTurn = { frame: ArenaFrame; result?: ArenaResult; issue?: RunIssue; policyStep?: RealtimePolicyStep }

export class RealtimeArenaSession {
  private readonly arena: ArenaSession
  private readonly modules: PythonModules
  private readonly actions: ArenaChoice[] = []
  private policy?: string
  private manual?: ArenaChoice

  constructor(level: ArenaLevel, personal?: PersonalAlgorithms, course?: PersonalAlgorithms) {
    this.arena = new ArenaSession(level)
    this.modules = arenaModules(level, personal, course)
  }

  static restore(level: ArenaLevel, progress: RealtimeArenaProgress, personal?: PersonalAlgorithms, course?: PersonalAlgorithms) {
    const session = new RealtimeArenaSession(level, personal, course)
    for (const action of progress.actions) {
      if (!isArenaChoice(action)) return
      const step = session.advance(action)
      if (!step || step.decision) return
    }
    session.policy = progress.policy
    session.manual = progress.queued
    return session
  }

  get snapshot() {
    return this.arena.state
  }

  get progress(): RealtimeArenaProgress {
    return { actions: [...this.actions], policy: this.policy, queued: this.manual }
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
      this.choose(source)
      this.policy = source
      return { active: true }
    } catch (error) {
      return { active: Boolean(this.policy), issue: this.issueFor(error) }
    }
  }

  queueAction(action: ArenaChoice) {
    if (isArenaChoice(action)) this.manual = action
  }

  tick(): LiveTurn | undefined {
    let choice = this.manual ?? 'wait'
    let issue: RunIssue | undefined
    let policyStep: RealtimePolicyStep | undefined
    if (!this.manual && this.policy) {
      const source = this.policy
      let policyLine: number | undefined
      const flow: PythonFlowEvent[] = []
      let truncated = false
      try {
        choice = this.choose(source, (line, file) => {
          if (file === 'main.py') policyLine = line
        }, event => flow.push(event), () => { truncated = true })
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
    const result = step.decision && {
      ...step.decision,
      won: step.decision.outcome === 'win',
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

  private choose(source: string, onLine?: (line: number, sourceName: string) => void,
    onFlow?: (event: PythonFlowEvent) => void, onFlowTruncated?: () => void): ArenaChoice {
    const values = new Values()
    const runner = new PythonProgram(source, values, (name, _args, line) => {
      throw new ProgramError({ code: 'unknownName', detail: name, line })
    }, { modules: this.modules, stepBudget: 24_000, onLine, onFlow, onFlowTruncated, flowLimit: 80, traceModules: true })
    const choice = runner.runPureFunction('decide', [values.fromJson(this.arena.scan())], true).data
    if (!isArenaChoice(choice)) throw new ProgramError({ code: 'wrongAnswer', detail: 'decide' })
    return choice
  }

  private issueFor(error: unknown): RunIssue {
    return error instanceof ProgramError ? error.issue : { code: error instanceof RangeError ? 'limit' : 'internal' }
  }
}
