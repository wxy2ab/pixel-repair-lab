import { useCallback, useContext, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Locale, Position } from '../../shared/types'
import { tr } from '../text'
import { describeDevice, hazardName } from '../gridDeviceDisplay'
import { switchDescription } from '../arenaGates'
import type { createStationRenderer } from './renderer'
import type { StationCamera, StationFrame } from './types'
import { StationActionCue } from '../StationActionCue'
import { ArenaMapControlsContext, isWorkspaceShortcut, useArenaKeyboardMode, useArenaMapMode } from '../ArenaMapMode'
import { useMapCameraControls } from './useMapCameraControls'
import { StationMinimap } from './StationMinimap'
import { cargoLabel } from '../WarehouseTiles'
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
    !frame.playerDown && here(frame.playerPosition) && t('芽芽', 'Sprout'),
    ...frame.opponents.filter(here).map(bot => bot.name ?? (bot.label ? t(`对手 ${bot.label}`, `Rival ${bot.label}`) : t('巡逻机器人', 'Patrol bot'))),
    ...frame.items.filter(here).map(item => {
      const control = frame.arenaSwitches?.find(control => control.itemId === item.id)
      if (control) return switchDescription(control.open, locale)
      const chip = frame.arenaBuffs?.find(buff => buff.id === item.id)
      const name = chip ? (chip.kind === 'power' ? t('增幅芯片', 'Power chip') : t('护盾芯片', 'Shield chip'))
        : frame.arenaBuffs ? t('道具', 'Item') : batteries ? t('电池', 'Battery') : t('零件', 'Part')
      return (frame.arenaTargetIds?.includes(item.id) ? t('目标道具', 'Target item') : name) + ' · ' + item.id
    }),
    ...new Set(frame.arenaShots?.filter(shot => shot.path?.some(here)).map(shot =>
      shot.actorId === 'player' ? t('芽芽的脉冲', 'Sprout’s pulse') : t('对手的脉冲', 'Rival pulse'))),
    ...(frame.devices ?? []).filter(here).map(device => describeDevice(device, locale)),
    frame.warehouse && cargoLabel(frame.warehouse.boxes.some(here), frame.warehouse.targets.some(here), locale),
    ...new Set(frame.hazards?.filter(here).map(hazard => hazardName(hazard.kind, locale))),
    here(frame.exit) && (frame.ferryDock ? t('渡口', 'Ferry dock') : t('出口', 'Exit')),
    frame.gates?.some(here) && (frame.tiles[cell.y]?.[cell.x] === '#' ? t('通道已关', 'Gate closed') : t('通道已开', 'Gate open')),
  ].filter(Boolean)
  return labels.length ? labels.join(' · ') : frame.tiles[cell.y]?.[cell.x] === '#' ? t('墙', 'Wall') : t('地板', 'Floor')
}

export function StationViewport({ frame, locale, batteries = false, children }: {
  frame: StationFrame; locale: Locale; batteries?: boolean; children: (selected: Position | undefined, visible: boolean) => ReactNode
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
  const mapNavigation = useArenaMapMode()
  const keyboardMode = useArenaKeyboardMode()
  const inspectWithKeys = keyboardMode !== 'player'
  const workspaceControls = useContext(ArenaMapControlsContext)
  const showOverview = useCallback(() => setCameraMode('overview'), [])
  const [footprint, setFootprint] = useState<Position[]>([])
  const updateFootprint = useCallback((points: Position[]) => {
    setFootprint(previous => previous.length === points.length && previous.every((p, i) =>
      Math.abs(p.x - points[i].x) < .001 && Math.abs(p.y - points[i].y) < .001) ? previous : points)
  }, [])
  const mapCamera = useMapCameraControls(mapNavigation, inspectWithKeys, view, canvas, engine, showOverview,
    frame.tiles[0].length, frame.tiles.length, updateFootprint)
  const inspectFlat = Boolean(keyboardMode || mapNavigation || frame.devices?.length || frame.arenaBuffs || frame.warehouse)
  const flatInteractive = view === '2d' && inspectFlat
  const inspected = cell && frame.tiles[cell.y]?.[cell.x] !== undefined ? cell : undefined
  const selectionOnOpen = useRef<Position | undefined>(undefined)
  const flatContent = useMemo(() => children(flatInteractive ? inspected : undefined, view === '2d'), [children, flatInteractive, inspected, view])

  useLayoutEffect(() => {
    latest.current = frame
    engine.current?.update(frame)
  }, [frame])

  useLayoutEffect(() => {
    const mode = engine.current?.setMapNavigation(mapNavigation)
    if (mode) setCameraMode(mode)
  }, [mapNavigation, ready])

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
      engine.current = createStationRenderer(surface, latest.current, {
        onInspect: setCell, onFailure: fallback, onMapFootprint: updateFootprint,
      })
      if (selectionOnOpen.current) engine.current.inspectCell(selectionOnOpen.current)
      setReady(true)
    }).catch(fallback)
    return () => {
      active = false
      engine.current?.dispose()
      engine.current = null
    }
  }, [view, updateFootprint])

  function switchView(next: View) {
    if (next === view) return
    if (next === '3d') graphicsUnavailable = false
    setFailed(false)
    setFootprint([])
    setReady(false)
    selectionOnOpen.current = inspectFlat ? inspected : undefined
    setCell(selectionOnOpen.current)
    setCameraMode('overview')
    setView(next)
    try { localStorage.setItem(viewKey, next) } catch { /* The current board still switches. */ }
  }

  function navigateGrid(event: KeyboardEvent) {
    if (!inspectWithKeys || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.keyCode === 229) return
    const origin = inspected ?? frame.playerPosition
    if (view === '3d' && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      if (!event.repeat) engine.current?.activateCell(origin)
      return
    }
    const directions: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
    const offset = directions[event.key]
    if (!offset) return
    event.preventDefault()
    const next = {
      x: Math.max(0, Math.min(frame.tiles[0].length - 1, origin.x + offset[0])),
      y: Math.max(0, Math.min(frame.tiles.length - 1, origin.y + offset[1])),
    }
    if (flatInteractive) setCell(next)
    else engine.current?.inspectCell(next)
  }

  const navigateFromWorkspace = useEffectEvent(navigateGrid)
  useEffect(() => {
    if (keyboardMode !== 'map') return
    const workspace = mapCamera.flat.current?.closest('.arena-map-workspace') ?? null
    function onWorkspaceArrow(event: KeyboardEvent) {
      // Entering fullscreen or removing the Start button can leave focus off the board.
      if (event.target !== workspace && event.target !== document.body && event.target !== document.documentElement) return
      if (event.key.startsWith('Arrow') && isWorkspaceShortcut(event, workspace)) navigateFromWorkspace(event)
    }
    window.addEventListener('keydown', onWorkspaceArrow)
    return () => window.removeEventListener('keydown', onWorkspaceArrow)
  }, [keyboardMode, mapCamera.flat])

  const tools = [
    { label: t('向左旋转', 'Rotate left'), mark: '↶', action: () => engine.current?.rotate(-Math.PI / 6) },
    { label: t('向右旋转', 'Rotate right'), mark: '↷', action: () => engine.current?.rotate(Math.PI / 6) },
    { label: t('拉远', 'Zoom out'), mark: '−', action: () => mapCamera.zoom(1 / 1.2) },
    { label: t('拉近', 'Zoom in'), mark: '+', action: () => mapCamera.zoom(1.2) },
    { label: mapNavigation ? t('适应全图', 'Fit map') : t('复位镜头', 'Reset camera'), mark: '⌖', action: mapNavigation ? mapCamera.fit : () => engine.current?.resetCamera() },
  ]
  function chooseCamera(mode: StationCamera) {
    if (!engine.current || mode === cameraMode) return
    engine.current.setCamera(mode)
    setCameraMode(mode)
  }

  const dimension = t(view === '3d' ? '三维' : '二维', view.toUpperCase())
  const boardLabel = dimension + (keyboardMode === 'player'
    ? t('棋盘，方向键移动芽芽', ' board. Use arrow keys to move Sprout')
    : mapNavigation ? t('地图，W A S D 平移', ' map. Pan with W A S D')
      : t('棋盘，方向键查看格子', ' board. Use arrow keys to inspect cells'))

  return <div className="station-viewport" data-view={view} data-map-navigation={mapNavigation || undefined} data-warehouse={frame.warehouse ? true : undefined}
    data-camera={view === '3d' ? cameraMode : undefined} data-ready={view === '3d' && ready}>
    <div className="station-tools">
      <div className="station-view-switch" role="group" aria-label={t('棋盘视图', 'Board view')}>
        {(['3d', '2d'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => switchView(mode)}>{mode.toUpperCase()}</button>)}
      </div>
      {view === '3d' && <div className="station-view-switch station-lens" role="group" aria-label={t('观察视角', 'Camera view')}>
        <button type="button" disabled={!ready} aria-pressed={cameraMode === 'overview'} onClick={() => chooseCamera('overview')}>{t('现场全景', 'Overview')}</button>
        <button type="button" disabled={!ready} aria-pressed={cameraMode === 'follow'} onClick={() => chooseCamera('follow')}>{t('跟随芽芽', 'Follow Sprout')}</button>
      </div>}
      {(view === '3d' || mapNavigation) && <div className="station-camera" role="group" aria-label={t('镜头控制', 'Camera controls')}>
        {(view === '3d' ? tools : tools.slice(2)).map(tool => <button key={tool.mark} type="button" aria-label={tool.label} title={tool.label}
          disabled={view === '3d' && !ready} onClick={tool.action}>{tool.mark}</button>)}
      </div>}
      {workspaceControls}
    </div>
    <StationActionCue activity={frame.activity} locale={locale} showValue={frame.location !== 'arena' || frame.activity?.action !== 'scan'} />
    {view === '3d' && <>
      <div className="station-stage">
        <canvas ref={canvas} tabIndex={0} data-testid="station-3d-canvas" aria-label={boardLabel}
          aria-keyshortcuts={inspectWithKeys ? 'Enter Space' : undefined} aria-describedby={hintId} onKeyDown={event => navigateGrid(event.nativeEvent)} />
        {!ready && <span className="station-loading" role="status">{t('正在打开三维棋盘…', 'Opening 3D board…')}</span>}
      </div>
    </>}
    {failed && <p className="station-fallback" role="status">{t('当前设备已切换到 2D 棋盘。', 'This device is displaying the 2D board.')}</p>}
    <div ref={mapCamera.flat} className={view === '3d' ? 'station-flat-board station-flat-board--accessible' : 'station-flat-board'}
      role={flatInteractive ? 'group' : undefined} tabIndex={flatInteractive ? 0 : undefined}
      aria-label={flatInteractive ? boardLabel : undefined}
      data-inspectable={flatInteractive || undefined} onKeyDown={flatInteractive ? event => navigateGrid(event.nativeEvent) : undefined}
      onClick={flatInteractive ? event => {
        const tile = event.target instanceof Element && event.target.closest<HTMLElement>('.tile[data-x][data-y]')
        if (tile) setCell({ x: Number(tile.dataset.x), y: Number(tile.dataset.y) })
      } : undefined}>{flatContent}</div>
    {mapNavigation && <StationMinimap frame={frame} locale={locale} footprint={footprint}
      ready={view === '2d' || ready} onCenter={(cell, focusMap?: boolean) => {
        mapCamera.centerOn(cell)
        if (focusMap) (view === '2d' ? mapCamera.flat.current : canvas.current)?.focus({ preventScroll: true })
      }} />}
    {(view === '3d' || flatInteractive) && <div className="station-caption">
      <span id={hintId}>{mapNavigation ? t('拖动平移 · 滚轮缩放', 'Drag to pan · Scroll to zoom') : view === '3d' ? t('拖动旋转 · 点选格子', 'Drag to rotate · Tap a cell') : t(frame.warehouse ? '点选格子' : '点格子查看机关', 'Tap a cell to inspect it')}</span>
      {inspected && <span className="station-inspection" role="status" data-testid="station-cell-inspection">
        <b>({inspected.x}, {inspected.y})</b> {cellContents(frame, inspected, locale, batteries)}
      </span>}
    </div>}
  </div>
}
