import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { runMirrorRace, type MirrorRaceOutcome, type MirrorRaceResult } from '../engine/mirrorRace'
import { initialSnapshot } from '../engine/snapshot'
import { blockingGridDevice, gridOffsets } from '../shared/gridDevices'
import { initialMirrors, isMirrorLayout, mirrorGrid } from '../shared/laserTrial'
import { walkRoute } from '../shared/routeMap'
import type { Direction, GridLevel, GridSnapshot, Locale, MirrorPlacement, Position } from '../shared/types'
import { FlatMap } from './Board'
import { visibleTrailEdges } from './boardTrail'
import type { GridChallengeDraft } from './challengeDraft'
import type { ChallengeRunHandlers } from './challengeScore'
import { gridGoalReplayEvidence } from './goalReplayEvidence'
import { boardDevice, describeDevice } from './gridDeviceDisplay'
import { useReplayCursor } from './lessonTools'
import { RaceRouteEditor } from './RaceRouteEditor'
import { ReplayControls } from './ReplayControls'
import { tr } from './text'
import './mirror-race.css'

const directionsOnly = (id: string): id is Direction => Object.hasOwn(gridOffsets, id)
const at = (p: Position, q: Position) => p.x === q.x && p.y === q.y
const address = (p: Position) => p.x + ',' + p.y

function MirrorBoard({ scene, snapshot, trail, rival, hit, locale, cellControl }: {
  scene: GridLevel; snapshot: GridSnapshot; trail: Position[]; rival?: boolean; hit?: boolean; locale: Locale
  cellControl?: (position: Position) => ReactNode
}) {
  const state = snapshot.devices
  return <div className="mirror-map" data-hit={hit || undefined}>
    <FlatMap locale={locale} cellControl={cellControl} frame={{
      tiles: scene.tiles, exit: scene.objectives.find(goal => goal.type === 'exit'), items: snapshot.items,
      playerPosition: snapshot.player, playerDown: rival, opponents: rival ? [snapshot.player] : [],
      devices: state && scene.devices?.map(device => boardDevice(device, state, snapshot.turn)),
      hazards: state?.hazards, trailEdges: visibleTrailEdges(trail),
    }} />
  </div>
}

function runnerStatus(locale: Locale, outcome: MirrorRaceOutcome, turn: number) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  if (turn < outcome.turn) return turn ? t('行进中', 'Moving') : t('准备出发', 'Ready')
  const n = outcome.turn
  switch (outcome.kind) {
    case 'exit': return t(`第 ${n} 回合安全到达出口`, `Reached the exit safely on turn ${n}`)
    case 'laser': return t(`第 ${n} 回合碰到激光`, `Hit the laser on turn ${n}`)
    case 'noRoute': return t('没有通向出口的路', 'No path to the exit')
    case 'stopped':
      if (outcome.issue?.code === 'blocked' || outcome.issue?.code === 'fixtureBlocked') {
        const step = outcome.issue.line ?? n + 1
        return t(`第 ${step} 步被挡住，已走 ${n} 回合`, `Step ${step} blocked after ${n} turns`)
      }
      if (outcome.issue?.code === 'turnLimit') return t(`第 ${n} 回合用完，未到出口`, `Turn limit reached on turn ${n}`)
      return t(`指令在第 ${n} 回合结束，未到出口`, `Route ended on turn ${n} before the exit`)
  }
}

type Props = {
  level: GridLevel; locale: Locale; onComplete: (turns: number) => void; onMistake?: () => void
  challenge?: ChallengeRunHandlers; initialDraft?: GridChallengeDraft; onDraftChange?: (draft: GridChallengeDraft) => void
}

export function MirrorRace({ level, locale, initialDraft, onDraftChange, onComplete, onMistake, challenge }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [draft, setDraft] = useState(() => initialDraft?.laserRace ?? { mirrors: initialMirrors(level), commands: [] })
  const { mirrors, commands } = draft
  const [selected, setSelected] = useState<number>()
  const dragged = useRef<number | undefined>(undefined)
  const [hover, setHover] = useState<string>()
  const [placementError, setPlacementError] = useState(false)
  const [race, setRace] = useState<MirrorRaceResult>()
  const credited = useRef<MirrorRaceResult | undefined>(undefined)
  const count = race ? race.frames.length - 1 : 0
  const cursor = useReplayCursor(count, 470)
  const scene = useMemo(() => mirrorGrid(level, mirrors), [level, mirrors])
  const startState = useMemo(() => initialSnapshot(scene), [scene])
  const exit = scene.objectives.find(goal => goal.type === 'exit')!
  const routeMap = useMemo(() => ({
    start: scene.start, goal: exit, tiles: scene.tiles.map((row, y) => [...row].map((tile, x) =>
      blockingGridDevice(scene, startState.devices, { x, y }) ? '#' : tile).join('')),
  }), [scene, exit, startState])
  const preview = useMemo(() => walkRoute(routeMap, commands).positions, [routeMap, commands])
  const edit = useCallback(() => {
    cursor.restart(false)
    setRace(undefined)
    challenge?.onStart()
  }, [cursor.restart, challenge])

  useEffect(() => {
    if (!race || cursor.step !== count || credited.current === race) return
    credited.current = race
    const score = { kind: 'grid' as const, turns: race.playerOutcome.turn, passed: Number(race.won), total: 1 }
    const evidence = gridGoalReplayEvidence(scene, { ...race.playerRun, won: race.won })
    if (race.won) {
      onComplete(score.turns)
      challenge?.onWin(score, edit, evidence, {
        zh: `芽芽在第 ${race.playerOutcome.turn} 回合安全到达。最短路机器人在第 ${race.botOutcome.turn} 回合碰到了激光。`,
        en: `Sprout reached the exit safely on turn ${race.playerOutcome.turn}. The shortest-path bot hit the laser on turn ${race.botOutcome.turn}.`,
      })
    } else {
      const turn = race.frames[count].turn
      evidence.issue = {
        location: { zh: `光廊 · 第 ${turn} 回合`, en: `Laser hall · Turn ${turn}` },
        gaps: [
          { zh: '芽芽 · ' + runnerStatus('zh', race.playerOutcome, turn), en: 'Sprout · ' + runnerStatus('en', race.playerOutcome, turn) },
          { zh: '最短路机器人 · ' + runnerStatus('zh', race.botOutcome, turn), en: 'Shortest-path bot · ' + runnerStatus('en', race.botOutcome, turn) },
        ],
      }
      onMistake?.()
      challenge?.onFailure(score, evidence)
    }
  }, [race, count, cursor.step, scene, challenge, edit, onComplete, onMistake])

  function save(nextMirrors: MirrorPlacement[], nextCommands: Direction[]) {
    const next = { mirrors: nextMirrors, commands: nextCommands }
    setDraft(next)
    onDraftChange?.({ kind: 'grid', mode: 'cards', cards: [], laserRace: next })
  }

  function changeMirror(index: number, patch: Partial<MirrorPlacement>) {
    const next = mirrors.map((mirror, i) => index === i ? { ...mirror, ...patch } : mirror)
    const valid = isMirrorLayout(level, next)
    setPlacementError(!valid)
    if (valid) save(next, commands)
  }

  function controls(cell: Position) {
    const index = mirrors.findIndex(mirror => at(mirror, cell))
    const mirror = mirrors[index]
    const device = scene.devices?.find(part => at(part, cell))
    const label = [address(cell), mirror ? t(`镜 ${index + 1} ${mirror.orientation}`, `Mirror ${index + 1} ${mirror.orientation}`)
      : device && startState.devices ? describeDevice(boardDevice(device, startState.devices, 0), locale)
      : at(cell, scene.start) ? t('起点', 'Start') : at(cell, exit) ? t('出口', 'Exit')
      : scene.tiles[cell.y][cell.x] === '#' ? t('墙', 'Wall') : t('空地', 'Floor')].join(' · ')
    return <button type="button" className="mirror-cell-control" data-mirror-cell={address(cell)}
      data-edit-mirror={mirror ? index : undefined} data-selected={mirror && index === selected || undefined}
      data-hover={hover === address(cell) || undefined} title={label} aria-label={label}
      aria-pressed={mirror ? index === selected : undefined} draggable={Boolean(mirror)}
      onClick={() => {
        if (mirror) { setSelected(index); setPlacementError(false) }
        else if (selected !== undefined) changeMirror(selected, cell)
      }}
      onDragStart={event => {
        if (!mirror) return
        dragged.current = index
        setSelected(index)
        setPlacementError(false)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', String(index))
        const tile = event.currentTarget.parentElement
        if (tile) event.dataTransfer.setDragImage(tile, tile.clientWidth / 2, tile.clientHeight / 2)
      }}
      onDragOver={event => {
        if (dragged.current === undefined) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setHover(address(cell))
      }}
      onDrop={event => {
        if (dragged.current === undefined) return
        event.preventDefault()
        changeMirror(dragged.current, cell)
        dragged.current = undefined
        setHover(undefined)
      }}
      onDragEnd={() => { dragged.current = undefined; setHover(undefined) }}>
      {mirror && <small aria-hidden="true">{index + 1}</small>}
    </button>
  }

  function start() {
    challenge?.onStart()
    setPlacementError(false)
    setRace(runMirrorRace(level, mirrors, commands))
    cursor.restart(true)
  }

  if (!race) return <section className="panel ferry-workshop mirror-race">
    <header className="panel-heading"><h2>{t('布置光廊', 'Arrange the laser hall')}</h2>
      <span className="ferry-race-clock">{t(`${level.turnLimit} 回合`, `${level.turnLimit} turns`)}</span></header>
    <div className="ferry-setup">
      <div>
        <MirrorBoard scene={scene} locale={locale} snapshot={startState} trail={preview} cellControl={controls} />
        <div className="mirror-rotate">
          {mirrors.map((mirror, i) => <button key={i} type="button" className="subtle-button" data-rotate-mirror={i}
            onClick={() => { setSelected(i); changeMirror(i, { orientation: mirror.orientation === '/' ? '\\' : '/' }) }}>
            <b aria-hidden="true">↻</b> {t(`旋转镜 ${i + 1}`, `Rotate mirror ${i + 1}`)} <code>{mirror.orientation}</code>
          </button>)}
        </div>
        {placementError && <p className="ferry-status" role="status">{t('镜子需要放在空地上，起点和出口要留空。', 'Place mirrors on free floor squares. Keep the start and exit clear.')}</p>}
      </div>
      <RaceRouteEditor family="mirror" level={level} locale={locale} commands={commands} allowed={directionsOnly}
        onChange={next => save(mirrors, next)} onRun={start} />
    </div>
  </section>

  const frame = race.frames[cursor.step] ?? race.frames[0]
  return <section className="panel ferry-workshop mirror-race">
    <header className="panel-heading"><h2>{t('光廊赛况', 'Laser hall race')}</h2>
      <span className="ferry-race-clock">{t('回合', 'Turn')} {frame.turn} / {level.turnLimit}</span></header>
    <div className="ferry-runners">{(['player', 'bot'] as const).map(which => {
      const rival = which === 'bot'
      const state = frame[which]
      const outcome = rival ? race.botOutcome : race.playerOutcome
      const kind = frame.turn >= outcome.turn ? outcome.kind : undefined
      const metGoal = rival ? kind === 'laser' : kind === 'exit'
      return <div key={which} className="ferry-racer" data-mirror-racer={which}
        data-position={address(state.player)} data-turn={frame.turn} data-outcome={kind}>
        <h3>{rival ? t('最短路机器人', 'Shortest-path bot') : t('芽芽', 'Sprout')}</h3>
        <MirrorBoard scene={scene} locale={locale} snapshot={state} rival={rival} hit={kind === 'laser'}
          trail={race.frames.slice(0, cursor.step + 1).map(f => f[which].player)} />
        <p className="ferry-status" data-met-goal={metGoal || undefined}>
          {metGoal && <span className="race-goal-check"><span aria-hidden="true">✓</span><span className="sr-only">{t('本项目标已达成', 'Objective met')}</span></span>}
          {runnerStatus(locale, outcome, frame.turn)}
        </p>
      </div>
    })}</div>
    <ReplayControls locale={locale} cursor={cursor} count={count} />
    <div className="ferry-result">
      {cursor.step === count && <strong role="status" data-testid="mirror-race-result" data-won={race.won}>
        {race.won ? t('挑战成功！芽芽安全到达出口，最短路机器人碰到了激光。', 'Challenge complete! Sprout reached the exit safely and the shortest-path bot hit the laser.')
          : t('这次挑战未通过。', 'Challenge incomplete.')}
      </strong>}
      <button type="button" className="subtle-button" data-testid="mirror-race-edit" onClick={edit}>{t('调整镜子和路线', 'Edit mirrors and route')}</button>
    </div>
  </section>
}
