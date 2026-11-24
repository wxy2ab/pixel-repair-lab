import { breadthFirstReference } from '../shared/breadthFirstLesson'
import { ferryGrid } from '../shared/ferry'
import type { FerryCommand, FerryRaceLayout, GridLevel, GridSnapshot, Position, RunIssue } from '../shared/types'
import { runProgram } from './run'
import { initialSnapshot } from './snapshot'

export type FerryRaceFrame = { turn: number; player: GridSnapshot; bot: GridSnapshot }

function routeBetween(tiles: string[], from: Position, to: Position): FerryCommand[] | undefined {
  const { path } = breadthFirstReference({ tiles, start: [from.x, from.y], goal: [to.x, to.y] })
  if (!path.length) return
  return path.slice(1).map(([x, y], i) => {
    const [lastX, lastY] = path[i]
    if (x !== lastX) return x > lastX ? 'right' : 'left'
    return y > lastY ? 'down' : 'up'
  })
}

function nearestBatteryProgram(board: GridLevel, dock: Position): FerryCommand[] {
  const remaining = [...(board.items ?? [])]
  const commands: FerryCommand[] = []
  let from = board.start
  while (remaining.length) {
    const choices = remaining.map((item, index) => ({ index, route: routeBetween(board.tiles, from, item) }))
    // Stable sorting gives battery A priority for equal walking distances.
    const closest = choices.filter(choice => choice.route !== undefined)
      .sort((a, b) => a.route!.length - b.route!.length)[0]
    if (!closest?.route) return commands
    commands.push(...closest.route, 'pick')
    from = remaining.splice(closest.index, 1)[0]
  }
  return commands.concat(routeBetween(board.tiles, from, dock) ?? [])
}

function raceSource(commands: readonly FerryCommand[]) {
  return commands.map(command => command === 'pick' || command === 'wait'
    ? command + '()' : 'move("' + command + '")').join('\n')
}

function traceRunner(board: GridLevel, dock: Position, source: string) {
  const result = runProgram(board, source)
  const states = [initialSnapshot(board)]
  let arrival: number | undefined
  let stopped: { turn: number; issue: RunIssue } | undefined
  for (const { state, issue } of result.frames) {
    if (issue) {
      stopped = { turn: state.turn + 1, issue }
      break
    }
    states[state.turn] = state
    if (!state.items.length && state.player.x === dock.x && state.player.y === dock.y) {
      arrival = state.turn
      break
    }
  }
  return { states, arrival, stopped, result }
}

/** The routes share terrain and departure time; each robot collects its own copy of the cargo. */
export function runFerryRace(level: GridLevel, layout: FerryRaceLayout, commands: readonly FerryCommand[] | string) {
  const deadline = level.turnLimit!
  // Keep tracing beyond departure to measure lateness. The synchronized replay stops at the boat.
  const board: GridLevel = { ...ferryGrid(level, layout), turnLimit: undefined, variants: undefined }
  const dock = board.objectives.find(goal => goal.type === 'exit')!
  const player = traceRunner(board, dock, typeof commands === 'string' ? commands : raceSource(commands))
  const bot = traceRunner(board, dock, raceSource(nearestBatteryProgram(board, dock)))
  const lastTurn = Math.min(deadline, Math.max(player.arrival ?? deadline, bot.arrival ?? deadline))
  const frames: FerryRaceFrame[] = Array.from({ length: lastTurn + 1 }, (_, turn) => ({
    turn,
    player: player.states[Math.min(turn, player.states.length - 1)],
    bot: bot.states[Math.min(turn, bot.states.length - 1)],
  }))
  return {
    won: player.arrival !== undefined && player.arrival <= deadline && (bot.arrival === undefined || bot.arrival > deadline),
    frames, deadline, playerArrival: player.arrival, botArrival: bot.arrival, playerStop: player.stopped,
    playerRun: player.result,
  }
}

export type FerryRaceResult = ReturnType<typeof runFerryRace>
