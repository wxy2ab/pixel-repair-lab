import { sameBreadthCell, walkableBreadthCell, type BreadthCell, type BreadthFirstMap, type BreadthFirstResult } from '../shared/breadthFirstLesson'
import { nestedRowsMatch, programSourceLines } from '../shared/programWalkthrough'
import type { Json, RunIssue } from '../shared/types'
import { ProgramError, PythonProgram, type PythonTraceFrame } from './python'
import { Values } from './values'

const FIND_ROUTE = 'find_battery_route'
const MAX_SIDE = 6

type BreadthVisit = { cell: BreadthCell; depth: number; parent?: BreadthCell }
type SkipReason = 'wall' | 'visited' | 'edge'

export type BreadthFirstStep = {
  kind: 'start' | 'visit' | 'skip' | 'enqueue' | 'goal' | 'path' | 'return'
  line: number
  code: string
  queue: BreadthCell[]
  visited: BreadthVisit[]
  order: BreadthCell[]
  current?: BreadthCell
  neighbor?: BreadthCell
  reason?: SkipReason
  path: BreadthCell[]
}

type BreadthFirstRun = { steps: BreadthFirstStep[]; result?: BreadthFirstResult; issue?: RunIssue }

function isInteger(value: Json | undefined): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function readCell(value: Json | undefined): BreadthCell | undefined {
  if (Array.isArray(value) && value.length === 2 && isInteger(value[0]) && isInteger(value[1])) {
    return [value[0], value[1]]
  }
}

function readCells(value: Json | undefined): BreadthCell[] | undefined {
  if (!Array.isArray(value)) return
  const cells: BreadthCell[] = []
  for (const entry of value) {
    const cell = readCell(entry)
    if (!cell) return
    cells.push(cell)
  }
  return cells
}

function readKey(value: Json | undefined, key: number) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value[String(key)] : undefined
}

export function runBreadthFirst(source: string, { tiles, start, goal }: BreadthFirstMap): BreadthFirstRun {
  const steps: BreadthFirstStep[] = []
  const width = tiles[0]?.length ?? 0
  if (tiles.length > MAX_SIDE || width > MAX_SIDE) return { steps, issue: { code: 'limit' } }
  if (!width || tiles.some(row => row.length !== width || /[^.#]/u.test(row))
    || !readCell(start) || !readCell(goal) || !walkableBreadthCell(tiles, start) || !walkableBreadthCell(tiles, goal)) {
    return { steps, issue: { code: 'type', detail: FIND_ROUTE } }
  }

  const lines = programSourceLines(source)
  const assignmentLines = new Map<string, string>()
  const explainedSkips = new Set<SkipReason>()
  const address = ([x, y]: BreadthCell) => y * width + x
  let candidate: BreadthCell | undefined
  let goalCheck: string | undefined
  let result: BreadthFirstResult | undefined

  function trace(frame: PythonTraceFrame) {
    if (frame.line === undefined) return
    const code = lines[frame.line - 1]
    if (code === undefined) return
    const location = { line: frame.line, code }
    const previous = steps.at(-1)
    const invalid = () => new ProgramError({ code: 'internal', line: frame.line })
    const scope = frame.stack.at(-1)
    const read = (name: string) => scope?.values.find(binding => binding.name === name)?.value
    const display = (...keys: string[]) => [...keys.map(key => assignmentLines.get(key)), code].filter(Boolean).join('\n')

    if (frame.kind === 'return' && frame.name === FIND_ROUTE) {
      if (!previous || !Array.isArray(frame.value) || frame.value.length !== 2) throw invalid()
      const order = readCells(frame.value[0])
      const path = readCells(frame.value[1])
      if (!order || !path || !nestedRowsMatch(order, previous.order) || !nestedRowsMatch(path, previous.path)
        || (path.length ? !sameBreadthCell(path[0], start) : previous.queue.length !== 0)) throw invalid()
      const { queue, visited, current } = previous
      steps.push({ ...location, kind: 'return', queue, visited, current, order, path })
      result = { order, path }
      return
    }
    if (scope?.name !== FIND_ROUTE) return

    if (frame.kind === 'assign') {
      const name = frame.name
      if (name) assignmentLines.set(name, code)
      if (!previous && name === 'order') {
        const queue = readCells(read('queue'))
        const depth = readKey(read('distance'), address(start))
        if (!queue || !nestedRowsMatch(queue, [start]) || depth !== 0) throw invalid()
        const setup = [assignmentLines.get('queue'), assignmentLines.get('distance')].filter(Boolean).join('\n')
        steps.push({ ...location, code: setup, kind: 'start', queue, visited: [{ cell: start, depth }], order: [], path: [] })
      } else if (name === 'y') {
        candidate = readCell([read('x') ?? null, read('y') ?? null])
      } else if (previous && name === 'path') {
        const path = readCells(frame.value)
        if (previous.kind !== 'visit' || !sameBreadthCell(previous.current, goal) || !path || !nestedRowsMatch(path, [goal])) throw invalid()
        steps[steps.length - 1] = { ...previous, code: [previous.code, goalCheck, code].filter(Boolean).join('\n'), kind: 'goal', path }
      }
      return
    }
    if (!previous) return
    const { queue, order, visited, current, path } = previous
    const state = { ...location, queue, order, visited, current, path }

    if (frame.kind === 'branch' && previous.kind === 'visit' && sameBreadthCell(current, goal)) {
      goalCheck = code
    } else if (frame.kind === 'branch' && candidate) {
      const [x, y] = candidate
      const reason = x < 0 || x >= width || y < 0 || y >= tiles.length ? 'edge'
        : !walkableBreadthCell(tiles, candidate) ? 'wall'
          : visited.some(({ cell }) => sameBreadthCell(cell, candidate)) ? 'visited' : undefined
      if (reason) {
        if (!explainedSkips.has(reason)) steps.push({ ...state, kind: 'skip', neighbor: candidate, reason })
        explainedSkips.add(reason)
        candidate = undefined
      }
    } else if (frame.kind === 'append' && frame.name === 'order') {
      const cell = readCell(frame.value)
      const nextQueue = readCells(read('queue'))
      const nextOrder = readCells(read('order'))
      if (!cell || !sameBreadthCell(cell, queue[0]) || !nextQueue || !nextOrder
        || !nestedRowsMatch(nextQueue, queue.slice(1)) || !nestedRowsMatch(nextOrder, [...order, cell])) throw invalid()
      steps.push({ ...state, code: display('cell'), kind: 'visit', current: cell, queue: nextQueue, order: nextOrder })
      candidate = undefined
    } else if (frame.kind === 'append' && frame.name === 'queue') {
      const neighbor = readCell(frame.value)
      const nextQueue = readCells(read('queue'))
      if (!neighbor || !sameBreadthCell(neighbor, candidate) || !walkableBreadthCell(tiles, neighbor)
        || visited.some(({ cell }) => sameBreadthCell(cell, neighbor)) || !nextQueue
        || !nestedRowsMatch(nextQueue, [...queue, neighbor])) throw invalid()
      const depth = readKey(read('distance'), address(neighbor))
      const parent = readCell(readKey(read('parent'), address(neighbor)))
      const base = visited.find(({ cell }) => sameBreadthCell(cell, current))
      if (!isInteger(depth) || !parent || !base || depth !== base.depth + 1 || !sameBreadthCell(parent, current)) throw invalid()
      steps.push({ ...state, code: display('distance[key]', 'parent[key]'), kind: 'enqueue', neighbor, queue: nextQueue,
        visited: [...visited, { cell: neighbor, depth, parent }] })
      candidate = undefined
    } else if (frame.kind === 'insert' && frame.name === 'path') {
      const predecessor = readCell(frame.value)
      const nextPath = readCells(read('path'))
      const expected = visited.find(({ cell }) => sameBreadthCell(cell, path[0]))?.parent
      if (!predecessor || !sameBreadthCell(predecessor, expected) || !nextPath
        || !nestedRowsMatch(nextPath, [predecessor, ...path])) throw invalid()
      steps.push({ ...state, code: display('cell'), kind: 'path', current: predecessor, path: nextPath })
    }
  }

  try {
    const values = new Values()
    const python = new PythonProgram(lines.join('\n'), values, (name, _args, line) => {
      throw new ProgramError({ code: 'apiDisabled', line, detail: name })
    }, { stepBudget: 20_000, trace, traceForLoops: true, traceBranches: true, traceListEdits: true })
    python.runPureFunction(FIND_ROUTE, [values.fromJson(tiles), values.fromJson(start), values.fromJson(goal)])
    return result ? { steps, result } : { steps, issue: { code: 'internal' } }
  } catch (error) {
    return { steps, issue: error instanceof ProgramError ? error.issue : { code: 'internal' } }
  }
}
