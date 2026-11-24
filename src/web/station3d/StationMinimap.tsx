import { useId, useMemo, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Locale, Position } from '../../shared/types'
import { tr } from '../text'
import type { StationFrame } from './types'
import './station-minimap.css'

const preferenceKey = 'pixel-repair-lab:minimap-collapsed'
const directions: Record<string, Position> = {
  ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
}

function wallPath(tiles: readonly string[]) {
  return tiles.flatMap((row, y) => Array.from(row.matchAll(/#+/g), run => {
    const length = run[0].length
    return `M${run.index} ${y}h${length}v1h-${length}z`
  })).join(' ')
}

export function StationMinimap({ frame, locale, footprint, onCenter, ready = true }: {
  frame: StationFrame; locale: Locale; footprint: readonly Position[]; onCenter: (cell: Position, focusMap?: boolean) => void; ready?: boolean
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(preferenceKey) === 'true' } catch { return false }
  })
  const [cursor, setCursor] = useState<Position>()
  const id = useId()
  const width = frame.tiles[0].length, height = frame.tiles.length
  const walls = useMemo(() => wallPath(frame.tiles), [frame.tiles])
  const player = t('芽芽', 'Sprout'), rival = t('对手', 'Rival'), target = t('目标', 'Goal'), sight = t('视野', 'View')
  const back = t('回到芽芽', 'Back to Sprout')
  const toggleLabel = collapsed ? t('展开小地图', 'Show minimap') : t('收起小地图', 'Hide minimap')

  function toggle() {
    setCollapsed(!collapsed)
    try { localStorage.setItem(preferenceKey, String(!collapsed)) } catch { /* The current map can still be folded. */ }
  }

  function center(x: number, y: number, focusMap = false) {
    if (!ready) return
    const cell = {
      x: Math.max(0, Math.min(width - 1, Math.floor(x))),
      y: Math.max(0, Math.min(height - 1, Math.floor(y))),
    }
    setCursor(cell)
    onCenter(cell, focusMap)
  }

  function pick(event: MouseEvent<SVGSVGElement>) {
    const transform = event.currentTarget.getScreenCTM()
    if (!transform) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse())
    if (point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height) center(point.x, point.y, true)
  }

  function navigate(event: KeyboardEvent<SVGSVGElement>) {
    if (event.metaKey || event.ctrlKey || event.altKey || event.nativeEvent.isComposing) return
    const step = directions[event.key]
    if (!step) return
    event.preventDefault()
    const cell = cursor ?? frame.playerPosition
    center(cell.x + step.x, cell.y + step.y)
  }

  return <section className="station-minimap" data-testid="station-minimap" data-collapsed={collapsed || undefined}
    data-map-keyboard-exclude aria-label={t('小地图', 'Minimap')}>
    <div className="station-minimap__bar">
      <button type="button" onClick={toggle} onMouseDown={event => event.preventDefault()} aria-expanded={!collapsed} aria-controls={id}
        aria-label={toggleLabel} title={toggleLabel}>
        <svg aria-hidden="true" viewBox="0 0 16 16"><path d={collapsed ? 'm4 6 4 4 4-4' : 'm4 10 4-4 4 4'} /></svg>
        {t('小地图', 'Map')}
      </button>
      <button type="button" disabled={!ready} onClick={event => center(frame.playerPosition.x, frame.playerPosition.y, event.detail > 0)} aria-label={back} title={back}>
        <svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" /><path d="M8 1v4m0 6v4M1 8h4m6 0h4" /></svg>
        {t('回到芽芽', 'Sprout')}
      </button>
    </div>
    <div hidden={collapsed} id={id}>
      {!collapsed && <>
        <svg viewBox={`0 0 ${width} ${height}`} className="station-minimap__surface" data-testid="minimap-surface"
          style={{ width: `min(100%, calc(var(--minimap-height) * ${width / height}))` }}
          role="application" tabIndex={ready ? 0 : -1} aria-disabled={!ready}
          aria-label={t('小地图导航，点选格子或用方向键移动镜头', 'Minimap navigation. Tap a cell or use the arrow keys to move the camera.')}
          onClick={pick} onKeyDown={navigate} onBlur={() => setCursor(undefined)}>
          <rect width={width} height={height} fill="#172e3e" />
          <path d={walls} fill="#547083" />
          {footprint.length >= 3 && <polygon className="station-minimap__footprint" data-testid="minimap-footprint"
            points={footprint.map(point => `${point.x},${point.y}`).join(' ')} vectorEffect="non-scaling-stroke"><title>{sight}</title></polygon>}
          {frame.mapTargets?.map(({ x, y, id: itemId }, index) => <path key={itemId ?? index} data-minimap-marker="target"
            data-id={itemId} data-x={x} data-y={y} transform={`translate(${x + .5} ${y + .5})`}
            d="M0,-.59 L.59,0 L0,.59 L-.59,0 Z" className="station-minimap__target"><title>{target} ({x}, {y})</title></path>)}
          {frame.opponents.map((opponent, index) => <rect key={opponent.id ?? index} data-minimap-marker="rival" data-id={opponent.id}
            data-x={opponent.x} data-y={opponent.y} x={opponent.x + .19} y={opponent.y + .19} width=".62" height=".62" rx=".11"
            className="station-minimap__rival"><title>{opponent.name ?? rival} ({opponent.x}, {opponent.y})</title></rect>)}
          {!frame.playerDown && <circle data-minimap-marker="player" data-x={frame.playerPosition.x} data-y={frame.playerPosition.y}
            cx={frame.playerPosition.x + .5} cy={frame.playerPosition.y + .5} r=".40" className="station-minimap__player">
            <title>{player} ({frame.playerPosition.x}, {frame.playerPosition.y})</title></circle>}
          {cursor && <rect className="station-minimap__cursor" x={cursor.x - .08} y={cursor.y - .08} width="1.16" height="1.16"
            fill="none" stroke="white" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        </svg>
        <div className="station-minimap__legend">
          <span><i data-symbol="player" />{player}</span>
          {frame.opponents.length > 0 && <span><i data-symbol="rival" />{rival}</span>}
          {Boolean(frame.mapTargets?.length) && <span><i data-symbol="target" />{target}</span>}
          <span><i data-symbol="view" />{sight}</span>
        </div>
      </>}
    </div>
  </section>
}
