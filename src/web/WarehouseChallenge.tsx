import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { initialSnapshot, moveGridPlayer } from '../engine/snapshot'
import type { Direction, GridLevel, GridSnapshot, Locale, RunIssue } from '../shared/types'
import { warehouseParked, warehousePushDestination } from '../shared/warehouse'
import { useArenaConsole } from './ArenaConsole'
import { MapShortcutGuide } from './ArenaMapShortcuts'
import { ArenaMapWorkspace } from './ArenaMapWorkspace'
import { Board } from './Board'
import type { GridChallengeDraft } from './challengeDraft'
import { gridGoalReplayEvidence } from './goalReplayEvidence'
import { GridLesson } from './GridLesson'
import { PlayToolbar, useTrailPreference } from './PlayToolbar'
import { useWarehouseArrival, warehouseDeliveryText, WarehousePads, WarehouseReceipt } from './WarehouseFeedback'
import { armWarehouseSound, soundWarehouseCue, toggleWarehouseSound, warehouseSoundEnabled } from './warehouseSound'
import { runIssueText, tr } from './text'
import './warehouse-challenge.css'

const arrows = {
  up: ['↑', '向上', 'Move up'], left: ['←', '向左', 'Move left'],
  down: ['↓', '向下', 'Move down'], right: ['→', '向右', 'Move right'],
} as const
const pathDirections: Record<string, Direction> = { u: 'up', d: 'down', l: 'left', r: 'right' }
const keys = new Map<string, Direction>([['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right']])
type Props = ComponentProps<typeof GridLesson>
type ManualTurn = { state: GridSnapshot; pushes: number; direction?: Direction }

// Mixed-objective or multi-map imports use the grid runner, which checks every objective on every map.
export function isDirectWarehouse(level: GridLevel) {
  return level.warehouse && level.objectives.length === 1 && level.objectives[0].type === 'parkBoxes'
    && warehouseParked(level.warehouse.boxes, level.warehouse.targets) < level.warehouse.targets.length
    && !level.variants?.length && !level.devices?.length && !level.enemies?.length
}

function advance(level: GridLevel, before: ManualTurn, direction: Direction): ManualTurn | RunIssue {
  const state = { ...before.state, boxes: [...before.state.boxes!] }
  const issue = moveGridPlayer(level, state, direction)
  if (issue) return issue
  return { state, pushes: before.pushes + (warehousePushDestination(before.state, state) ? 1 : 0), direction }
}

function restoreTurns(level: GridLevel, path: string): ManualTurn[] {
  const turns: ManualTurn[] = [{ state: initialSnapshot(level), pushes: 0 }]
  for (const letter of path) {
    if (!Object.hasOwn(pathDirections, letter)) break
    const next = advance(level, turns.at(-1)!, pathDirections[letter])
    if ('code' in next) break
    turns.push(next)
  }
  return turns
}

export default function WarehouseChallenge(props: Props) {
  const { level, locale, challenge, onWin, onDraftChange } = props
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const draft = useRef<GridChallengeDraft>(props.initialDraft ?? { kind: 'grid', mode: 'cards', cards: [] })
  const [controls, setControls] = useState(draft.current.warehouse?.controls ?? 'direct')
  const [turns, setTurns] = useState(() => restoreTurns(level, draft.current.warehouse?.path ?? ''))
  const [issue, setIssue] = useState<RunIssue>()
  const last = turns.at(-1)!
  const targets = level.warehouse!.targets
  const parked = warehouseParked(last.state.boxes!, targets)
  const won = parked === targets.length
  const { arrival } = useWarehouseArrival(controls === 'direct' ? level.warehouse : undefined, last.state)
  const [soundOn, setSoundOn] = useState(warehouseSoundEnabled)
  const trail = useTrailPreference()
  const consoleControl = useArenaConsole()

  function save(next: GridChallengeDraft) {
    draft.current = next
    onDraftChange?.(next)
  }

  function savePlay(nextControls: typeof controls, path: string) {
    save({ ...draft.current, warehouse: { controls: nextControls, path } })
  }

  function switchControls(next: typeof controls) {
    if (next === controls) return
    challenge?.onStart()
    setControls(next)
    savePlay(next, draft.current.warehouse?.path ?? '')
  }

  function restart() {
    challenge?.onStart()
    setIssue(undefined)
    setTurns(restoreTurns(level, ''))
    savePlay('direct', '')
  }

  function move(direction: Direction) {
    if (won) return
    const next = advance(level, last, direction)
    if ('code' in next) { setIssue(next); return }
    const updated = [...turns, next]
    setIssue(undefined)
    setTurns(updated)
    const complete = warehouseParked(next.state.boxes!, targets) === targets.length
    const priorPath = (draft.current.warehouse?.path ?? '').slice(0, last.state.turn)
    savePlay('direct', complete ? '' : priorPath + direction[0])
    if (complete) {
      const frames = updated.slice(1).map(({ state, direction }) => ({ state, value: direction, line: 0, action: 'move' as const }))
      onWin()
      soundWarehouseCue('complete')
      challenge?.onWin({ kind: 'grid', turns: next.state.turn, passed: 1, total: 1 }, restart,
        gridGoalReplayEvidence(level, { won: true, frames, final: next.state, passedCases: 1, totalCases: 1 }),
        warehouseDeliveryText(targets.length, next.state.turn, next.pushes))
    }
  }

  function undo() {
    if (won || !last.state.turn) return
    setIssue(undefined)
    setTurns(turns.slice(0, -1))
    savePlay('direct', (draft.current.warehouse?.path ?? '').slice(0, last.state.turn - 1))
  }

  const switches = <div className="warehouse-play-modes segmented" role="group" aria-label={t('推箱方式', 'Sokoban controls')}>
    <button type="button" aria-pressed={controls === 'direct'} onClick={() => switchControls('direct')}>{t('直接推箱', 'Push by hand')}</button>
    <button type="button" aria-pressed={controls === 'program'} onClick={() => switchControls('program')}>{t('指令卡 / Python', 'Cards / Python')}</button>
  </div>
  const soundControl = <button type="button" className="subtle-button warehouse-sound" aria-pressed={soundOn}
    aria-label={t('推箱音效', 'Warehouse sound')} onClick={() => setSoundOn(toggleWarehouseSound())}>
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 8h3l4-4v12l-4-4H2z" />
      {soundOn ? <path d="M12 7q3 3 0 6m2-9q6 6 0 12" /> : <path d="m12 8 5 5m0-5-5 5" />}
    </svg><span>{t('音效', 'Sound')}</span>
  </button>
  return <div className="warehouse-challenge" onPointerDownCapture={armWarehouseSound} onKeyDownCapture={armWarehouseSound}>
    <div className="warehouse-challenge__header">{switches}{soundControl}</div>
    {controls === 'program' ? <GridLesson {...props} initialDraft={draft.current} onDraftChange={save} mapModeControl={soundControl} /> :
      <ArenaMapWorkspace locale={locale} title={level.title[locale]} consoleControl={consoleControl} hasConsole={false}
        touchControl={{ move }} modeControl={<>{switches}{soundControl}</>} shortcutHelp={<MapShortcutGuide locale={locale} />}>
        <div className="play-column"><section className="panel board-panel">
          <Board level={level} locale={locale} snapshot={last.state} trail={trail.visible ? turns.map(turn => turn.state.player) : undefined}
            warehouseArrival={arrival} activity={issue ? { action: 'move', token: issue, failed: true } : last.direction ? { action: 'move', token: last, value: last.direction } : undefined} />
        </section></div>
        <PlayToolbar locale={locale} trail={trail} result={won && <WarehouseReceipt locale={locale} crates={parked}
          moves={last.state.turn} pushes={last.pushes} hasSummary={!!challenge} />}
          status={<div className="warehouse-readout" data-testid="warehouse-readout" data-won={won || undefined} hidden={won}>
          <WarehousePads targets={targets} boxes={last.state.boxes!} arrival={arrival} locale={locale} />
          <span>{t('步数', 'Moves')} <b>{last.state.turn}</b></span>
          <span>{t('推箱', 'Pushes')} <b>{last.pushes}</b></span>
          {issue && <strong>{runIssueText(locale, issue)}</strong>}
        </div>}>
          {!won && <><MovePad locale={locale} onMove={move} won={won} />
            <button type="button" className="subtle-button" disabled={!last.state.turn} onClick={undo}>{t('撤销一步', 'Undo move')}</button></>}
          <button type="button" className="subtle-button" disabled={!last.state.turn && !issue} onClick={restart}>{won ? t('再推一次', 'Push again') : t('重新开始', 'Restart')}</button>
        </PlayToolbar>
      </ArenaMapWorkspace>}
  </div>
}

function MovePad({ locale, onMove, won }: { locale: Locale; onMove: (dir: Direction) => void; won: boolean }) {
  const pad = useRef<HTMLDivElement>(null)
  function moveWithKey(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const direction = keys.get(event.key)
    if (!direction || won) return
    event.preventDefault()
    event.stopPropagation()
    onMove(direction)
    return true
  }
  // A new lesson can accept arrows before the first click. Focused board inspection and other controls keep their keys.
  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (!pad.current?.isConnected || !pad.current.getClientRects().length || pad.current.closest('[inert], [hidden]')) return
      if (event.target === document.body || event.target instanceof HTMLElement && event.target.matches('.arena-map-workspace[data-map-fullscreen]')) moveWithKey(event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return <div ref={pad} className="warehouse-pad" role="group" aria-label={tr(locale, '移动方向', 'Move direction')}
    onKeyDown={event => { if (moveWithKey(event.nativeEvent)) event.stopPropagation() }}>
    {(Object.keys(arrows) as Direction[]).map(dir => {
      const [icon, zh, en] = arrows[dir]
      const label = tr(locale, zh, en)
      return <button key={dir} type="button" className="subtle-button" disabled={won}
        data-push-direction={dir} aria-label={label} title={label} onClick={() => onMove(dir)}>{icon}</button>
    })}
  </div>
}
