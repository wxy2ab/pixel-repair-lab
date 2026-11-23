import type { ReactNode } from 'react'
import type { ArenaEvent, ArenaFrame, ArenaLevel, ArenaResult, ArenaScan, ArenaSnapshot } from '../shared/advanced'
import type { Locale, Position } from '../shared/types'
import { MapTiles, type ArenaCellChange } from './Board'
import type { StationActivity } from './station3d/types'
import { TeachingScreen, CommandDesk } from './Classroom'
import { runIssueText, tr } from './text'
import './arena-dynamic.css'

export function actorTitle(level: ArenaLevel, locale: Locale, id: string) {
  return id === 'player' ? tr(locale, '芽芽', 'Sprout') : level.opponents.find(bot => bot.id === id)?.title[locale] ?? id
}

export function savedArenaTime(remainingMs: number | undefined, locale: Locale) {
  if (remainingMs === undefined) return tr(locale, '不限时', 'No timer')
  const seconds = (remainingMs / 1000).toFixed(1)
  return tr(locale, `${seconds} 秒`, `${seconds} s`)
}

export function SavedArenaScores({ level, scores, locale, numberOpponents = false }: {
  level: ArenaLevel; scores: readonly { id: string; score: number }[]; locale: Locale; numberOpponents?: boolean
}) {
  const label = tr(locale, '比分', 'Scores')
  return <div className="saved-arena-scores">
    <span>{label}</span>
    <ul aria-label={label}>
      {scores.map(({ id, score }, index) => <li key={id} data-actor-id={id}>
        {numberOpponents && id !== 'player' && <small className="saved-arena-opponent-number">{index}</small>}
        <span>{actorTitle(level, locale, id)}</span>
        <strong>{score}</strong>
      </li>)}
    </ul>
  </div>
}

export function describeEvent(event: ArenaEvent, locale: Locale, dynamic: boolean) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (event.action === 'pick') return event.itemId
    ? (dynamic ? t('取得电池', 'Picked up battery') : t('取得零件', 'Picked up part')) + ' · ' + event.itemId
    : dynamic ? t('没有拾到电池', 'No battery picked up') : t('本回合未取得零件', 'No part picked up')
  if (event.action === 'wait') return t('等待', 'Waited')
  const directions = { up: '上', down: '下', left: '左', right: '右' }
  if (event.blocked) return t('遇墙原地停留', 'Blocked by a wall')
  return event.direction ? t('向' + directions[event.direction] + '移动', 'Moved ' + event.direction) : t('移动', 'Moved')
}

export function arenaResultText(result: ArenaResult, locale: Locale, dynamic = false): string {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (result.issue) return runIssueText(locale, result.issue)
  if (dynamic && result.outcome === 'draw') return t('最高电池数并列，平局。', 'Draw. The highest battery count is tied.')
  if (dynamic && result.reason === 'score') return result.won
    ? t('你收集的电池最多，获胜！', 'You won with the most batteries!')
    : t('有对手收集了更多电池，挑战失败。', 'Defeat. A rival collected more batteries.')
  if (result.outcome === 'draw') return t('平局。试着更早抢到下一件零件。', 'Draw. Try reaching the next part sooner.')
  if (result.reason === 'escape') return t('成功带着零件撤离！', 'Escaped with the parts!')
  if (result.reason === 'caught') return t('被截住了。看看追踪机器人从哪里靠近。', 'Caught! Check how the tracking bots came toward you.')
  if (result.reason === 'timeout') return t('回合用完了。试着缩短路线。', 'Out of turns. Try a shorter route.')
  if (result.reason === 'score') return result.won ? t('你收集的零件最多，获胜！', 'You collected the most parts and won!') :
    t('有对手收集了更多零件。试着换个目标。', 'A rival collected more parts. Try a different target.')
  return t('目标还没有完成。', 'The goal is still incomplete.')
}

type ArenaShift = NonNullable<ArenaFrame['shift']>

function shiftChanges(shift: ArenaShift): ArenaCellChange[] {
  return [
    ...shift.opened.map(position => ({ position, state: 'opened' as const })),
    ...shift.closed.map(position => ({ position, state: 'closed' as const })),
    ...shift.blocked.map(position => ({ position, state: 'blocked' as const })),
    ...shift.relocated.map(({ to }) => ({ position: to, state: 'relocated' as const })),
  ]
}

const coordinates = ({ x, y }: Position) => `(${x}, ${y})`

function ArenaShiftReport({ shift, locale }: { shift: ArenaShift; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const gates = [
    { type: 'opened', places: shift.opened, label: t('通道打开', 'Passage opened') },
    { type: 'closed', places: shift.closed, label: t('通道关闭', 'Passage closed') },
    { type: 'blocked', places: shift.blocked, label: t('通道被占用，保持打开', 'Passage occupied and kept open') },
  ]
  return <div className="arena-shift-report" role="status" data-testid="arena-shift-result" data-shift-turn={shift.turn}>
    <h3>{t(`第 ${shift.turn} 回合的变化`, `Turn ${shift.turn} changes`)}</h3>
    <ul>
      {gates.flatMap(({ type, places, label }) => places.map(position => <li key={type + coordinates(position)}
        data-change={type} data-x={position.x} data-y={position.y}>
        <span className="arena-change-dot" aria-hidden="true" /><span>{label} <strong>{coordinates(position)}</strong></span>
      </li>))}
      {shift.relocated.map(({ id, from, to }) => <li key={id} data-change="relocated" data-item-id={id} data-x={to.x} data-y={to.y}>
        <span className="arena-change-dot" aria-hidden="true" />
        <span>{t('电池移位', 'Battery moved')} <strong>{id}</strong> <strong>{coordinates(from)} → {coordinates(to)}</strong></span>
      </li>)}
      {gates.every(({ places }) => places.length === 0) && shift.relocated.length === 0 &&
        <li>{t('通道和电池位置保持原样。', 'Passages and batteries stayed in place.')}</li>}
    </ul>
  </div>
}

function ArenaSensor({ scan, locale }: { scan: ArenaScan; locale: Locale }) {
  const { player, turn, opponents, items } = scan.value
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <p className="arena-sensor" data-testid="arena-sensor">
    <code>scan(){scan.count > 1 && ' × ' + scan.count}</code>{' · '}
    {t(`回合 ${turn} · 芽芽 (${player.join(', ')}) · 对手 ${opponents.length} · 待取物品 ${items.length}`,
      `Turn ${turn} · Sprout (${player.join(', ')}) · Rivals ${opponents.length} · Items left ${items.length}`)}
  </p>
}

export function ArenaBoard({ level, locale, snapshot, latestShift, finished, mapPicker, trail, activity, scan, children }: {
  level: ArenaLevel; locale: Locale; snapshot: ArenaSnapshot; latestShift?: ArenaShift; finished?: boolean; mapPicker?: ReactNode; children?: ReactNode
  trail?: readonly Position[]
  activity?: StationActivity; scan?: ArenaScan
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const dynamic = Boolean(level.shifts?.length)
  const next = finished ? undefined : level.shifts?.find(shift => shift.turn > snapshot.turn)?.turn
  return <section className="panel board-panel" data-testid={dynamic ? 'arena-dynamic-board' : undefined}>
    <TeachingScreen locale={locale} variant="monitor" title={t('回合现场', 'Match view')}>
      <div className="panel-heading"><h2>{t('对抗棋盘', 'Arena board')}</h2><span className="turn-display" data-testid="arena-turn">{t('回合', 'Turn')} {snapshot.turn}/{level.maxTurns}</span></div>
      {mapPicker}
      {next !== undefined && <p className="arena-shift-countdown" data-testid="arena-shift-countdown" data-next-turn={next} data-turns-remaining={next - snapshot.turn}>
        <strong>{t(`第 ${next} 回合变阵`, `Shift on turn ${next}`)}</strong><span>{t(`还剩 ${next - snapshot.turn} 回合`, `${next - snapshot.turn} turns to go`)}</span>
      </p>}
      <MapTiles location="arena" activity={activity} tiles={snapshot.tiles ?? level.tiles} exit={level.objective.kind === 'escape' ? level.objective.exit : undefined} items={snapshot.items} trail={trail}
        gates={level.shifts?.flatMap(shift => [...(shift.open ?? []), ...(shift.close ?? [])])}
        cellChanges={latestShift?.turn === snapshot.turn ? shiftChanges(latestShift) : undefined}
        batteries={dynamic} playerPosition={snapshot.actors[0]} opponents={snapshot.actors.slice(1).map((actor, index) =>
          ({ ...actor, label: String(index + 1), index, name: actorTitle(level, locale, actor.id) }))} locale={locale} />
      {scan && <ArenaSensor scan={scan} locale={locale} />}
      <ul className="scoreboard" aria-label={dynamic ? t('已收集电池数', 'Batteries collected') : t('对抗比分', 'Arena scores')}>
        {snapshot.actors.map((actor, index) => <li key={actor.id}>
          <span className={index ? 'score-rival' : 'score-you'}>{index || '●'}</span><span>{actorTitle(level, locale, actor.id)}</span><strong>{actor.score}</strong>
        </li>)}
      </ul>
      {latestShift && <ArenaShiftReport shift={latestShift} locale={locale} />}
    </TeachingScreen>
    {children && <CommandDesk locale={locale} title={t('对局控制', 'Match controls')}>{children}</CommandDesk>}
  </section>
}

export function ArenaStateReference({ locale, timed = false }: { locale: Locale; timed?: boolean }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <details className="arena-state-reference">
    <summary>{timed ? 'state' : 'scan()'} · {t('赛场数据', 'Arena data')}</summary>
    <dl>
      <dt><code>tiles</code></dt><dd>{t('当前地图：墙 #，空地 .', 'Current map: # wall, . floor')}</dd>
      <dt><code>player</code></dt><dd>{t('芽芽坐标 [x, y]', 'Sprout’s position [x, y]')}</dd>
      <dt><code>opponents</code></dt><dd>{t('对手的 id、x、y、score', 'Rivals’ id, x, y, score')}</dd>
      <dt><code>items</code></dt><dd>{t('场上电池的 id、x、y', 'Available batteries’ id, x, y')}</dd>
      <dt><code>playerScore</code></dt><dd>{t('芽芽已收集的电池数', 'Sprout’s battery count')}</dd>
      <dt><code>turn</code></dt><dd>{t('已结束的回合数', 'Completed turns')}</dd>
      <dt><code>nextShift</code></dt><dd>{t('下次变阵的回合，没有时为 None', 'Next shift’s turn, or None')}</dd>
    </dl>
  </details>
}

export function ArenaTurnEvents({ frame, level, locale }: { frame: ArenaFrame; level: ArenaLevel; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const dynamic = Boolean(level.shifts?.length)
  return <section className="panel teaching-panel" data-testid="arena-turn-events">
    <h2>{t('本回合动作', 'Actions this turn')}</h2>
    {frame.line > 0 && <p>{t('代码行', 'Line')} {frame.line}</p>}
    <ul className={'arena-events' + (dynamic ? ' arena-events--dynamic' : '')}>{frame.events.map(event => <li key={event.actorId}
      data-actor-id={event.actorId} data-tactic={event.tactic} data-target-id={event.targetId}>
      <strong>{actorTitle(level, locale, event.actorId)}</strong><span>{describeEvent(event, locale, dynamic)}</span>
      {event.tactic && <span className="arena-tactic">
        {event.tactic === 'secure' ? t('就近收集', 'Secure nearby') : t('争抢目标', 'Contest target')}
        {event.targetId && <strong> · {event.targetId}</strong>}
      </span>}
    </li>)}</ul>
  </section>
}
