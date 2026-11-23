import type { PersonalAlgorithms } from '../shared/advanced'
import type {
  ApiName, Direction, GridFailure, GridFlowEvent, GridGoalGap, GridLevel, GridMapRun, GridSnapshot, Json, Objective, Origin, Position,
  RunFrame, RunIssue, RunResult, Scenario,
} from '../shared/types'
import { algorithmModules } from './algorithms'
import { mapScenarioAt } from '../shared/mapScenarios'
import { blockingGridDevice, gridOffsets as offsets } from '../shared/gridDevices'
import { readGridMap } from './readGridMap'
import { RackRecorder } from './rackRecorder'
import { executeCpuInstruction, isMemoryAddress } from './cpu'
import { ProgramError, PythonProgram, type PythonModules } from './python'
import { advanceGridTurn, initialSnapshot } from './snapshot'
import { addOrigin, bare, MAX_STRING, plain, Values, valuesEqual, type Value } from './values'

export { initialSnapshot } from './snapshot'

const argumentCounts: Record<ApiName, number> = {
  move: 1, scan: 0, pick: 0, say: 1, submit: 1, load: 1, store: 2, step: 0, wait: 0, read_map: 0,
}

const equals = (left: Position, right: Position) => left.x === right.x && left.y === right.y
const MAX_FRAMES = 240

type SubmissionGoal = Extract<Objective, { type: 'submit' }>

type SubmissionProgress = {
  goal: SubmissionGoal
  count: number
  containers?: Set<number>
}

class GridSession {
  readonly frames: RunFrame[] = []
  flowEvents?: GridFlowEvent[]
  flowTruncated = false
  readonly state: GridSnapshot
  private readonly values = new Values()
  private readonly picked = new Set<string>()
  private readonly submissionProgress = new Map<SubmissionGoal, SubmissionProgress>()
  private moves = 0

  constructor(private readonly scenario: Scenario, private readonly allowedApi: ApiName[]) {
    this.state = initialSnapshot(scenario)
    for (const objective of this.scenario.objectives) {
      if (objective.type === 'submit') this.submissionProgress.set(objective, { goal: objective, count: 0 })
    }
  }

  run(source: string, modules: PythonModules, rack?: RackRecorder, observeFlow = false): RunIssue | undefined {
    try {
      if (observeFlow) this.flowEvents = []
      new PythonProgram(source, this.values, (name, args, line, file) => this.call(name, args, line, file), {
        modules, rack, traceModules: true,
        ...(observeFlow && {
          onFlow: event => this.flowEvents!.push({ ...event, boardActions: this.frames.length,
            ...(rack?.current && { rackIndex: rack.steps.length }) }),
          onFlowTruncated: () => { this.flowTruncated = true },
        }),
      }).run()
      if (!this.scenario.objectives.every((objective) => this.complete(objective))) {
        return { code: this.turnsExhausted ? 'turnLimit' : 'unfinished' }
      }
      return undefined
    } catch (error) {
      return error instanceof ProgramError ? error.issue : { code: 'internal' }
    }
  }

  failure(issue: RunIssue): GridFailure | undefined {
    if (issue.code === 'internal') return
    const gaps = this.scenario.objectives.flatMap((goal): GridGoalGap[] => {
      if (this.complete(goal)) return []
      switch (goal.type) {
        case 'collect': return [{ type: 'collect', remaining: goal.itemIds.filter(id => !this.picked.has(id)).length }]
        case 'submit': return [{
          type: 'submit', remaining: goal.values.length - (this.submissionProgress.get(goal)?.count ?? 0), origin: goal.origin,
        }]
        case 'moves': return [{ type: 'moves', origin: goal.origin }]
        case 'memory': return [{ type: 'memory', address: goal.address }]
        case 'exit':
        case 'halt': return [{ type: goal.type }]
      }
    })
    return { issue, turn: this.state.turn, turnLimit: this.scenario.turnLimit, gaps }
  }

  private get turnsExhausted(): boolean {
    return this.scenario.turnLimit !== undefined && this.state.turn >= this.scenario.turnLimit
  }

  private complete(objective: Objective): boolean {
    switch (objective.type) {
      case 'exit': return equals(this.state.player, objective)
      case 'collect': return objective.itemIds.every((id) => this.picked.has(id))
      case 'moves': return this.moves > 0
      case 'submit': return this.submissionProgress.get(objective)?.count === objective.values.length
      case 'memory': return this.state.memory[objective.address] === objective.value
      case 'halt': return this.state.halted
    }
  }

  private fail(code: string, line: number, detail?: string, attemptedAction?: ApiName): never {
    throw new ProgramError({ code, line, detail, ...(this.flowEvents && attemptedAction && { attemptedAction }) })
  }

  private call(name: string, args: Value[], line: number, sourceName?: string): Value {
    if (!Object.hasOwn(argumentCounts, name)) this.fail('unknownName', line, name)
    const action = name as ApiName
    if (!this.allowedApi.includes(action)) this.fail('apiDisabled', line, name, action)
    if (args.length !== argumentCounts[action]) this.fail('wrongArguments', line, name, action)
    if (this.frames.length >= MAX_FRAMES) this.fail('limit', line)
    let output = bare(null)
    let visible: Json | undefined
    let memoryAddress: number | undefined
    let issue: RunIssue | undefined
    const devices = this.state.devices
    const keyCount = devices?.keys.length ?? 0
    const chestCount = devices?.openedChests.length ?? 0
    try {
      if (this.turnsExhausted && (action === 'move' || action === 'pick' || action === 'step' || action === 'wait')) this.fail('turnLimit', line)
      switch (action) {
        case 'wait':
          this.advanceTurn(line)
          break
        case 'read_map':
          output = this.values.fromJson(readGridMap(this.scenario, this.state))
          visible = plain(output)
          break
        case 'move':
          this.move(args[0], line)
          visible = plain(args[0])
          break
        case 'scan': {
          output = this.values.fromJson(this.scan())
          visible = plain(output)
          break
        }
        case 'pick':
          visible = this.pick(line)
          output = bare(visible)
          break
        case 'say':
          if (typeof args[0].data !== 'string') this.fail('type', line, name)
          if (args[0].data.length > MAX_STRING) this.fail('limit', line)
          visible = args[0].data
          break
        case 'submit':
          visible = plain(args[0])
          this.submit(args[0], visible, line)
          break
        case 'load': {
          const address = this.address(args[0].data, line)
          memoryAddress = address
          visible = this.state.memory[address]
          output = addOrigin(bare(visible), { kind: 'memory-load', container: 0 })
          break
        }
        case 'store': {
          const address = this.address(args[0].data, line)
          const value = args[1].data
          if (typeof value !== 'number' || !Number.isSafeInteger(value)) this.fail('type', line, name)
          memoryAddress = address
          this.state.memory[address] = value
          visible = value
          break
        }
        case 'step':
          visible = this.step(line)
          break
      }
    } catch (error) {
      if (error instanceof ProgramError) issue = error.issue
      throw error
    } finally {
      this.frames.push({ line, action, state: structuredClone(this.state), value: visible,
        ...(sourceName && sourceName !== 'main.py' && { sourceName }),
        ...(devices && devices.keys.length > keyCount && { pickupKind: 'key' }),
        ...(devices && devices.openedChests.length > chestCount && { pickupKind: 'chest' }),
        ...(memoryAddress !== undefined && { memoryAddress }), ...(issue && { issue }) })
    }
    return output
  }

  private passable(position: Position): boolean {
    return this.scenario.tiles[position.y]?.[position.x] === '.'
  }

  private move(direction: Value, line: number): void {
    if (typeof direction.data !== 'string' || !Object.hasOwn(offsets, direction.data)) this.fail('wrongArguments', line, 'move')
    for (const objective of this.scenario.objectives) {
      if (objective.type === 'moves' && !this.containers(direction, objective.origin).size) {
        this.fail('requiredOrigin', line, objective.origin)
      }
    }
    const offset = offsets[direction.data as Direction]
    const next = { x: this.state.player.x + offset.x, y: this.state.player.y + offset.y }
    const obstruction = blockingGridDevice(this.scenario, this.state.devices, next)
    if (obstruction) this.fail(obstruction.kind === 'door' ? 'lockedDoor' : 'fixtureBlocked', line, obstruction.id)
    if (!this.passable(next)) this.fail('blocked', line, direction.data)
    this.state.player = next
    if (this.state.enemies.some((enemy) => equals(next, enemy))) this.fail('enemy', line)
    this.moves++
    this.advanceTurn(line)
  }

  private pick(line: number): string {
    const devices = this.state.devices
    const chest = this.scenario.devices?.find(device => device.kind === 'chest' && equals(device, this.state.player))
    if (chest?.kind === 'chest' && devices && !devices.openedChests.includes(chest.id)) {
      if (chest.keyId && !devices.keys.includes(chest.keyId)) this.fail('lockedChest', line, chest.id)
      devices.openedChests.push(chest.id)
      this.picked.add(chest.id)
      this.advanceTurn(line)
      return chest.id
    }
    const index = this.state.items.findIndex((item) => equals(item, this.state.player))
    if (index === -1) this.fail('noItem', line)
    const [item] = this.state.items.splice(index, 1)
    this.picked.add(item.id)
    this.advanceTurn(line)
    return item.id
  }

  private advanceTurn(line: number): void {
    const issue = advanceGridTurn(this.scenario, this.state)
    if (issue) this.fail(issue.code, line, issue.detail)
  }

  private scan(): Json {
    if (this.scenario.input !== undefined) return this.scenario.input
    const { x, y } = this.state.player
    return Object.fromEntries(Object.entries(offsets).map(([direction, offset]) => {
      const neighbor = { x: x + offset.x, y: y + offset.y }
      let tile = 'floor'
      if (!this.passable(neighbor) || blockingGridDevice(this.scenario, this.state.devices, neighbor)) tile = 'wall'
      else if (this.state.enemies.some((position) => equals(position, neighbor))) tile = 'enemy'
      else if (this.state.items.some((position) => equals(position, neighbor))) tile = 'item'
      else if (this.scenario.objectives.some((goal) => goal.type === 'exit' && equals(goal, neighbor))) tile = 'exit'
      return [direction, tile]
    }))
  }

  private containers(value: Value, kind: Origin): Set<number> {
    return new Set(value.origins.filter((origin) => origin.kind === kind).map((origin) => origin.container))
  }

  private submit(value: Value, raw: Json, line: number): void {
    const submission = [...this.submissionProgress.values()].find(({ goal, count }) => count < goal.values.length)
    if (!submission) {
      if (this.submissionProgress.size) this.fail('wrongAnswer', line)
      return
    }
    const { goal } = submission
    if (!valuesEqual(raw, goal.values[submission.count])) this.fail('wrongAnswer', line, String(submission.count + 1))
    if (goal.origin) {
      const containers = this.containers(value, goal.origin)
      if (goal.sameContainer && submission.containers) {
        for (const id of containers) if (!submission.containers.has(id)) containers.delete(id)
      }
      if (!containers.size) this.fail('requiredOrigin', line, goal.origin)
      submission.containers = containers
    }
    submission.count++
  }

  private address(address: Value['data'], line: number): number {
    if (!isMemoryAddress(address, this.state.memory)) {
      this.fail('memoryAddress', line, typeof address === 'number' ? String(address) : undefined)
    }
    return address
  }

  private step(line: number): string {
    if (this.state.halted) this.fail('cpuHalted', line)
    const instruction = this.scenario.instructions?.[this.state.pc]
    if (!instruction) this.fail('cpuInstruction', line)
    const transition = executeCpuInstruction(this.state, instruction)
    if ('issue' in transition) this.fail(transition.issue.code, line, transition.issue.detail)
    Object.assign(this.state, transition.state)
    this.advanceTurn(line)
    return instruction.op
  }
}

export function runProgram(level: GridLevel, source: string, personal?: PersonalAlgorithms, course?: PersonalAlgorithms,
  observeRack = false, observeFlow = false): RunResult {
  const modules = algorithmModules(personal, level.helpers, course)
  const totalCases = 1 + (level.variants?.length ?? 0)
  const mapRuns: GridMapRun[] = []
  let issue: RunIssue | undefined
  let failure: GridFailure | undefined
  let passedCases = 0
  let rack: RackRecorder | undefined
  for (let index = 0; index < totalCases; index++) {
    const session = new GridSession(mapScenarioAt(level, index), level.allowedApi)
    if (observeRack && index === 0) rack = new RackRecorder(() => session.frames.length)
    const mapIssue = session.run(source, modules, index === 0 ? rack : undefined, observeFlow)
    if (index === 0) rack?.finishLine()
    mapRuns.push({ frames: session.frames, final: session.state, issue: mapIssue,
      ...(session.flowEvents?.length && { flowEvents: session.flowEvents }),
      ...(session.flowTruncated && { flowTruncated: true }) })
    if (mapIssue) {
      issue = index === 0 ? mapIssue : { code: 'variant', line: mapIssue.line, detail: String(index + 1) }
      failure = session.failure(mapIssue)
      break
    }
    passedCases++
  }
  return {
    won: !issue,
    ...(rack && { rackSteps: rack.steps }),
    ...mapRuns[0],
    ...(totalCases > 1 && { mapRuns }),
    passedCases,
    totalCases,
    issue,
    ...(failure && { failure }),
  }
}
