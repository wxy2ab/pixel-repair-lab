import { useCallback, useContext, useEffect, useEffectEvent, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Locale, Position } from '../../shared/types'
import { tr } from '../text'
import { describeDevice, hazardName } from '../gridDeviceDisplay'
import { switchDescription } from '../arenaGates'
import type { createStationRenderer } from './renderer'
import type { StationCamera, StationFrame } from './types'
import { StationActionCue } from '../StationActionCue'
import { ArenaAttackSpeedControl } from '../ArenaAttackSpeed'
import { arenaBoardInView } from '../arenaBoardVisibility'
import { ArenaMapControlsContext, isWorkspaceShortcut, useArenaKeyboardMode, useArenaMapMode, useArenaTouchMove, useArenaTouchTap } from '../ArenaMapMode'
import { useMapCameraControls } from './useMapCameraControls'
import { useMapTouchGestures } from './useMapTouchGestures'
import { useBoardTouchMove } from './useBoardTouchMove'
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

function flatCellAt(target: EventTarget | null) {
  const tile = target instanceof Element && target.closest<HTMLElement>('.tile[data-x][data-y]')
  if (tile) return { x: Number(tile.dataset.x), y: Number(tile.dataset.y) }
}

function cellContents(frame: StationFrame, cell: Position, locale: Locale, batteries: boolean) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const here = (position?: Position) => position?.x === cell.x && position.y === cell.y
  const robots = frame.arenaIntegrity ? frame.arenaIntegrity.flatMap((actor, index) => {
    if (!here(actor)) return []
    const name = actor.name ?? frame.opponents.find(bot => bot.id === actor.id)?.name
      ?? (index ? t(`对手 ${index}`, `Rival ${index}`) : t('芽芽', 'Sprout'))
    if (actor.hp === 0) return t(`${name}的残骸`, `${name} wreck`)
    if (actor.hp !== undefined && frame.arenaMaxHealth !== undefined && actor.hp < frame.arenaMaxHealth) return t(`${name} · 机体受损`, `${name} · damaged hull`)
    return name
  }) : [
    !frame.playerDown && here(frame.playerPosition) && t('芽芽', 'Sprout'),
    ...frame.opponents.filter(here).map(bot => bot.name ?? (bot.label ? t(`对手 ${bot.label}`, `Rival ${bot.label}`) : t('巡逻机器人', 'Patrol bot'))),
  ]
  const labels = [
    ...robots,
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

export function StationViewport({ frame, locale, batteries = false, children, onSurfaceVisible }: {
  frame: StationFrame; locale: Locale; batteries?: boolean; children: (selected: Position | undefined, visible: boolean) => ReactNode
  onSurfaceVisible?: (visible: boolean) => void
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
  const touchMove = useArenaTouchMove()
  const touchTap = useArenaTouchTap()
  const keyboardMode = useArenaKeyboardMode()
  const inspectWithKeys = keyboardMode !== 'player'
  const workspaceControls = useContext(ArenaMapControlsContext)
  const inlineMap = Boolean(workspaceControls)
  const hasMapCamera = mapNavigation || inlineMap
  const showOverview = useCallback(() => setCameraMode('overview'), [])
  const [footprint, setFootprint] = useState<Position[]>([])
  const updateFootprint = useCallback((points: Position[]) => {
    setFootprint(previous => previous.length === points.length && previous.every((p, i) =>
      Math.abs(p.x - points[i].x) < .001 && Math.abs(p.y - points[i].y) < .001) ? previous : points)
  }, [])
  const mapCamera = useMapCameraControls(mapNavigation, inlineMap, inspectWithKeys, view, canvas, engine, showOverview,
    frame.tiles[0].length, frame.tiles.length, updateFootprint)
  const surfaceRef = view === '3d' ? canvas : mapCamera.flat
  useMapTouchGestures(surfaceRef, hasMapCamera && !touchMove, mapCamera.pan, mapCamera.zoom, point => {
    if (view === '3d') engine.current?.pick(point.x, point.y)
    // Flat tiles already receive their native tap as a click.
  })
  function tapBoard(x: number, y: number) {
    const target = document.elementFromPoint(x, y)
    const surface = view === '3d' ? canvas.current : mapCamera.flat.current
    if (!target || !surface?.contains(target)) return
    const cell = view === '3d' ? engine.current?.cellAt(x, y) : flatCellAt(target)
    if (cell) touchTap?.(cell)
  }
  useBoardTouchMove(surfaceRef, view === '2d' || ready ? touchMove : null, hasMapCamera,
    view === '3d' ? (dx, dy) => engine.current?.swipeDirection(dx, dy) : undefined, touchTap ? tapBoard : undefined)
  const inspectFlat = Boolean(keyboardMode || hasMapCamera || frame.devices?.length || frame.arenaBuffs || frame.warehouse)
  const flatInteractive = view === '2d' && inspectFlat
  const inspected = cell && frame.tiles[cell.y]?.[cell.x] !== undefined ? cell : undefined
  const selectionOnOpen = useRef<Position | undefined>(undefined)
  const flatContent = useMemo(() => children(flatInteractive ? inspected : undefined, view === '2d'), [children, flatInteractive, inspected, view])

  useLayoutEffect(() => {
    if (!onSurfaceVisible) return
    const surface = view === '3d' ? canvas.current : hasMapCamera ? mapCamera.flat.current : mapCamera.flat.current?.querySelector<HTMLElement>('.tilemap')
    if (!surface || (view === '3d' && !ready)) {
      onSurfaceVisible(false)
      return
    }
    const publish = () => onSurfaceVisible(!document.hidden && arenaBoardInView(surface))
    const observer = new IntersectionObserver(publish, { threshold: [0, .2, .4, .6, .8, 1] })
    const sizes = new ResizeObserver(publish)
    sizes.observe(surface)
    const workspace = surface.closest('.arena-map-workspace')
    workspace?.querySelectorAll('.play-toolbar, .arena-console').forEach(panel => sizes.observe(panel))
    // Closing the editor can expose a held shot without resizing the board.
    const consoleChanges = new MutationObserver(publish)
    if (workspace) consoleChanges.observe(workspace, { attributes: true, attributeFilter: ['data-console'] })
    publish()
    observer.observe(surface)
    window.addEventListener('scroll', publish, { capture: true, passive: true })
    window.addEventListener('resize', publish)
    document.addEventListener('visibilitychange', publish)
    return () => {
      observer.disconnect()
      sizes.disconnect()
      consoleChanges.disconnect()
      window.removeEventListener('scroll', publish, true)
      window.removeEventListener('resize', publish)
      document.removeEventListener('visibilitychange', publish)
      onSurfaceVisible(false)
    }
  }, [view, ready, hasMapCamera, mapCamera.flat, onSurfaceVisible])

  useLayoutEffect(() => {
    latest.current = frame
    engine.current?.update(frame)
  }, [frame])

  useLayoutEffect(() => {
    const mode = engine.current?.setMapNavigation(mapNavigation, inlineMap)
    if (mode) setCameraMode(mode)
  }, [mapNavigation, inlineMap, ready])

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
    { label: mapNavigation ? t('适应全图', 'Fit map') : t('复位镜头', 'Reset camera'), mark: '⌖', action: mapNavigation || view === '2d' ? mapCamera.fit : () => engine.current?.resetCamera() },
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

  return <div className="station-viewport" data-view={view} data-map-navigation={mapNavigation || undefined} data-inline-map={inlineMap || undefined} data-touch-player={touchMove ? true : undefined}
    data-warehouse={frame.warehouse ? true : undefined}
    data-camera={view === '3d' ? cameraMode : undefined} data-ready={view === '3d' && ready}>
    <div className="station-tools">
      <div className="station-view-switch" role="group" aria-label={t('棋盘视图', 'Board view')}>
        {(['3d', '2d'] as const).map(mode => <button key={mode} type="button" aria-pressed={view === mode} onClick={() => switchView(mode)}>{mode.toUpperCase()}</button>)}
      </div>
      {view === '3d' && <div className="station-view-switch station-lens" role="group" aria-label={t('观察视角', 'Camera view')}>
        <button type="button" disabled={!ready} aria-pressed={cameraMode === 'overview'} onClick={() => chooseCamera('overview')}>{t('现场全景', 'Overview')}</button>
        <button type="button" disabled={!ready} aria-pressed={cameraMode === 'follow'} onClick={() => chooseCamera('follow')}>{t('跟随芽芽', 'Follow Sprout')}</button>
      </div>}
      {(view === '3d' || hasMapCamera) && <div className="station-camera" role="group" aria-label={t('镜头控制', 'Camera controls')}>
        {(view === '3d' ? tools : tools.slice(2)).map(tool => <button key={tool.mark} type="button" aria-label={tool.label} title={tool.label}
          disabled={view === '3d' && !ready} onClick={tool.action}>{tool.mark}</button>)}
      </div>}
      {keyboardMode && frame.arenaMaxHealth !== undefined && <ArenaAttackSpeedControl locale={locale} />}
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
      aria-describedby={flatInteractive ? hintId : undefined}
      data-inspectable={flatInteractive || undefined} onKeyDown={flatInteractive ? event => navigateGrid(event.nativeEvent) : undefined}
      onClick={flatInteractive ? event => {
        const cell = flatCellAt(event.target)
        if (cell) setCell(cell)
      } : undefined}>{flatContent}</div>
    {mapNavigation && <StationMinimap frame={frame} locale={locale} footprint={footprint}
      ready={view === '2d' || ready} onCenter={(cell, focusMap?: boolean) => {
        mapCamera.centerOn(cell)
        if (focusMap) (view === '2d' ? mapCamera.flat.current : canvas.current)?.focus({ preventScroll: true })
      }} />}
    {(view === '3d' || flatInteractive) && <div className="station-caption">
      <span id={hintId}>{touchTap ? t('点空地走过去 · 点相邻箱子或滑动推箱', 'Tap floor to walk · Tap a neighboring crate or swipe to push')
        : touchMove ? t('滑动让芽芽走一格', 'Swipe to move Sprout one square')
        : hasMapCamera ? <><span className="station-touch-hint">{t('单指平移 · 双指缩放', 'Drag to pan · Pinch to zoom')}</span>
          <span className="station-pointer-hint">{view === '3d' && inlineMap ? t('拖动旋转 · 点选格子', 'Drag to rotate · Click a cell') : t('拖动平移 · 点 ＋ 或 − 缩放', 'Drag to pan · Click + or − to zoom')}</span></>
          : view === '3d' ? t('拖动旋转 · 点选格子', 'Drag to rotate · Tap a cell') : t(frame.warehouse ? '点选格子' : '点格子查看机关', 'Tap a cell to inspect it')}</span>
      {inspected && <span className="station-inspection" role="status" data-testid="station-cell-inspection">
        <b>({inspected.x}, {inspected.y})</b> {cellContents(frame, inspected, locale, batteries)}
      </span>}
    </div>}
  </div>
}
