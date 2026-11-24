import { breadthFirstReference } from '../shared/breadthFirstLesson'
import { blockingGridDevice } from '../shared/gridDevices'
import { mirrorGrid } from '../shared/laserTrial'
import type { Direction, GridLevel, GridSnapshot, MirrorPlacement, Position, RunIssue, RunResult } from '../shared/types'
import { runProgram } from './run'
import { initialSnapshot } from './snapshot'

export type MirrorRaceFrame = { turn: number; player: GridSnapshot; bot: GridSnapshot }
export type MirrorRaceOutcome = { kind: 'exit' | 'laser' | 'stopped' | 'noRoute'; turn: number; issue?: RunIssue }
type RunnerTrace = { states: GridSnapshot[]; outcome: MirrorRaceOutcome }

function shortestBotRoute(board: GridLevel, exit: Position): Direction[] | undefined {
  const start = board.start
  // Mirrors and the emitter are solid. Lit floor remains walkable when the bot plans its route.
  const tiles = board.tiles.map((row, y) => Array.from(row, (tile, x) =>
    blockingGridDevice(board, undefined, { x, y }) ? '#' : tile).join(''))
  const { path } = breadthFirstReference({ tiles, start: [start.x, start.y], goal: [exit.x, exit.y] })
  if (!path.length) return
  return path.slice(1).map(([x, y], i) => {
    const [previousX, previousY] = path[i]
    if (x !== previousX) return x > previousX ? 'right' : 'left'
    return y > previousY ? 'down' : 'up'
  })
}

const routeSource = (route: readonly Direction[]) => route.map(direction => 'move("' + direction + '")').join('\n')

function traceRunner(board: GridLevel, exit: Position, source: string): RunnerTrace & { run: RunResult } {
  const run = runProgram(board, source)
  const states = [initialSnapshot(board)]
  const outcome: MirrorRaceOutcome = { turn: run.final.turn, kind: 'stopped', issue: run.issue }
  for (const [index, frame] of run.frames.entries()) {
    const { state, issue } = frame
    states[state.turn] = state
    if (issue) {
      if (issue.code === 'laserHit') outcome.kind = 'laser'
      break
    }
    if (state.player.x === exit.x && state.player.y === exit.y) {
      // Arrival ends this runner's race, even if more cards were queued after reaching the exit.
      const finish: RunResult = { won: true, final: state, frames: run.frames.slice(0, index + 1), passedCases: 1, totalCases: 1 }
      return { states, outcome: { kind: 'exit', turn: state.turn }, run: finish }
    }
  }
  return { states, outcome, run }
}

export function runMirrorRace(level: GridLevel, mirrors: readonly MirrorPlacement[], commands: readonly Direction[] | string) {
  const board = mirrorGrid(level, mirrors)
  const exit = board.objectives.find(goal => goal.type === 'exit')!
  const player = traceRunner(board, exit, typeof commands === 'string' ? commands : routeSource(commands))
  const route = shortestBotRoute(board, exit)
  const bot: RunnerTrace = route ? traceRunner(board, exit, routeSource(route))
    : { states: [initialSnapshot(board)], outcome: { kind: 'noRoute', turn: 0 } }
  const end = Math.max(player.outcome.turn, bot.outcome.turn)
  const frames: MirrorRaceFrame[] = Array.from({ length: end + 1 }, (_, turn) => ({
    turn,
    player: player.states[Math.min(turn, player.states.length - 1)],
    bot: bot.states[Math.min(turn, bot.states.length - 1)],
  }))
  return {
    won: player.outcome.kind === 'exit' && bot.outcome.kind === 'laser',
    frames, playerOutcome: player.outcome, botOutcome: bot.outcome,
    playerRun: player.run,
  }
}

export type MirrorRaceResult = ReturnType<typeof runMirrorRace>
