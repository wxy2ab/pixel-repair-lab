import { memo, type ReactNode } from 'react'
import type { ArenaEvent, ArenaFrame, ArenaLevel, ArenaResult, ArenaScan, ArenaSnapshot } from '../shared/advanced'
import type { Locale, Position } from '../shared/types'
import { MapTiles, type ArenaCellChange } from './Board'
import { useArenaMapMode } from './ArenaMapMode'
import { arenaMapTargets } from './station3d/mapTargets'
import { arenaGateCells } from './arenaGates'
import { arenaHudSnapshot, type ArenaTurnPresentation } from './useArenaTurnPresentation'
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

export function describeEvent(event: ArenaEvent, locale: Locale, dynamic: boolean, level?: ArenaLevel, showHit = true) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const directions = { up: '上', down: '下', left: '左', right: '右' }
  if (event.action === 'guard') return t('展开防护', 'Raised guard')
  if (event.action === 'shoot') {
    const shot = t('向' + (event.direction ? directions[event.direction] : '') + '发射', 'Fired ' + (event.direction ?? ''))
    if (!showHit) return shot
    if (!event.targetId) return shot + ' · ' + t('未命中', 'Miss')
    const target = level ? actorTitle(level, locale, event.targetId) : event.targetId
    const loss = event.damage ? t(`生命 −${event.damage}`, `HP −${event.damage}`) : undefined
    const absorbed = event.absorbed ? t(`挡下 ${event.absorbed}`, `Blocked ${event.absorbed}`) : undefined
    return [shot, target, loss, absorbed].filter(Boolean).join(' · ')
  }
  if (event.buff) return event.buff === 'power' ? t('拾取强化芯片', 'Picked up a power chip') : t('拾取护盾芯片', 'Picked up a shield chip')
  if (event.action === 'pick' && level?.combat?.switches?.some(control => control.itemId === event.itemId)) {
    const opened = event.opened?.map(coordinates).join(' · ')
    return opened ? t(`开关启动 · 打开 ${opened}`, `Switch activated · opened ${opened}`) : t('开关启动', 'Switch activated')
  }
  if (event.action === 'pick' && level?.combat) return event.itemId ? t('取得道具', 'Picked up item') + ' · ' + event.itemId : t('没有拾到道具', 'No item picked up')
  if (event.action === 'pick') return event.itemId
    ? (dynamic ? t('取得电池', 'Picked up battery') : t('取得零件', 'Picked up part')) + ' · ' + event.itemId
    : dynamic ? t('没有拾到电池', 'No battery picked up') : t('本回合未取得零件', 'No part picked up')
  if (event.action === 'wait') return t('等待', 'Waited')
  if (event.blocked) return level?.combat ? t('前方受阻，留在原格', 'Blocked, stayed in place') : t('遇墙原地停留', 'Blocked by a wall')
  return event.direction ? t('向' + directions[event.direction] + '移动', 'Moved ' + event.direction) : t('移动', 'Moved')
}

export function arenaResultText(result: ArenaResult, locale: Locale, dynamic = false): string {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (result.issue) return runIssueText(locale, result.issue)
  if (result.reason === 'disabled') return result.outcome === 'draw' ? t('双方同时停机，平局。', 'Both sides powered down together. Draw.')
    : t('芽芽的生命耗尽，已停机。', 'Sprout powered down after running out of HP.')
  if (result.reason === 'eliminate') return t('所有对手机器人都已停机，获胜！', 'All rival robots are offline. You won!')
  if (result.reason === 'collect') return t('指定道具已收齐，获胜！', 'All target items collected. You won!')
  if (result.reason === 'score' && result.final.actors[0].hp !== undefined) {
    if (result.outcome === 'draw') return t('最高得分并列，平局。', 'The top scores are tied. Draw.')
    return result.won ? t('芽芽得分最高，获胜！', 'Sprout won with the highest score!') : t('对手得分领先。', 'A rival finished with a higher score.')
  }
  if (dynamic && result.outcome === 'draw') return t('最高电池数并列，平局。', 'Draw. The highest battery count is tied.')
  if (dynamic && result.reason === 'score') return result.won
    ? t('你收集的电池最多，获胜！', 'You won with the most batteries!')
    : t('有对手收集了更多电池，挑战失败。', 'Defeat. A rival collected more batteries.')
  if (result.outcome === 'draw') return t('平局。试着更早抢到下一件零件。', 'Draw. Try reaching the next part sooner.')
  if (result.reason === 'escape') return result.final.actors[0].hp === undefined ? t('成功带着零件撤离！', 'Escaped with the parts!')
    : t('芽芽已抵达指定出口！', 'Sprout reached the exit!')
  if (result.reason === 'caught') return t('被截住了。看看追踪机器人从哪里靠近。', 'Caught! Check how the tracking bots came toward you.')
  if (result.reason === 'timeout') return result.final.actors[0].hp !== undefined ? t('回合用完了。', 'Out of turns.')
    : t('回合用完了。试着缩短路线。', 'Out of turns. Try a shorter route.')
  if (result.reason === 'score') return result.won ? t('你收集的零件最多，获胜！', 'You collected the most parts and won!') :
    t('有对手收集了更多零件。试着换个目标。', 'A rival collected more parts. Try a different target.')
  if (result.reason === 'unfinished' && result.final.turn === 0) return t(
    '程序结束了，芽芽还没收到第一个动作。检查有没有调用动作指令。如果要运行 decide(state)，请用整段策略替换起始代码。',
    'The program ended before Sprout received a move. Check that your program calls an action. To run decide(state), replace the starter code with your policy.',
  )
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

function ArenaShiftReport({ shift, locale, combat }: { shift: ArenaShift; locale: Locale; combat: boolean }) {
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
        <span>{combat ? t('道具移位', 'Item moved') : t('电池移位', 'Battery moved')} <strong>{id}</strong> <strong>{coordinates(from)} → {coordinates(to)}</strong></span>
      </li>)}
      {gates.every(({ places }) => places.length === 0) && shift.relocated.length === 0 &&
        <li>{combat ? t('通道和道具位置保持原样。', 'Passages and items stayed in place.') : t('通道和电池位置保持原样。', 'Passages and batteries stayed in place.')}</li>}
    </ul>
  </div>
}

function ArenaSensor({ scan, locale }: { scan: ArenaScan; locale: Locale }) {
  const { player, turn, opponents, items } = scan.value
  const activeRivals = opponents.filter(actor => actor.hp !== 0).length
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <p className="arena-sensor" data-testid="arena-sensor">
    <code>scan(){scan.count > 1 && ' × ' + scan.count}</code>{' · '}
    {t(`回合 ${turn} · 芽芽 (${player.join(', ')}) · 对手 ${activeRivals} · 待取物品 ${items.length}`,
      `Turn ${turn} · Sprout (${player.join(', ')}) · Rivals ${activeRivals} · Items left ${items.length}`)}
  </p>
}

function CombatStatus({ level, locale, snapshot, events }: { level: ArenaLevel; locale: Locale; snapshot: ArenaSnapshot; events?: ArenaEvent[] }) {
  if (!level.combat) return null
  const { objective, combat } = level
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const rivals = snapshot.actors.slice(1)
  const targetIds = 'itemIds' in objective ? objective.itemIds : []
  const pickups = targetIds.filter(id => snapshot.collected?.includes(id)).length
  return <div className="arena-combat-status">
    <div className="arena-combat-goal">
      {objective.kind === 'eliminate' && <strong>{t('对手已停机', 'Rivals offline')} {rivals.filter(actor => actor.hp === 0).length}/{rivals.length}</strong>}
      {targetIds.length > 0 && <strong title={targetIds.join(', ')}>{t('目标道具', 'Target items')} {pickups}/{targetIds.length}</strong>}
      {objective.kind === 'escape' && <strong>{t('抵达出口', 'Reach exit')} {coordinates(objective.exit)}</strong>}
      {objective.kind === 'score' && <strong>{t('比拼得分', 'Score race')}</strong>}
      <span>{t(`射程 ${combat.range} 格`, `Range ${combat.range} tiles`)}</span>
    </div>
    <ul className="arena-robot-stats" aria-label={t('机器人战况', 'Robot status')}>
      {snapshot.actors.map((actor, index) => {
        const damage = events?.reduce((sum, event) => sum + (event.targetId === actor.id ? event.damage ?? 0 : 0), 0) ?? 0
        const guarded = events?.some(event => event.actorId === actor.id && event.action === 'guard')
        return <li key={actor.id} data-robot-id={actor.id} data-offline={actor.hp === 0 || undefined} data-hit={damage || undefined}>
        <div className="arena-robot-name"><i aria-hidden="true">{index || '●'}</i><strong>{actorTitle(level, locale, actor.id)}</strong>
          {objective.kind === 'score' && <span>{t('得分', 'Score')} {actor.score}</span>}</div>
        {actor.hp === 0 ? <span className="arena-offline">{t('已停机', 'Offline')}</span> : <>
          <div className="arena-hp"><meter min={0} max={combat.health} value={actor.hp ?? combat.health}
            aria-label={t('生命', 'HP')} /><span>{t('生命', 'HP')} {actor.hp ?? combat.health}/{combat.health}</span></div>
          <small>{t('强化', 'Power')} +{actor.power ?? 0} · {t('护盾', 'Shield')} {actor.shield ?? 0}</small>
        </>}
        {damage > 0 && <small className="arena-hit-damage">{t('受击', 'Hit')} −{damage}</small>}
        {guarded && <small className="arena-guard-active">{t('防守中', 'Guarding')}</small>}
      </li>})}
    </ul>
  </div>
}

type ArenaPlayfieldProps = {
  level: ArenaLevel; locale: Locale; snapshot: ArenaSnapshot; frame?: ArenaFrame; latestShift?: ArenaShift
  trail?: readonly Position[]; activity?: StationActivity
}

// Applying a hit to a health meter does not rebuild every tile or reposition the WebGL models.
const ArenaPlayfield = memo(function ArenaPlayfield({ level, locale, snapshot, frame, latestShift, trail, activity, motion }: ArenaPlayfieldProps & {
  motion: ArenaTurnPresentation['motion']
}) {
  const mapMode = useArenaMapMode()
  const changedCells = latestShift?.turn === snapshot.turn ? shiftChanges(latestShift) : []
  for (const event of frame?.events ?? []) {
    for (const position of event.opened ?? []) changedCells.push({ position, state: 'opened' })
  }
  return <MapTiles location="arena" activity={activity} arenaMotion={motion} tiles={snapshot.tiles ?? level.tiles}
    exit={level.objective.kind === 'escape' ? level.objective.exit : undefined} items={snapshot.items} trail={trail}
    mapTargets={mapMode ? arenaMapTargets(level, snapshot) : undefined}
    arenaBuffs={level.combat?.buffs} arenaSwitches={level.combat?.switches} arenaShots={frame?.events.filter(event => event.action === 'shoot')} playerDown={snapshot.actors[0].hp === 0}
    arenaTargetIds={level.combat && 'itemIds' in level.objective ? level.objective.itemIds : undefined}
    gates={arenaGateCells(level)} cellChanges={changedCells}
    batteries={Boolean(level.shifts?.length) && !level.combat} playerPosition={snapshot.actors[0]} opponents={snapshot.actors.slice(1).flatMap((actor, index) =>
      actor.hp === 0 ? [] : [{ ...actor, label: String(index + 1), index, name: actorTitle(level, locale, actor.id) }])} locale={locale} />
})

export function ArenaBoard({ level, locale, snapshot, frame, presentation, latestShift, finished, mapPicker, trail, activity, scan, children }: ArenaPlayfieldProps & {
  finished?: boolean; mapPicker?: ReactNode; children?: ReactNode; scan?: ArenaScan; presentation: ArenaTurnPresentation
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const dynamic = Boolean(level.shifts?.length)
  const next = finished ? undefined : level.shifts?.find(shift => shift.turn > snapshot.turn)?.turn
  const mapMode = useArenaMapMode()
  const hud = arenaHudSnapshot(snapshot, presentation)
  return <section className="panel board-panel" data-testid={dynamic || level.combat?.switches?.length ? 'arena-dynamic-board' : undefined}>
    <TeachingScreen locale={locale} variant="monitor" title={t('回合现场', 'Match view')}>
      <div className="panel-heading"><h2>{t('对抗棋盘', 'Arena board')}</h2>
        <div className="arena-turn-hud">
          <span className="turn-display" data-testid="arena-turn">{t('回合', 'Turn')} {snapshot.turn}/{level.maxTurns}</span>
          {mapMode && level.combat && <span className="arena-map-health">{t('生命', 'HP')} {hud.actors[0].hp}/{level.combat.health}</span>}
        </div>
      </div>
      {mapPicker}
      {level.combat && <CombatStatus level={level} locale={locale} snapshot={hud} events={frame?.events.filter(event => !presentation.pendingShots.includes(event))} />}
      {next !== undefined && <p className="arena-shift-countdown" data-testid="arena-shift-countdown" data-next-turn={next} data-turns-remaining={next - snapshot.turn}>
        <strong>{t(`第 ${next} 回合变阵`, `Shift on turn ${next}`)}</strong><span>{t(`还剩 ${next - snapshot.turn} 回合`, `${next - snapshot.turn} turns to go`)}</span>
      </p>}
      <ArenaPlayfield level={level} locale={locale} snapshot={snapshot} frame={frame} motion={presentation.motion}
        latestShift={latestShift} trail={trail} activity={activity} />
      {scan && <ArenaSensor scan={scan} locale={locale} />}
      {!level.combat && <ul className="scoreboard" aria-label={dynamic ? t('已收集电池数', 'Batteries collected') : t('对抗比分', 'Arena scores')}>
        {snapshot.actors.map((actor, index) => <li key={actor.id}>
          <span className={index ? 'score-rival' : 'score-you'}>{index || '●'}</span><span>{actorTitle(level, locale, actor.id)}</span><strong>{actor.score}</strong>
        </li>)}
      </ul>}
      {latestShift && <ArenaShiftReport shift={latestShift} locale={locale} combat={Boolean(level.combat)} />}
    </TeachingScreen>
    {children && <CommandDesk locale={locale} title={t('对局控制', 'Match controls')}>{children}</CommandDesk>}
  </section>
}

export function ArenaStateReference({ locale, timed = false, combat = false, dynamic = true, hasSwitches = false }: { locale: Locale; timed?: boolean; combat?: boolean; dynamic?: boolean; hasSwitches?: boolean }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <details className="arena-state-reference">
    <summary>{timed ? 'state' : 'scan()'} · {t('赛场数据', 'Arena data')}</summary>
    <dl>
      <dt><code>tiles</code></dt><dd>{t('当前地图：墙 #，空地 .', 'Current map: # wall, . floor')}</dd>
      <dt><code>player</code></dt><dd>{t('芽芽坐标 [x, y]', 'Sprout’s position [x, y]')}</dd>
      <dt><code>opponents</code></dt><dd>{t('对手的 id、x、y、score', 'Rivals’ id, x, y, score')}</dd>
      <dt><code>items</code></dt><dd>{t('场上道具的 id、x、y', 'Available items’ id, x, y')}</dd>
      {combat && <>
        <dt><code>self</code></dt><dd>{t('hp 是生命，power 是强化层数，shield 是剩余护盾。对手也有这三个数值。', 'hp is health, power counts upgrades and shield is the remaining protection. Rivals have these values too.')}</dd>
        <dt><code>range</code></dt><dd>{t('脉冲在没有墙时能前进的格数', 'Pulse range along an open lane')}</dd>
        <dt><code>buffs</code></dt><dd>{t('芯片的 id 和 kind（power 或 shield）', 'Chip id and kind (power or shield)')}</dd>
        {hasSwitches && <><dt><code>switches</code></dt><dd>{t('itemId 对应开关，open 列出它控制的闸门坐标。', 'itemId identifies the switch and open lists the gate coordinates it controls.')}</dd></>}
        <dt><code>collected</code></dt><dd>{t('芽芽已拾取的道具 ID', 'Item IDs already collected by Sprout')}</dd>
      </>}
      {dynamic && <><dt><code>playerScore</code></dt><dd>{combat ? t('芽芽的得分', 'Sprout’s score') : t('芽芽已收集的电池数', 'Sprout’s battery count')}</dd></>}
      <dt><code>turn</code></dt><dd>{t('已结束的回合数', 'Completed turns')}</dd>
      {dynamic && <><dt><code>nextShift</code></dt><dd>{t('下次变阵的回合，没有时为 None', 'Next shift’s turn, or None')}</dd></>}
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
      <strong>{actorTitle(level, locale, event.actorId)}</strong><span>{describeEvent(event, locale, dynamic, level)}</span>
      {event.tactic && <span className="arena-tactic">
        {event.tactic === 'secure' ? t('就近收集', 'Secure nearby') : t('争抢目标', 'Contest target')}
        {event.targetId && <strong> · {event.targetId}</strong>}
      </span>}
    </li>)}</ul>
  </section>
}
