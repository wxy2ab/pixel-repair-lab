import { useId, useState } from 'react'
import { runBreadthFirst } from '../engine/programBreadthFirst'
import { valuesEqual } from '../engine/values'
import type { BreadthCell, BreadthFirstResult } from '../shared/breadthFirstLesson'
import type { ProgramWalkthrough } from '../shared/programWalkthrough'
import type { Locale, RunIssue } from '../shared/types'
import { BreadthFirstBoard } from './BreadthFirstLesson'
import { BreadthFirstInstrument } from './BreadthFirstInstrument'
import { runIssueText, tr } from './text'
import './charge-prediction.css'
import './for-prediction.css'
import './breadth-first-prediction.css'

type Picks = { order?: number; path?: number }

function CellSequence({ cells, testId }: { cells: readonly BreadthCell[]; testId?: string }) {
  return <span className="breadth-prediction-sequence" data-testid={testId}>
    {cells.map(([x, y], index) => <span key={index} className="breadth-prediction-coordinate" data-x={x} data-y={y}>
      {index > 0 && <span className="breadth-prediction-arrow" aria-hidden="true">→</span>}({x}, {y})
    </span>)}
  </span>
}

export function BreadthFirstPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void
}) {
  const heading = useId()
  const [picks, setPicks] = useState<Picks>({})
  const [attempt, setAttempt] = useState<BreadthFirstResult>()
  const [problem, setProblem] = useState<RunIssue | true>()
  const practice = execution.breadthFirstLesson?.practice
  if (!practice) return null

  const t = (zh: string, en: string) => tr(locale, zh, en)
  const order = picks.order === undefined ? undefined : practice.predictions.orders[picks.order]
  const path = picks.path === undefined ? undefined : practice.predictions.paths[picks.path]
  const orderMatch = attempt && order !== undefined && valuesEqual(order, attempt.order)
  const pathMatch = attempt && path !== undefined && valuesEqual(path, attempt.path)
  const matched = attempt && orderMatch === true && pathMatch === true

  function choose(next: Picks) {
    setPicks(next)
    setAttempt(undefined)
    setProblem(undefined)
  }

  function verify() {
    if (!practice || order === undefined || path === undefined || attempt) return
    const { result, issue } = runBreadthFirst(execution.source, practice)
    if (issue || !result || result.path.length === 0) {
      setProblem(issue ?? true)
      return
    }
    setProblem(undefined)
    setAttempt(result)
    if (valuesEqual(order, result.order) && valuesEqual(path, result.path)) onComplete()
  }

  return <section className="panel breadth-first-prediction" aria-labelledby={heading}
    data-testid="breadth-first-prediction" data-match={matched}>
    <div className="panel-heading">
      <h2 id={heading}>{t('换张地图，先预测', 'Predict on a new map')}</h2>
    </div>
    <div className="charge-prediction-body">
      <p>{t('从芽芽所在的格子出发。检查邻格时按上、右、下、左的顺序，把能走且没访问过的格子放到队尾。',
        'Start at Sprout. Check neighbors in the order up, right, down, left. Add walkable, unvisited cells to the back of the queue.')}</p>
      <BreadthFirstInstrument map={practice} locale={locale} order={attempt?.order} path={attempt?.path} />
      <BreadthFirstBoard map={practice} locale={locale} testId="breadth-first-practice-map" />
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field" disabled={matched} data-prediction="order" data-match={orderMatch}>
          <legend>{t('格子按什么顺序出队？', 'In what order will cells leave the queue?')}</legend>
          <p className="breadth-prediction-note">{t('从第一格开始，数到电池所在的格子出队为止。',
            'Start at the first cell and stop when the battery’s cell leaves the queue.')}</p>
          <div className="breadth-prediction-choices">
            {practice.predictions.orders.map((option, index) => <button key={index} type="button"
              className="subtle-button" aria-pressed={picks.order === index} data-order-option={index}
              onClick={() => choose({ ...picks, order: index })}>
              <CellSequence cells={option} />
            </button>)}
          </div>
          {attempt && <p className="breadth-prediction-actual">
            {t('实际出队顺序', 'Actual dequeue order')}
            <CellSequence cells={attempt.order} testId="breadth-first-actual-order" />
          </p>}
          {orderMatch === false && <p className="for-prediction-hint">
            {t('每次只从队头取一格。新发现的邻格排在已经入队的格子后面。',
              'Always take a cell from the front. Newly found neighbors join after those already waiting.')}
          </p>}
        </fieldset>
        <fieldset className="for-prediction-field" disabled={matched} data-prediction="path" data-match={pathMatch}>
          <legend>{t('程序会返回哪条最短路线？', 'Which shortest route will the program return?')}</legend>
          <p className="breadth-prediction-note">{t('按芽芽到电池的顺序选一条路线。入队的先后会影响程序选哪条等长路线。',
            'Choose a route from Sprout to the battery. The order of adding neighbors decides between equally short routes.')}</p>
          <div className="breadth-prediction-choices">
            {practice.predictions.paths.map((option, index) => <button key={index} type="button"
              className="subtle-button" aria-pressed={picks.path === index} data-path-option={index}
              onClick={() => choose({ ...picks, path: index })}>
              <CellSequence cells={option} />
            </button>)}
          </div>
          {attempt && <p className="breadth-prediction-actual">
            {t('实际最短路线', 'Actual shortest route')}
            <CellSequence cells={attempt.path} testId="breadth-first-actual-path" />
          </p>}
          {pathMatch === false && <p className="for-prediction-hint">
            {t('一个格子第一次入队时就记下了它从哪一格来。沿这些记录从电池倒着找，就能还原程序选中的路线。',
              'Each cell remembers where it came from when it first joins the queue. Follow those records back from the battery to see the chosen route.')}
          </p>}
        </fieldset>
      </div>
      <button className="primary-button charge-prediction-verify" type="button" onClick={verify}
        disabled={order === undefined || path === undefined || !!attempt}>
        {t('运行验证', 'Run to check')}
      </button>
      {problem && <p className="error-message" role="alert">{problem === true
        ? t('程序没有返回可以核对的路线。请再运行一次。', 'The program did not return a route to check. Run it again.')
        : runIssueText(locale, problem)}</p>}
      {attempt && <div className="charge-prediction-verification breadth-prediction-result" data-match={matched}>
        <p role="status">{matched ? t('搜索顺序和最短路线都猜对了！', 'You predicted the search order and the shortest route!')
          : t('对照实际出队顺序和路线，再试一次。', 'Compare the actual dequeue order and route, then try again.')}</p>
        <div className="breadth-prediction-route-map">
          <p>{t('地图上的路线', 'Route on the map')} <strong data-testid="breadth-first-actual-distance">
            {t((attempt.path.length - 1) + ' 步', attempt.path.length === 2 ? '1 move' : (attempt.path.length - 1) + ' moves')}
          </strong></p>
          <BreadthFirstBoard map={practice} locale={locale} path={attempt.path} order={attempt.order} testId="breadth-first-actual-map" />
          <p className="breadth-prediction-note">{t('绿色表示路线。格角的数字表示出队的先后。',
            'Green marks the route. The corner numbers show when each cell left the queue.')}</p>
        </div>
        {!matched && <button className="subtle-button" type="button" onClick={() => choose({
          order: orderMatch ? picks.order : undefined,
          path: pathMatch ? picks.path : undefined,
        })}>{t('再猜一次', 'Predict again')}</button>}
      </div>}
    </div>
  </section>
}
