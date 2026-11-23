import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Locale, Position } from '../../shared/types'
import { tr } from '../text'
import { describeDevice, hazardName } from '../gridDeviceDisplay'
import type { createStationRenderer } from './renderer'
import type { StationCamera, StationFrame } from './types'
import { StationActionCue } from '../StationActionCue'
import './station-viewport.css'

type View = '2d' | '3d'
const viewKey = 'pixel-repair-lab:board-view'
let graphicsUnavailable = false

function preferredView(): View {
  if (graphicsUnavailable) return '2d'
  try { return localStorage.getItem(viewKey) === '2d' ? '2d' : '3d' } catch { return '3d' }
}

function cellContents(frame: StationFrame, cell: Position, locale: Locale, batteries: boolean) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const here = (position?: Position) => position?.x === cell.x && position.y === cell.y
  const labels = [
    here(frame.playerPosition) && t('芽芽', 'Sprout'),
    ...frame.opponents.filter(here).map(bot => bot.name ?? (bot.label ? t(`对手 ${bot.label}`, `Rival ${bot.label}`) : t('巡逻机器人', 'Patrol bot'))),
    ...frame.items.filter(here).map(item => `${batteries ? t('电池', 'Battery') : t('零件', 'Part')} · ${item.id}`),
    ...(frame.devices ?? []).filter(here).map(device => describeDevice(device, locale)),
    ...new Set(frame.hazards?.filter(here).map(hazard => hazardName(hazard.kind, locale))),
    here(frame.exit) && t('出口', 'Exit'),
    frame.gates?.some(here) && (frame.tiles[cell.y]?.[cell.x] === '#' ? t('通道已关', 'Gate closed') : t('通道已开', 'Gate open')),
  ].filter(Boolean)
  return labels.length ? labels.join(' · ') : frame.tiles[cell.y]?.[cell.x] === '#' ? t('墙', 'Wall') : t('地板', 'Floor')
}

export function StationViewport({ frame, locale, batteries = false, children }: {
  frame: StationFrame; locale: Locale; batteries?: boolean; children: (selected?: Position) => ReactNode
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [view, setView] = useState<View>(preferredView)
  const [cameraMode, setCameraMode] = useState<StationCamera>('overview')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [cell, setCell] = useState<Position>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<ReturnType<typeof createStationRenderer> | null>(null)
  const latest = useRef(frame)
  const hintId = useId()
  const flatInteractive = view === '2d' && Boolean(frame.devices?.length)
  const inspected = cell && frame.tiles[cell.y]?.[cell.x] !== undefined ? cell : undefined
  const selectionOnOpen = useRef<Position | undefined>(undefined)

  useLayoutEffect(() => {
    latest.current = frame
    engine.current?.update(frame)
  }, [frame])

  useEffect(() => {
    if (view !== '3d' || !canvas.current) return
    const surface = canvas.current
    let active = true
    function fallback() {
      if (!active) return
      graphicsUnavailable = true
      setFailed(true)
      setReady(false)
      setView('2d')
      setCameraMode('overview')
      setCell(undefined)
    }
    void import('./renderer').then(({ createStationRenderer }) => {
      if (!active) return
      engine.current = createStationRenderer(surface, latest.current, { onInspect: setCell, onFailure: fallback })
      if (selectionOnOpen.current) engine.current.inspectCell(selectionOnOpen.current)
      setReady(true)
    }).catch(fallback)
    return () => {
      active = false
      engine.current?.dispose()
      engine.current = null
    }
  }, [view])

  function switchView(next: View) {
    if (next === view) return
    if (next === '3d') graphicsUnavailable = false
    setFailed(false)
    setReady(false)
    selectionOnOpen.current = frame.devices?.length ? inspected : undefined
    setCell(selectionOnOpen.current)
    setCameraMode('overview')
    setView(next)
    try { localStorage.setItem(viewKey, next) } catch { /* The current board still switches. */ }
  }

  function navigateGrid(event: KeyboardEvent<HTMLElement>) {
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const offset = directions[event.key]
    if (!offset) return
    event.preventDefault()
    const origin = inspected ?? frame.playerPosition
    const next = {
      x: Math.max(0, Math.min(frame.tiles[0].length - 1, origin.x + offset[0])),
      y: Math.max(0, Math.min(frame.tiles.length - 1, origin.y + offset[1])),
    }
    if (flatInteractive) setCell(next)
    else engine.current?.inspectCell(next)
  }

  const tools = [
    { label: t('向左旋转', 'Rotate left'), mark: '↶', action: () => engine.current?.rotate(-Math.PI / 6) },
    { label: t('向右旋转', 'Rotate right'), mark: '↷', action: () => engine.current?.rotate(Math.PI / 6) },
    { label: t('拉远', 'Zoom out'), mark: '−', action: () => engine.current?.zoom(1 / 1.2) },
    { label: t('拉近', 'Zoom in'), mark: '+', action: () => engine.current?.zoom(1.2) },
    { label: t('复位镜头', 'Reset camera'), mark: '⌖', action: () => engine.current?.resetCamera() },
  ]
  function chooseCamera(mode: StationCamera) {
    if (!engine.current || mode === cameraMode) return
    engine.current.setCamera(mode)
    setCameraMode(mode)
  }

  return <div className="station-viewport" data-view={view} data-camera={view === '3d' ? cameraMode : undefined} data-ready={view === '3d' && ready}>
    <div className="station-tools">
      <div className="station-view-switch" role="group" aria-label={t('棋盘视图', 'Board view')}>
        {(['3d', '2d'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => switchView(mode)}>{mode.toUpperCase()}</button>)}
      </div>
      {view === '3d' && <div className="station-view-switch station-lens" role="group" aria-label={t('观察视角', 'Camera view')}>
        <button type="button" disabled={!ready} aria-pressed={cameraMode === 'overview'} onClick={() => chooseCamera('overview')}>{t('现场全景', 'Overview')}</button>
        <button type="button" disabled={!ready} aria-pressed={cameraMode === 'follow'} onClick={() => chooseCamera('follow')}>{t('跟随芽芽', 'Follow Sprout')}</button>
      </div>}
      {view === '3d' && <div className="station-camera" role="group" aria-label={t('镜头控制', 'Camera controls')}>
        {tools.map(tool => <button key={tool.mark} type="button" aria-label={tool.label} title={tool.label}
          disabled={!ready} onClick={tool.action}>{tool.mark}</button>)}
      </div>}
    </div>
    <StationActionCue activity={frame.activity} locale={locale} showValue={frame.location !== 'arena' || frame.activity?.action !== 'scan'} />
    {view === '3d' && <>
      <div className="station-stage">
        <canvas ref={canvas} tabIndex={0} data-testid="station-3d-canvas" aria-label={t('三维棋盘，方向键查看格子', '3D board. Use arrow keys to inspect cells')}
          aria-describedby={hintId} onKeyDown={navigateGrid} />
        {!ready && <span className="station-loading" role="status">{t('正在打开三维棋盘…', 'Opening 3D board…')}</span>}
      </div>
    </>}
    {failed && <p className="station-fallback" role="status">{t('当前设备已切换到 2D 棋盘。', 'This device is displaying the 2D board.')}</p>}
    <div className={view === '3d' ? 'station-flat-board station-flat-board--accessible' : 'station-flat-board'}
      role={flatInteractive ? 'group' : undefined} tabIndex={flatInteractive ? 0 : undefined}
      aria-label={flatInteractive ? t('二维棋盘，方向键查看格子', '2D board. Use arrow keys to inspect cells') : undefined}
      data-inspectable={flatInteractive || undefined} onKeyDown={flatInteractive ? navigateGrid : undefined}
      onClick={flatInteractive ? event => {
        const tile = event.target instanceof Element && event.target.closest<HTMLElement>('.tile[data-x][data-y]')
        if (tile) setCell({ x: Number(tile.dataset.x), y: Number(tile.dataset.y) })
      } : undefined}>{children(flatInteractive ? inspected : undefined)}</div>
    {(view === '3d' || flatInteractive) && <div className="station-caption">
      <span id={hintId}>{view === '3d' ? t('拖动旋转 · 点选格子', 'Drag to rotate · Tap a cell') : t('点格子查看机关', 'Tap a cell to inspect it')}</span>
      {inspected && <span className="station-inspection" role="status" data-testid="station-cell-inspection">
        <b>({inspected.x}, {inspected.y})</b> {cellContents(frame, inspected, locale, batteries)}
      </span>}
    </div>}
  </div>
}
