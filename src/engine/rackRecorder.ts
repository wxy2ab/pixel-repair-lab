import type { RackBinding, RackStep } from '../shared/types'
import { plain, type Value } from './values'

// A scope also holds function definitions. Only actual Python values go onto the rack.
type Locals = ReadonlyMap<string, Value | { parameters: string[] }>
type OpenLine = { line: number; sourceName: string; scope: Locals }

export class RackRecorder {
  readonly steps: RackStep[] = []
  current?: OpenLine
  private remaining = 2_000_000
  private previous = new Map<string, { text: string; binding: RackBinding }>()

  constructor(private readonly boardActions?: () => number) {}

  enter(line: number, sourceName: string, scope: Locals) {
    this.finishLine()
    this.current = { line, sourceName, scope }
  }

  resume(caller: OpenLine | undefined, scope: Locals) {
    if (caller && caller.scope === scope && this.current !== caller) this.enter(caller.line, caller.sourceName, scope)
  }

  finishLine() {
    if (!this.current) return
    const { line, sourceName, scope } = this.current
    this.current = undefined
    const step: RackStep = { line, sourceName }
    if (this.boardActions) step.boardActions = this.boardActions()
    this.steps.push(step)
    // The workbench is observational. A large scratch variable or a long program
    // may exhaust the display budget but must still return its normal result.
    if (this.remaining <= 0) return
    const bindings: RackBinding[] = []
    for (const [name, binding] of scope) {
      if (!('data' in binding)) continue
      try {
        const value = plain(binding)
        const text = JSON.stringify(value)
        const cached = this.previous.get(name)
        if (cached?.text === text) bindings.push(cached.binding)
        else {
          this.remaining -= text.length + name.length + 12
          if (this.remaining < 0) return
          const entry = { name, value }
          bindings.push(entry)
          this.previous.set(name, { text, binding: entry })
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
      }
    }
    this.remaining -= 1 + bindings.length
    step.bindings = bindings
  }
}
