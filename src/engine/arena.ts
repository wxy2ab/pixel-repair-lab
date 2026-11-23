import type {
  ArenaAction, ArenaActor, ArenaEvent, ArenaFailure, ArenaFrame, ArenaLevel, ArenaOpponent, ArenaOutcome, ArenaReason,
  ArenaProgramEvent, ArenaReading, ArenaResult, ArenaScan, ArenaScenario, ArenaShiftResult, ArenaSnapshot, PersonalAlgorithms,
} from '../shared/advanced'
import type { Direction, Position, RunIssue } from '../shared/types'
import { selectHelpers } from '../shared/courseHelpers'
import { SHORTEST_STEP_SOURCE } from './algorithms'
import { ProgramError, PythonProgram, type PythonModules } from './python'
import type { ArenaChoice } from './realtimeProtocol'
import { initialArenaSnapshot } from './snapshot'
import { mapScenarioAt } from '../shared/mapScenarios'
import { bare, Values, type Value } from './values'

export { initialArenaSnapshot } from './snapshot'

const directions = ['up', 'right', 'down', 'left'] as const
const deltas: Record<Direction, Position> = {
  up: { x: 0, y: -1 }, right: { x: 1, y: 0 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 },
}
const matchEnded = Symbol('match ended')

type Intent = Pick<ArenaEvent, 'action' | 'direction' | 'tactic' | 'targetId'>
type Decision = { outcome: ArenaOutcome; reason: ArenaReason }
type Route = { distance: number; first?: Direction }
type Racer = { actor: ArenaActor; routes: Map<string, Route> }
type AdaptiveStyle = Extract<ArenaOpponent['policy'], { kind: 'adaptive' }>['style']

const samePosition = (left: Position, right: Position) => left.x === right.x && left.y === right.y
const keyOf = ({ x, y }: Position) => `${x},${y}`
const coordinates = ({ x, y }: Position) => [x, y]

export function arenaModules(level: ArenaLevel, personal?: PersonalAlgorithms, course?: PersonalAlgorithms): PythonModules {
  return {
    algorithms: { shortest_step: SHORTEST_STEP_SOURCE, ...selectHelpers(level.helpers ?? [], course) },
    my_algorithms: personal,
  }
}

function move(position: Position, direction: Direction): Position {
  const delta = deltas[direction]
  return { x: position.x + delta.x, y: position.y + delta.y }
}

function passable(tiles: string[], position: Position): boolean {
  return tiles[position.y]?.[position.x] === '.'
}

function nextMove(tiles: string[], start: Position, goals: Position[]): Direction | undefined {
  if (!goals.length) return undefined
  const targetKeys = new Set(goals.map(keyOf))
  for (const [key, route] of routesFrom(tiles, start)) {
    if (route.first && targetKeys.has(key)) return route.first
  }
}

function* routesFrom(tiles: string[], start: Position): Generator<[string, Route]> {
  const visited = new Set([keyOf(start)])
  const queue: { position: Position; route: Route }[] = [{ position: start, route: { distance: 0 } }]
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const { position, route } = queue[cursor]
    yield [keyOf(position), route]
    for (const direction of directions) {
      const neighbor = move(position, direction)
      const key = keyOf(neighbor)
      if (!passable(tiles, neighbor) || visited.has(key)) continue
      visited.add(key)
      queue.push({ position: neighbor, route: { distance: route.distance + 1, first: route.first ?? direction } })
    }
  }
}

export class ArenaSession {
  readonly state: ArenaSnapshot
  readonly frames: ArenaFrame[] = []
  pendingScan?: ArenaScan
  pendingProgram: ArenaProgramEvent[] = []
  programTruncated = false
  private readonly values = new Values()
  private readonly claims = new Map<string, string>()
  private readonly patrolSteps = new Map<string, number>()
  private decision?: Decision
  private shiftIndex = 0

  constructor(private readonly scenario: ArenaScenario, private readonly recordScans = false, private readonly recordFlow = false) {
    this.state = initialArenaSnapshot(scenario)
  }

  advance(action: ArenaChoice): { frame: ArenaFrame; decision?: Decision } | undefined {
    if (this.decision) return undefined
    const intent = action === 'pick' || action === 'wait' ? { action } : { action: 'move' as const, direction: action }
    this.turn(intent, 0)
    return { frame: this.frames.at(-1)!, decision: this.decision }
  }

  run(source: string, modules: PythonModules): Decision & { issue?: RunIssue } {
    try {
      new PythonProgram(source, this.values, (name, args, line, file) => this.call(name, args, line, file), {
        modules,
        traceModules: true,
        stepBudget: 120_000,
        ...(this.recordFlow && {
          onFlow: event => { this.pendingProgram.push(event) },
          onFlowTruncated: () => { this.programTruncated = true },
        }),
      }).run()
    } catch (error) {
      if (error !== matchEnded) {
        return { outcome: 'loss', reason: 'error', issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
      }
    }
    if (this.scenario.objective.kind === 'score') {
      while (!this.decision) this.turn({ action: 'wait' }, 0)
    }
    return this.decision ?? { outcome: 'loss', reason: 'unfinished' }
  }

  failure(issue?: RunIssue): ArenaFailure | undefined {
    if (issue?.code === 'internal') return
    const goal = this.scenario.objective
    const [player, ...opponents] = this.state.actors
    const stop = { turn: this.state.turn, issue }
    return goal.kind === 'score'
      ? { ...stop, goal: 'score', score: player.score, leaderScore: Math.max(0, ...opponents.map(actor => actor.score)) }
      : { ...stop, goal: 'escape', atExit: samePosition(player, goal.exit),
        remaining: goal.itemIds.filter(id => this.claims.get(id) !== player.id).length }
  }

  private call(name: string, args: Value[], line: number, file?: string): Value {
    const fail = (code: string): never => { throw new ProgramError({ code, line, detail: name }) }
    switch (name) {
      case 'scan': {
        if (args.length) return fail('wrongArguments')
        const reading = this.scan()
        // Between turns repeated scans see the exact same board. Capture the
        // first snapshot before an actor can move and keep the most recent line.
        if (this.recordScans || this.recordFlow) {
          if (this.pendingScan) {
            this.pendingScan.count++
            this.pendingScan.line = line
          } else this.pendingScan = { line, count: 1, value: structuredClone(reading) }
          if (file && file !== 'main.py') this.pendingScan.sourceName = file
          else delete this.pendingScan.sourceName
          if (this.recordFlow) {
            const preceding = this.pendingProgram.at(-1)
            if (preceding?.kind === 'scan') {
              preceding.scan.count++
              preceding.scan.line = line
              preceding.scan.sourceName = this.pendingScan.sourceName
            } else this.pendingProgram.push({ kind: 'scan', scan: { ...this.pendingScan, count: 1 } })
          }
        }
        return this.values.fromJson(reading)
      }
      case 'move': {
        const direction = args[0]?.data
        if (args.length !== 1 || typeof direction !== 'string' || !Object.hasOwn(deltas, direction)) return fail('wrongArguments')
        this.turn({ action: 'move', direction: direction as Direction }, line, file)
        break
      }
      case 'pick':
      case 'wait':
        if (args.length) return fail('wrongArguments')
        this.turn({ action: name }, line, file)
        break
      default:
        return fail('unknownName')
    }
    if (this.decision) throw matchEnded
    return bare(null)
  }

  scan(): ArenaReading {
    return {
      tiles: this.tiles,
      player: coordinates(this.state.actors[0]),
      opponents: this.state.actors.slice(1),
      items: this.state.items,
      turn: this.state.turn,
      exit: this.scenario.objective.kind === 'escape' ? coordinates(this.scenario.objective.exit) : null,
      ...(this.state.tiles ? {
        playerScore: this.state.actors[0].score,
        nextShift: this.scenario.shifts?.[this.shiftIndex]?.turn ?? null,
      } : {}),
    }
  }

  private get tiles(): string[] {
    return this.state.tiles ?? this.scenario.tiles
  }

  private adaptiveIntent(style: AdaptiveStyle, racer: Racer, racers: Racer[]): Intent {
    const others = racers.filter(other => other !== racer)
    const highestScore = Math.max(...others.map(({ actor }) => actor.score))
    const { score } = racer.actor
    const contest = score < highestScore || (score === highestScore && (
      style === 'intercept' || (style === 'flex' && score > 0)
    ))
    const tactic = contest ? 'contest' : 'secure'
    const occupiedItem = this.state.items.find(item => samePosition(item, racer.actor))
    if (occupiedItem) return { action: 'pick', tactic, targetId: occupiedItem.id }

    const targets = this.state.items.flatMap(item => {
      const key = keyOf(item)
      const route = racer.routes.get(key)
      return route ? [{ id: item.id, key, ...route }] : []
    })
    if (!targets.length) return { action: 'wait', tactic }
    const nearest = Math.min(...targets.map(({ distance }) => distance))
    const threats = style === 'secure' ? others : style === 'intercept' ? [racers[0]]
      : others.filter(({ actor }) => actor.score === highestScore)
    const ranked = targets.map(target => {
      const threatDistance = Math.min(...threats.map(rival => rival.routes.get(target.key)?.distance ?? Infinity))
      const preferred = contest
        ? Math.abs(target.distance - threatDistance) <= 1 && target.distance <= nearest + 3
        : target.distance < threatDistance
      return { ...target, preferred }
    })
    ranked.sort((left, right) => Number(right.preferred) - Number(left.preferred) || left.distance - right.distance)
    const target = ranked[0]
    return { action: 'move', direction: target.first, tactic, targetId: target.id }
  }

  private opponentIntent(opponent: ArenaOpponent, index: number, racers: Racer[]): Intent {
    const position = this.state.actors[index]
    const policy = opponent.policy
    if (policy.kind === 'adaptive') return this.adaptiveIntent(policy.style, racers[index], racers)
    const canPick = policy.kind === 'collect' || (policy.kind === 'patrol' && this.scenario.objective.kind === 'score')
    if (canPick && this.state.items.some((item) => samePosition(item, position))) {
      return { action: 'pick' }
    }
    if (policy.kind === 'patrol') {
      const waypoint = ((this.patrolSteps.get(opponent.id) ?? 0) + 1) % policy.path.length
      const target = policy.path[waypoint]
      this.patrolSteps.set(opponent.id, waypoint)
      const direction = directions.find((name) => samePosition(move(position, name), target))
      return direction ? { action: 'move', direction } : { action: 'wait' }
    }
    const goals = policy.kind === 'collect' ? this.state.items : [this.state.actors[0]]
    const direction = nextMove(this.tiles, position, goals)
    return direction ? { action: 'move', direction } : { action: 'wait' }
  }

  private applyShift(): ArenaShiftResult | undefined {
    const shift = this.scenario.shifts?.[this.shiftIndex]
    const tiles = this.state.tiles
    if (!tiles || shift?.turn !== this.state.turn) return undefined
    this.shiftIndex++
    const result: ArenaShiftResult = { turn: shift.turn, opened: [], closed: [], blocked: [], relocated: [] }
    const setTile = ({ x, y }: Position, tile: '.' | '#') => {
      const row = tiles[y]
      if (row?.[x] === undefined || row[x] === tile) return false
      tiles[y] = row.slice(0, x) + tile + row.slice(x + 1)
      return true
    }
    for (const position of shift.open ?? []) {
      if (setTile(position, '.')) result.opened.push({ ...position })
    }
    for (const { id, x, y } of shift.moveItems ?? []) {
      const item = this.state.items.find(entry => entry.id === id)
      const to = { x, y }
      if (!item || samePosition(item, to) || !passable(tiles, to)
        || this.state.items.some(entry => samePosition(entry, to))) continue
      result.relocated.push({ id, from: { x: item.x, y: item.y }, to })
      Object.assign(item, to)
    }
    for (const position of shift.close ?? []) {
      if (this.state.actors.some(actor => samePosition(actor, position))
        || this.state.items.some(item => samePosition(item, position))) {
        result.blocked.push({ ...position })
      } else if (setTile(position, '#')) {
        result.closed.push({ ...position })
      }
    }
    return result
  }

  private turn(player: Intent, line: number, file?: string): void {
    const previous = this.state.actors.map(({ x, y }) => ({ x, y }))
    const racers = this.scenario.opponents.some(opponent => opponent.policy.kind === 'adaptive')
      ? this.state.actors.map(actor => ({ actor, routes: new Map(routesFrom(this.tiles, actor)) }))
      : []
    const intents = [player, ...this.scenario.opponents.map((opponent, index) => this.opponentIntent(opponent, index + 1, racers))]
    const events: ArenaEvent[] = intents.map(({ action, direction, tactic, targetId }, index) => {
      const actor = this.state.actors[index]
      const event: ArenaEvent = { actorId: actor.id, action }
      if (tactic) event.tactic = tactic
      if (targetId) event.targetId = targetId
      if (direction) {
        const next = move(actor, direction)
        event.direction = direction
        if (passable(this.tiles, next)) Object.assign(actor, next)
        else event.blocked = true
      }
      return event
    })

    // Rotate who gets first claim when multiple actors pick on the same turn.
    for (let offset = 0; offset < intents.length; offset++) {
      const index = (this.state.turn + offset) % intents.length
      if (intents[index].action !== 'pick') continue
      const actor = this.state.actors[index]
      const itemIndex = this.state.items.findIndex((item) => samePosition(item, actor))
      if (itemIndex === -1) {
        events[index].blocked = true
        continue
      }
      const [item] = this.state.items.splice(itemIndex, 1)
      this.claims.set(item.id, actor.id)
      events[index].itemId = item.id
      actor.score++
    }

    this.state.turn++
    const shift = this.applyShift()
    this.decide(previous)
    this.frames.push({ line, state: structuredClone(this.state), events, ...(shift ? { shift } : {}),
      ...(file && file !== 'main.py' && { sourceName: file }),
      ...(this.pendingProgram.length && { program: this.pendingProgram }),
      ...(this.pendingScan && { scan: this.pendingScan }) })
    this.pendingScan = undefined
    this.pendingProgram = []
  }

  private decide(previous: Position[]): void {
    const objective = this.scenario.objective
    const [player, ...opponents] = this.state.actors
    if (objective.kind === 'escape') {
      const caught = opponents.some((opponent, index) => (
        samePosition(player, opponent) || (samePosition(player, previous[index + 1]) && samePosition(opponent, previous[0]))
      ))
      if (caught) this.decision = { outcome: 'loss', reason: 'caught' }
      else if (samePosition(player, objective.exit) && objective.itemIds.every((id) => this.claims.get(id) === player.id)) {
        this.decision = { outcome: 'win', reason: 'escape' }
      } else if (this.state.turn >= this.scenario.maxTurns) {
        this.decision = { outcome: 'loss', reason: 'timeout' }
      }
      return
    }
    if (this.state.items.length && this.state.turn < this.scenario.maxTurns) return
    const bestOpponent = Math.max(...opponents.map(({ score }) => score))
    const outcome = player.score > bestOpponent ? 'win' : player.score === bestOpponent ? 'draw' : 'loss'
    this.decision = { outcome, reason: 'score' }
  }
}

export function observeArenaMaps(level: ArenaLevel): ArenaFrame[][] {
  return Array.from({ length: 1 + (level.variants?.length ?? 0) }, (_, index) => {
    const map = mapScenarioAt(level, index)
    const session = new ArenaSession(map)
    for (let turn = 0; turn < map.maxTurns; turn++) {
      if (session.advance('wait')?.decision) break
    }
    return session.frames
  })
}

export function runArena(level: ArenaLevel, source: string, personal?: PersonalAlgorithms, course?: PersonalAlgorithms,
  { recordScans = false, recordFlow = false }: { recordScans?: boolean; recordFlow?: boolean } = {}): ArenaResult {
  const modules = arenaModules(level, personal, course)
  const primary = new ArenaSession(level, recordScans, recordFlow)
  let { outcome, reason, issue } = primary.run(source, modules)
  let failure = outcome === 'win' ? undefined : primary.failure(issue)
  let passedCases = outcome === 'win' ? 1 : 0
  const variants = level.variants ?? []
  const variantFrames: ArenaFrame[][] = []
  const trailingScans = [primary.pendingScan]
  const trailingProgram = [primary.pendingProgram]
  const truncated = [primary.programTruncated]
  if (outcome === 'win') {
    for (let index = 1; index <= variants.length; index++) {
      const session = new ArenaSession(mapScenarioAt(level, index), recordScans, recordFlow)
      const alternate = session.run(source, modules)
      variantFrames.push(session.frames)
      trailingScans.push(session.pendingScan)
      trailingProgram.push(session.pendingProgram)
      truncated.push(session.programTruncated)
      if (alternate.outcome !== 'win') {
        outcome = alternate.outcome
        reason = alternate.reason
        issue = { code: 'variant', detail: String(passedCases + 1), line: alternate.issue?.line }
        failure = session.failure(alternate.issue)
        break
      }
      passedCases++
    }
  }
  return {
    won: outcome === 'win', outcome, reason, issue, passedCases,
    totalCases: variants.length + 1,
    frames: primary.frames,
    ...(variants.length && { variantFrames }),
    ...(trailingScans.some(Boolean) && { trailingScans }),
    ...(trailingProgram.some(events => events.length) && { trailingProgram }),
    ...(truncated.some(Boolean) && { programTruncated: truncated }),
    final: primary.state,
    ...(failure && { failure }),
  }
}
