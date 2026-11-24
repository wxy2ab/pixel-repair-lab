import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { runFerryRace, type FerryRaceResult } from '../engine/ferryRace'
import { ferryGrid, initialFerryLayout, isFerryCommand, isFerryLayout } from '../shared/ferry'
import { walkRoute } from '../shared/routeMap'
import type { FerryCommand, FerryRaceLayout, GridLevel, GridSnapshot, Locale, Position } from '../shared/types'
import { trailArmsByCell, visibleTrailEdges } from './boardTrail'
import type { GridChallengeDraft } from './challengeDraft'
import type { ChallengeRunHandlers } from './challengeScore'
import { gridGoalReplayEvidence } from './goalReplayEvidence'
import { FerryDockIcon } from './icons'
import { useReplayCursor } from './lessonTools'
import { ReplayControls } from './ReplayControls'
import { RaceRouteEditor } from './RaceRouteEditor'
import { tr } from './text'
import './ferry-race.css'

type Piece = 'a' | 'b' | 'wall'
const sameCell = (a: Position, b: Position) => a.x === b.x && a.y === b.y
const address = (p: Position) => p.x + ',' + p.y

function FerryPiece({ piece }: { piece: Piece }) {
  return piece === 'wall'
    ? <i className="ferry-block" aria-hidden="true" />
    : <i className="ferry-battery" data-color={piece} aria-hidden="true">{piece.toUpperCase()}</i>
}

type Placement = {
  selected?: Piece
  select: (piece?: Piece) => void
  place: (piece: Piece, to: Position) => void
}

function FerryBoard({ level, locale, layout, state, trail, rival, placement }: {
  level: GridLevel; locale: Locale; layout: FerryRaceLayout; state?: GridSnapshot
  trail: Position[]; rival?: boolean; placement?: Placement
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const board = useRef<HTMLDivElement>(null)
  const drag = useRef<{ piece: Piece; x: number; y: number; pointer: number; moved: boolean } | undefined>(undefined)
  const suppressClick = useRef(false)
  const [hover, setHover] = useState<string>()
  const width = level.tiles[0].length
  const edges = trailArmsByCell(visibleTrailEdges(trail), width)
  const dock = level.objectives.find(goal => goal.type === 'exit')!
  const position = state?.player ?? level.start
  const pieceLabels = { a: t('电池 A', 'Battery A'), b: t('电池 B', 'Battery B'), wall: t('活动墙', 'Movable wall') }

  function pointedCell(event: PointerEvent) {
    const tile = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-ferry-edit-cell]')
    return tile && board.current?.contains(tile) ? tile.dataset.ferryEditCell : undefined
  }

  function startDrag(event: PointerEvent<HTMLElement>, piece: Piece) {
    if (!placement || !event.isPrimary || event.button !== 0) return
    suppressClick.current = false
    drag.current = { piece, x: event.clientX, y: event.clientY, pointer: event.pointerId, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveDrag(event: PointerEvent) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId || !placement) return
    if (!current.moved && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 4) return
    if (!current.moved) placement.select(current.piece)
    current.moved = true
    setHover(pointedCell(event))
  }

  function endDrag(event: PointerEvent) {
    const current = drag.current
    if (!current || current.pointer !== event.pointerId) return
    drag.current = undefined
    setHover(undefined)
    if (!current.moved) return
    suppressClick.current = true
    const target = pointedCell(event)
    if (target) {
      const [x, y] = target.split(',').map(Number)
      placement?.place(current.piece, { x, y })
    }
  }

  return <div className="ferry-board" ref={board} style={{ '--ferry-cols': width } as CSSProperties}
    role="group" aria-label={placement ? t('布置渡口', 'Arrange the ferry map') : t('渡口地图', 'Ferry map')}
    onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={() => { drag.current = undefined; setHover(undefined) }}>
    {level.tiles.flatMap((row, y) => Array.from(row, (tile, x) => {
      const cell = { x, y }
      const key = address(cell)
      const index = layout.batteries.findIndex(p => sameCell(p, cell))
      const battery = index >= 0 && (!state || state.items.some(item => sameCell(item, cell)))
      const piece: Piece | undefined = sameCell(cell, layout.wall) ? 'wall' : battery ? (index === 0 ? 'a' : 'b') : undefined
      const here = sameCell(position, cell)
      const exit = sameCell(dock, cell)
      const label = [key, piece ? pieceLabels[piece] : '', exit && t('码头', 'Dock'),
        here && (rival ? t('就近机器人', 'Nearest-first bot') : t('芽芽', 'Sprout')), tile === '#' && t('边界', 'Boundary')].filter(Boolean).join(' · ')
      const props = { className: 'ferry-tile', 'data-ground': tile, 'data-selected': Boolean(placement && piece && placement.selected === piece) || undefined,
        'data-hover': hover === key || undefined, 'aria-label': label }
      const content = <>
        {edges.get(y * width + x)?.map(arm => <i key={arm.direction} aria-hidden="true" className="board-trail-arm"
          data-direction={arm.direction} data-trail={arm.recent ? 'recent' : 'history'} />)}
        {exit && <FerryDockIcon />}
        {piece && <FerryPiece piece={piece} />}
        {here && <span className={'pixel-bot' + (rival ? ' pixel-bot--enemy' : '')} aria-hidden="true" />}
        {hover === key && placement?.selected && !piece && tile === '.' && !exit && !here &&
          <span className="ferry-drop-ghost"><FerryPiece piece={placement.selected}/></span>}
      </>
      return placement ? <button type="button" key={key} {...props} data-ferry-edit-cell={key} data-ferry-piece={piece}
        tabIndex={tile === '#' || exit || here ? -1 : 0} title={label} aria-pressed={piece ? placement.selected === piece : undefined}
        onPointerDown={event => { suppressClick.current = false; if (piece) startDrag(event, piece) }}
        onClick={event => {
          if (event.detail && suppressClick.current) { suppressClick.current = false; return }
          if (piece) placement.select(placement.selected === piece ? undefined : piece)
          else if (placement.selected) placement.place(placement.selected, cell)
        }}>{content}</button>
        : <span key={key} {...props}>{content}</span>
    }))}
  </div>
}

type Props = {
  level: GridLevel; locale: Locale; onComplete: (turns: number) => void; onMistake?: () => void
  challenge?: ChallengeRunHandlers; initialDraft?: GridChallengeDraft; onDraftChange?: (draft: GridChallengeDraft) => void
}

type Racer = 'player' | 'bot'

function raceStatus(race: FerryRaceResult, which: Racer, step: number, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const frame = race.frames[step]
  const collected = 2 - frame[which].items.length
  const cargo = t(`已取电池 ${collected}/2`, `Batteries ${collected}/2`)
  const arrival = which === 'bot' ? race.botArrival : race.playerArrival
  if (arrival !== undefined && frame.turn >= arrival) {
    return cargo + t(` · 第 ${arrival} 回合登船`, ` · Boarded on turn ${arrival}`)
  }
  const stop = which === 'player' ? race.playerStop : undefined
  if (stop && frame.turn >= stop.turn) {
    return cargo + (stop.issue.code === 'blocked' ? t(` · 第 ${stop.turn} 步撞墙`, ` · Wall at step ${stop.turn}`)
      : t(` · 第 ${stop.turn} 步没有取到电池`, ` · No battery at step ${stop.turn}`))
  }
  if (step < race.frames.length - 1) return cargo
  if (arrival !== undefined) {
    return cargo + t(` · 第 ${arrival} 回合才能到，晚 ${arrival - race.deadline} 回合`, ` · Reaches dock on turn ${arrival}, ${arrival - race.deadline} turns late`)
  }
  return cargo + t(' · 没能带齐电池到达码头', ' · Did not reach the dock with both batteries')
}

export function FerryRace({ level, locale, onComplete, onMistake, challenge, initialDraft, onDraftChange }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [draft, setDraft] = useState(() => initialDraft?.ferryRace ?? { layout: initialFerryLayout(level), commands: [] })
  const { layout, commands } = draft
  const [selected, setSelected] = useState<Piece>()
  const [placementError, setPlacementError] = useState(false)
  const [race, setRace] = useState<FerryRaceResult>()
  const count = race ? race.frames.length - 1 : 0
  const cursor = useReplayCursor(count, 450)
  const credited = useRef<FerryRaceResult | undefined>(undefined)
  const exit = level.objectives.find(goal => goal.type === 'exit')!
  const scene = useMemo(() => ferryGrid(level, layout), [level, layout])
  const preview = useMemo(() => walkRoute({ tiles: scene.tiles, start: scene.start, goal: exit },
    commands.filter(command => command !== 'wait' && command !== 'pick')).positions, [scene, exit, commands])
  const edit = useCallback(() => {
    cursor.restart(false)
    setRace(undefined)
    challenge?.onStart()
  }, [cursor.restart, challenge])

  useEffect(() => {
    if (!race || cursor.step !== count || credited.current === race) return
    credited.current = race
    const score = { kind: 'grid' as const, turns: Math.min(race.playerArrival ?? race.frames[count].player.turn, race.deadline),
      passed: Number(race.won), total: 1 }
    const evidence = gridGoalReplayEvidence(scene, { ...race.playerRun, won: race.won, final: race.frames[count].player,
      frames: race.playerRun.frames.filter(frame => frame.state.turn <= score.turns) })
    if (race.won) {
      onComplete(score.turns)
      challenge?.onWin(score, edit, evidence, {
        zh: `芽芽在第 ${score.turns} 回合带齐两块电池登船，就近机器人误船了。`,
        en: `Sprout boarded with both batteries on turn ${score.turns}. The nearest-first bot missed the ferry.`,
      })
    } else {
      evidence.issue = {
        location: { zh: `渡口 · 第 ${race.frames[count].turn} 回合`, en: `Ferry · Turn ${race.frames[count].turn}` },
        gaps: [
          { zh: '芽芽 · ' + raceStatus(race, 'player', count, 'zh'), en: 'Sprout · ' + raceStatus(race, 'player', count, 'en') },
          { zh: '就近机器人 · ' + raceStatus(race, 'bot', count, 'zh'), en: 'Nearest-first bot · ' + raceStatus(race, 'bot', count, 'en') },
        ],
      }
      onMistake?.()
      challenge?.onFailure(score, evidence)
    }
  }, [race, count, cursor.step, scene, challenge, edit, onComplete, onMistake])

  function save(nextLayout: FerryRaceLayout, nextCommands: FerryCommand[]) {
    const next = { layout: nextLayout, commands: nextCommands }
    setDraft(next)
    onDraftChange?.({ kind: 'grid', mode: 'cards', cards: [], ferryRace: next })
  }

  function place(piece: Piece, cell: Position) {
    const next: FerryRaceLayout = { batteries: [...layout.batteries], wall: layout.wall }
    if (piece === 'wall') next.wall = cell
    else next.batteries[piece === 'a' ? 0 : 1] = cell
    const valid = isFerryLayout(level, next)
    setPlacementError(!valid)
    if (valid) { save(next, commands); setSelected(undefined) }
  }

  function start() {
    challenge?.onStart()
    setSelected(undefined)
    setPlacementError(false)
    setRace(runFerryRace(level, layout, commands))
    cursor.restart(true)
  }

  if (!race) return <section className="panel ferry-workshop">
    <header className="panel-heading"><h2>{t('布置渡口', 'Arrange the ferry map')}</h2>
      <span className="ferry-race-clock">⚓ {t(`第 ${level.turnLimit} 回合开船`, `Departs on turn ${level.turnLimit}`)}</span></header>
    <div className="ferry-setup">
      <div>
        <FerryBoard level={level} locale={locale} layout={layout} trail={preview} placement={{
          selected, select: piece => { setSelected(piece); setPlacementError(false) }, place }} />
        {placementError && <p className="ferry-status" role="status">{t('只能放在没有其他物件的空地上。', 'Choose an empty floor square.')}</p>}
      </div>
      <RaceRouteEditor level={level} locale={locale} family="ferry" commands={commands} allowed={isFerryCommand}
        onChange={next => save(layout, next)} onRun={start} />
    </div>
  </section>

  const frame = race.frames[cursor.step] ?? race.frames[0]
  const ended = cursor.step === count
  const playerOnTime = race.playerArrival !== undefined && race.playerArrival <= race.deadline
  const botOnTime = race.botArrival !== undefined && race.botArrival <= race.deadline
  const outcome = race.won ? t('挑战成功！芽芽带齐两块电池登船，就近机器人误船了。', 'Challenge complete! Sprout boarded with both batteries. The nearest-first bot missed the ferry.')
    : playerOnTime ? t('两台都赶上了船。', 'Both robots caught the ferry.')
    : botOnTime ? t('就近机器人赶上了船，芽芽误船了。', 'The nearest-first bot caught the ferry. Sprout missed it.')
    : t('两台都误船了。', 'Both robots missed the ferry.')

  return <section className="panel ferry-workshop">
    <header className="panel-heading"><h2>{t('渡口赛况', 'Ferry race')}</h2>
      <span className="ferry-race-clock">{t('回合', 'Turn')} {frame.turn} / {race.deadline}</span></header>
    <div className="ferry-runners">{(['player', 'bot'] as const).map(which => {
      const state = frame[which]
      const metGoal = which === 'player' ? playerOnTime && frame.turn >= race.playerArrival! : ended && !botOnTime
      return <div key={which} data-ferry-racer={which} data-position={address(state.player)} data-turn={frame.turn} className="ferry-racer">
        <h3>{which === 'player' ? t('芽芽', 'Sprout') : t('就近机器人', 'Nearest-first bot')}</h3>
        <FerryBoard level={level} locale={locale} layout={layout} state={state} rival={which === 'bot'}
          trail={race.frames.slice(0, cursor.step + 1).map(f => f[which].player)} />
        <p className="ferry-status" data-met-goal={metGoal || undefined}>
          {metGoal && <span className="race-goal-check"><span aria-hidden="true">✓</span><span className="sr-only">{t('本项目标已达成', 'Objective met')}</span></span>}
          {raceStatus(race, which, cursor.step, locale)}
        </p>
      </div>
    })}</div>
    <ReplayControls locale={locale} cursor={cursor} count={count} />
    <div className="ferry-result">
      {ended && <strong role="status" data-testid="ferry-race-result" data-won={race.won}>{outcome}</strong>}
      <button type="button" className="subtle-button" data-testid="ferry-race-edit" onClick={edit}>{t('调整布置和路线', 'Edit map and route')}</button>
    </div>
  </section>
}
