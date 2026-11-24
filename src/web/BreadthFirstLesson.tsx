import { CodingDevice } from './CodingDevice'
import { useId, useMemo, useState, type CSSProperties } from 'react'
import { runBreadthFirst, type BreadthFirstStep } from '../engine/programBreadthFirst'
import { sameBreadthCell as sameCell, type BreadthCell, type BreadthFirstMap } from '../shared/breadthFirstLesson'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { Robot } from './Board'
import { BreadthFirstInstrument, type SearchMark } from './BreadthFirstInstrument'
import { StepExplanation } from './LessonNotes'
import { runIssueText, tr } from './text'
import './breadth-first-lesson.css'

type Translate = (zh: string, en: string) => string
type Visited = BreadthFirstStep['visited']

const at = ([x, y]: BreadthCell) => `(${x}, ${y})`

function searchMark(step: BreadthFirstStep | undefined, map: BreadthFirstMap, t: Translate): SearchMark {
  if (!step) return { cell: map.start, label: t('起点', 'Start') }
  if (step.kind === 'return') return { cell: step.path.length ? map.goal : map.start,
    label: step.path.length ? t(`${step.path.length - 1} 步`, `${step.path.length - 1} moves`) : t('无路', 'No route') }
  const here = step.current ?? map.start
  if (step.kind === 'start') return { cell: map.start, label: t('入队', 'Enqueue') }
  if (step.kind === 'visit') return { cell: here, label: t('出队', 'Dequeue') }
  if (step.kind === 'goal') return { cell: here, label: t('找到', 'Found') }
  const from = step.kind === 'path' ? step.path[1] : here
  const to = step.kind === 'path' ? step.path[0] : step.neighbor
  if (!from || !to) return { cell: here, label: t('检查', 'Check') }
  const arrow = to[0] > from[0] ? '→' : to[0] < from[0] ? '←' : to[1] > from[1] ? '↓' : '↑'
  switch (step.kind) {
    case 'path': return { from, cell: to, arrow, label: t('回溯', 'Trace back') }
    case 'enqueue': return { from, cell: to, arrow, label: t('入队', 'Enqueue') }
    case 'skip':
      if (step.reason === 'edge') return { from, cell: here, arrow, label: t('越界', 'Edge') }
      return { from, cell: to, arrow, label: step.reason === 'wall' ? t('墙', 'Wall') : t('已标记', 'Seen') }
  }
}

export function BreadthFirstBoard({ map, locale, path = [], order = [], visited = [], queue = [], current, neighbor, mark, onCellClick,
  testId = 'breadth-first-map' }: {
  map: BreadthFirstMap; locale: Locale; path?: readonly BreadthCell[]; order?: readonly BreadthCell[];
  visited?: readonly Visited[number][]; queue?: readonly BreadthCell[]; current?: BreadthCell; neighbor?: BreadthCell;
  mark?: SearchMark; onCellClick?: (cell: BreadthCell) => void; testId?: string;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  return <div className="bfs-map" data-testid={testId} aria-label={t('维修站地图', 'Repair station map')}
    role="group" style={{ '--bfs-columns': map.tiles[0]?.length ?? 1 } as CSSProperties}>
    {map.tiles.flatMap((row, y) => [...row].map((tile, x) => {
      const cell: BreadthCell = [x, y]
      const key = `${x}-${y}`
      const isStart = sameCell(cell, map.start)
      const isGoal = sameCell(cell, map.goal)
      const isWall = tile === '#'
      const isCurrent = sameCell(cell, current)
      const depth = visited.find(entry => sameCell(cell, entry.cell))?.depth
      const isQueued = queue.some(queued => sameCell(cell, queued))
      const pathIndex = path.findIndex(item => sameCell(cell, item))
      const searchIndex = order.findIndex(item => sameCell(cell, item))
      const action = sameCell(cell, mark?.cell) ? mark?.label : undefined
      const arrow = sameCell(cell, mark?.from) ? mark?.arrow : undefined
      const label = [t(`格子 ${at(cell)}`, `Cell ${at(cell)}`)]
      if (isStart) label.push(t('芽芽的起点', 'Sprout’s start'))
      if (isGoal) label.push(t('电池', 'Battery'))
      if (isWall) label.push(t('墙', 'Wall'))
      if (depth !== undefined) label.push(t(`已访问，离起点 ${depth} 步`, `Visited, ${depth} moves from start`))
      if (isCurrent) label.push(t('正在处理', 'Processing now'))
      if (isQueued) label.push(t('在队列中', 'In the queue'))
      if (searchIndex >= 0) label.push(t(`搜索顺序第 ${searchIndex + 1} 格`, `Search order ${searchIndex + 1}`))
      if (pathIndex >= 0) label.push(t('在路线中', 'On the route'))
      if (action) label.push(action)

      const attributes = {
        className: 'bfs-cell',
        'data-testid': testId === 'breadth-first-map' ? `bfs-cell-${key}` : undefined,
        'data-x': x,
        'data-y': y,
        'data-wall': isWall || undefined,
        'data-depth': depth,
        'data-visited': depth !== undefined || undefined,
        'data-queued': isQueued || undefined,
        'data-current': isCurrent || undefined,
        'data-neighbor': sameCell(cell, neighbor) || undefined,
        'data-on-path': pathIndex >= 0 || undefined,
        'data-order': searchIndex >= 0 ? searchIndex + 1 : undefined,
        'aria-label': label.join(locale === 'zh' ? '，' : ', '),
      }
      const face = <>
        <small className="bfs-cell-position" aria-hidden="true">{at(cell)}</small>
        {isStart && <Robot />}
        {isGoal && <span className="bfs-battery" aria-hidden="true">+</span>}
        {depth !== undefined && <strong className="bfs-cell-depth" aria-hidden="true">{depth}</strong>}
        {searchIndex >= 0 && visited.length === 0 && <strong className="bfs-cell-depth" aria-hidden="true">{searchIndex + 1}</strong>}
        {action && <b className="bfs-cell-action" aria-hidden="true">{action}</b>}
        {arrow && <i className="bfs-edge-arrow" key={arrow} data-direction={arrow} aria-hidden="true">{arrow}</i>}
      </>
      return onCellClick
        ? <button key={key} type="button" {...attributes} onClick={() => onCellClick(cell)}>{face}</button>
        : <div key={key} role="img" {...attributes}>{face}</div>
    }))}
  </div>
}

function actionLabel(next: BreadthFirstStep, t: Translate) {
  switch (next.kind) {
    case 'start': return t('开始搜索', 'Start the search')
    case 'visit':
    case 'goal': return t('取出队头', 'Take the queue head')
    case 'skip': return t('检查邻格', 'Check this neighbor')
    case 'path': return t('沿记录回溯', 'Follow the recorded parent')
    case 'return': return t('查看最短路线', 'See the shortest route')
  }
}

function stepDescription(step: BreadthFirstStep | undefined, depth: number | undefined, t: Translate): string {
  if (!step) return t('每次可以向上下左右走一格。先从芽芽的起点开始搜索。',
    'You can move one tile up, right, down, or left. Start the search at Sprout’s tile.')
  switch (step.kind) {
    case 'start': return t('把起点放进队列，同时标为已访问。它在第 0 层，离起点 0 步。',
      'Put the start in the queue and mark it visited. It is in layer 0, zero moves from the start.')
    case 'visit':
      if (!step.current) return t('取出队头的格子，检查它的邻格。', 'Take the front tile and check its neighbors.')
      return t(`取出队头 ${at(step.current)}。它在第 ${depth} 层，现在检查它周围的邻格。`,
        `Take ${at(step.current)} from the front. It is in layer ${depth}. Check its neighbors now.`)
    case 'skip': {
      const spot = step.neighbor ? at(step.neighbor) : ''
      if (step.reason === 'edge') return t(`${spot} 在地图边界外，不能走，跳过它。`,
        `${spot} is beyond the edge of the map. Skip it.`)
      if (step.reason === 'wall') return t(`${spot} 是墙，不能走，跳过它。`, `${spot} is a wall. Skip it.`)
      return t(`${spot} 已经标记过了。即使还在队列里，也不用再加一次。`,
        `${spot} was already marked. Even if it is still in the queue, there is no need to add it again.`)
    }
    case 'enqueue':
      if (!step.neighbor || !step.current) return t('把邻格放到队尾，同时标为已访问。',
        'Add the neighbor at the back and mark it visited.')
      return t(`${at(step.neighbor)} 入队时就标为已访问，并记下上一格 ${at(step.current)}。它比当前格多走一步。`,
        `Mark ${at(step.neighbor)} visited as it joins the back of the queue. Record ${at(step.current)} as its previous tile. It is one move farther away.`)
    case 'goal':
      return t('电池到了队头。队列按离起点的步数一层层处理，每走一格都算一步，所以这是最少步数。',
        'The battery is at the front. The queue processes one distance layer at a time. Each move costs one step, so this is the fewest moves.')
    case 'path':
      return t(`记录显示 ${at(step.path[1])} 是从 ${at(step.path[0])} 走来的。把上一格加到路线前面。`,
        `The record shows that ${at(step.path[1])} came from ${at(step.path[0])}. Add the previous tile at the front of the route.`)
    case 'return':
      return step.path.length > 0
        ? t(`芽芽到电池的最短路线一共 ${step.path.length - 1} 步。`,
          `Sprout’s shortest route to the battery takes ${step.path.length - 1} moves.`)
        : t('队列已经空了，没有找到通往电池的路线。', 'The queue is empty. No route to the battery was found.')
  }
}

function Queue({ step, t }: { step: BreadthFirstStep | undefined; t: Translate }) {
  return <div className="bfs-queue-panel">
    <h3>{t('待处理队列', 'Queue to process')}</h3>
    <ol className="bfs-queue" aria-label={t('待处理队列', 'Queue to process')} data-testid="breadth-first-queue">
      {(step?.queue ?? []).map((cell, index, queue) => {
        const depth = step?.visited.find(entry => sameCell(cell, entry.cell))?.depth
        const isHead = index === 0
        return <li key={at(cell)} data-x={cell[0]} data-y={cell[1]} data-depth={depth} data-head={isHead || undefined}
          data-tail={index === queue.length - 1 || undefined} data-added={((step?.kind === 'start' || step?.kind === 'enqueue') && index === queue.length - 1) || undefined}>
          <small>{isHead ? t('队头', 'Front') : index === queue.length - 1 ? t('队尾', 'Back') : ' '}</small>
          <span><code>{at(cell)}</code><strong aria-label={t(`离起点 ${depth} 步`, `${depth} moves from start`)}>{depth}</strong></span>
        </li>
      })}
    </ol>
    {!step?.queue.length && <p>{t('队列为空', 'The queue is empty')}</p>}
  </div>
}

export function BreadthFirstLesson({ execution, locale, onReady }: {
  execution: ProgramWalkthrough; locale: Locale; onReady: () => void;
}) {
  const t: Translate = (zh, en) => tr(locale, zh, en)
  const heading = useId()
  const map = execution.breadthFirstLesson?.demo
  const trial = useMemo(() => map ? runBreadthFirst(execution.source, map) : undefined, [map, execution.source])
  const [position, setPosition] = useState(-1)
  const [hint, setHint] = useState<'wall' | 'visited' | 'direction' | 'adjacent'>()
  if (!map || !trial) return null

  const step = trial.steps[position]
  const mark = searchMark(step, map, t)
  const next = trial.steps[position + 1]
  const target = next?.kind === 'enqueue' ? next.neighbor : undefined
  const depth = step?.visited.find(entry => sameCell(entry.cell, step.current))?.depth
  const action = next && (target ? undefined : actionLabel(next, t))
  // For an edge check the candidate is outside the table; the current tile remains the touch target.
  const nextTile = next?.kind === 'skip' && next.reason === 'edge' ? next.current : next?.neighbor ?? next?.current ?? map.start

  function goTo(index: number) {
    setHint(undefined)
    setPosition(index)
    if (trial?.steps[index]?.kind === 'return' && trial.result?.path.length && !trial.issue) onReady()
  }

  function pick(cell: BreadthCell) {
    if (!target || !map) return
    if (sameCell(cell, target)) {
      goTo(position + 1)
      return
    }
    if (map.tiles[cell[1]][cell[0]] === '#') setHint('wall')
    else if (step?.visited.some(entry => sameCell(cell, entry.cell))) setHint('visited')
    else if (next?.current && Math.abs(cell[0] - next.current[0]) + Math.abs(cell[1] - next.current[1]) !== 1) setHint('adjacent')
    else setHint('direction')
  }

  return <section className="classroom-demonstration panel bfs-lesson" aria-labelledby={heading} data-testid="breadth-first-lesson">
    <CodingDevice device="navigator" locale={locale} controls={<>
      {target && <p className="bfs-pick">{t('点一个新邻格入队', 'Pick the next unvisited neighbor')}</p>}
      {hint && <p className="bfs-hint" role="status" data-testid="breadth-first-hint">{
        hint === 'wall' ? t('这格是墙，试试能走的邻格。', 'That tile is a wall. Try an open neighbor.')
          : hint === 'visited' ? t('这格已经访问过了，找一格新邻格。', 'That tile was already visited. Look for a new neighbor.')
            : hint === 'adjacent' ? t('只能点当前格上下左右相邻的一格。', 'Pick a tile directly next to the current one.')
              : t('还有一个邻格要先检查。按上、右、下、左的顺序试试。', 'Another neighbor comes first. Check up, right, down, then left.')
      }</p>}
      <div className="bfs-controls">
        <button type="button" className="subtle-button" disabled={position < 0} onClick={() => goTo(position - 1)}>
          {t('上一步', 'Previous step')}
        </button>
        {action && <button type="button" className="primary-button" onClick={() => goTo(position + 1)}>{action}</button>}
        {step?.kind === 'return' && <button type="button" className="subtle-button" onClick={() => goTo(-1)}>
          {t('重新搜索', 'Search again')}
        </button>}
      </div>
    </>}>
      <div className="panel-heading"><h2 id={heading}>{t('帮芽芽找到电池', 'Help Sprout find the battery')}</h2></div>
      <div className="bfs-body">
        <div className="bfs-order-key">{t('检查顺序', 'Check order')}
          <b aria-label={t('上、右、下、左', 'Up, right, down, left')}>↑ → ↓ ←</b>
        </div>
        <BreadthFirstInstrument map={map} locale={locale} step={step} mark={mark} onCell={cell => {
          if (target) pick(cell)
          else if (next && sameCell(cell, nextTile)) goTo(position + 1)
        }} />
        <div className="bfs-step" data-testid="breadth-first-step" data-kind={step?.kind ?? 'ready'}
          data-line={step?.line} data-depth={depth} data-reason={step?.reason} data-next-kind={next?.kind}
          data-x={step?.neighbor?.[0] ?? step?.current?.[0]} data-y={step?.neighbor?.[1] ?? step?.current?.[1]}>
          {step && <pre data-testid="breadth-first-code" aria-label={t('正在执行的 Python', 'Current Python code')}><code>{step.code}</code></pre>}
          {step?.kind === 'return' ? <p role="status" data-testid="breadth-first-result">{stepDescription(step, depth, t)}</p>
            : <StepExplanation locale={locale}>{stepDescription(step, depth, t)}</StepExplanation>}
        </div>
        <div className="bfs-workspace">
          <div className="bfs-map-panel">
            <BreadthFirstBoard map={map} locale={locale} queue={step?.queue} visited={step?.visited} current={step?.current}
              neighbor={step?.neighbor} path={step?.path} mark={mark} onCellClick={target ? pick : undefined} />
            <div className="bfs-legend">
              <span><i className="bfs-key-wall" />{t('墙', 'Wall')}</span>
              <span><i className="bfs-key-pending" />{t('在队列中', 'Queued')}</span>
              <span><b>0, 1…</b>{t('距起点的步数', 'Moves from start')}</span>
            </div>
          </div>
          <Queue step={step} t={t} />
        </div>
        {trial.issue && <p className="error-message" role="alert">{runIssueText(locale, trial.issue)}</p>}
      </div>
    </CodingDevice>
  </section>
}
