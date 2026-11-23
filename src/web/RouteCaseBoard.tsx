import type { AlgorithmResult } from '../shared/advanced'
import { shortestRouteLength, walkRoute, type RouteMap } from '../shared/routeMap'
import type { Locale } from '../shared/types'
import { MapTiles } from './Board'
import { useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { tr } from './text'

export function RouteCaseBoard({ map, checked, locale, showTrail }: {
  map: RouteMap; checked?: AlgorithmResult['cases'][number]; locale: Locale; showTrail: boolean
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const route = checked?.actual === undefined ? undefined : walkRoute(map, checked.actual)
  const count = (route?.positions.length ?? 1) - 1
  const cursor = useReplayCursor(count, 510)
  const distance = shortestRouteLength(map)
  let feedback
  if (route?.error === 'blocked') feedback = t(`第 ${count + 1} 步被墙或边界挡住了。`, `Step ${count + 1} hits a wall or the map edge.`)
  else if (route?.error === 'list') feedback = t('函数需要交回一列方向。', 'Return a list of directions.')
  else if (route?.error === 'direction') feedback = t(`第 ${count + 1} 步没有给出有效方向。`, `Step ${count + 1} is not a direction.`)
  else if (route && !checked?.passed) feedback = t('沿着返回的方向走一遍，检查终点和步数。', 'Replay the directions and check the last square and the step count.')
  return <div className="route-case-board" data-testid="route-case-board">
    <MapTiles tiles={map.tiles} playerPosition={route?.positions[cursor.step] ?? map.start} exit={map.goal} opponents={[]} items={[]} locale={locale}
      trail={showTrail ? route?.positions.slice(0, cursor.step + 1) : undefined} />
    <p>{t('起点', 'Start')} ({map.start.x}, {map.start.y}) · {t('终点', 'Goal')} ({map.goal.x}, {map.goal.y})</p>
    <p>{distance === undefined ? t('终点不可达，返回空列表。', 'The goal cannot be reached. Return an empty list.')
      : t(`最短路线为 ${distance} 步。`, `A shortest route takes ${distance} ${distance === 1 ? 'step' : 'steps'}.`)}</p>
    <ReplayControls cursor={cursor} count={count} locale={locale} />
    {feedback && <p className="error-message">{feedback}</p>}
  </div>
}
