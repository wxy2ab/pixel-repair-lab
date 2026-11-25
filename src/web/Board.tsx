import { useMemo, useRef, type CSSProperties, type ReactNode } from 'react'
import type { GridLevel, GridSnapshot, Locale, Position, Scenario } from '../shared/types'
import { ActionRobot } from './ActionRobot'
import { ArenaTurnEffects } from './ArenaTurnEffects'
import { StationViewport } from './station3d/StationViewport'
import { gridMapTargets } from './station3d/mapTargets'
import { useArenaMapMode } from './ArenaMapMode'
import type { StationFrame } from './station3d/types'
import { tr } from './text'
import { boardDevice, describeDevice, deviceName, emittingRay, hazardName, rayArms } from './gridDeviceDisplay'
import { GridDeviceGlyph } from './GridDeviceGlyph'
import { switchDescription } from './arenaGates'
import { FerryDockIcon } from './icons'
import { CargoGlyph, CargoOverlay, LoadingPadGlyph, cargoLabel } from './WarehouseTiles'
import './arena-chips.css'
import { trailArmsByCell, visibleTrailEdges } from './boardTrail'

const at = (position: Position, x: number, y: number) => position.x === x && position.y === y

export function Robot({ enemy = false }: { enemy?: boolean }) {
  return <span className={'pixel-bot' + (enemy ? ' pixel-bot--enemy' : '')} aria-hidden="true" />
}

export type { ArenaCellChange } from './station3d/types'

function literal(value: unknown) {
  return JSON.stringify(value, null, 0)
}

export function MapTiles({ locale, batteries, trail, ...scene }: Omit<StationFrame, 'trailEdges'> & {
  locale: Locale; batteries?: boolean; trail?: readonly Position[]
}) {
  const trailEdges = useMemo(() => visibleTrailEdges(trail), [trail])
  const frame: StationFrame = { ...scene, trailEdges }
  return (
    <StationViewport frame={frame} locale={locale} batteries={batteries}>
      {(cell, visible) => <FlatMap frame={frame} locale={locale} selected={cell} showMotion={visible} />}
    </StationViewport>
  )
}

export function FlatMap({ frame, locale, selected, cellControl, showMotion = true }: {
  frame: StationFrame; locale: Locale; selected?: Position; cellControl?: (position: Position) => ReactNode; showMotion?: boolean
}) {
  const { tiles, exit, playerPosition, opponents, items, cellChanges } = frame
  const columns = tiles[0].length
  const board = useRef<HTMLDivElement>(null)
  const arms = useMemo(() => trailArmsByCell(frame.trailEdges ?? [], columns), [frame.trailEdges, columns])
  return (
    <div className="map-well" style={{ '--cols': tiles[0].length, '--rows': tiles.length } as CSSProperties}>
      <div className="map-coordinate map-coordinate--x" aria-hidden="true">
        {Array.from({ length: tiles[0].length }, (_, index) => <span key={index}>{index}</span>)}
      </div>
      <div className="map-coordinate map-coordinate--y" aria-hidden="true">
        {tiles.map((_, index) => <span key={index}>{index}</span>)}
      </div>
      <div ref={board} className="tilemap" role={cellControl ? 'group' : 'img'} data-motion-turn={frame.arenaMotion?.turn}
        aria-label={tr(locale, '机器人位于 ' + playerPosition.x + '，' + playerPosition.y, 'Robot at ' + playerPosition.x + ', ' + playerPosition.y)}
      >
        {tiles.flatMap((row, y) => [...row].map((tile, x) => {
          const goal = exit && at(exit, x, y)
          const rivalsHere = opponents.filter(opponent => at(opponent, x, y))
          const item = items.find(candidate => at(candidate, x, y))
          const player = !frame.playerDown && at(playerPosition, x, y)
          const buff = item && frame.arenaBuffs?.find(chip => chip.id === item.id)
          const control = item && frame.arenaSwitches?.find(control => control.itemId === item.id)
          const gate = frame.arenaSwitches?.find(control => control.open.some(cell => at(cell, x, y)))
          const gateState = gate && (tile === '#' ? 'locked' : 'open')
          const target = item && frame.arenaTargetIds?.includes(item.id)
          const shots = frame.arenaShots?.filter(event => event.path?.some(cell => at(cell, x, y)))
          const changes = cellChanges?.filter(change => at(change.position, x, y)).map(change => change.state).join(' ')
          const device = frame.devices?.find(device => at(device, x, y))
          const box = frame.warehouse?.boxes.some(box => at(box, x, y)) ?? false
          const pad = frame.warehouse?.targets.some(pad => at(pad, x, y)) ?? false
          const emitter = emittingRay(device, frame.hazards)
          const hazards = frame.hazards?.filter(hazard => at(hazard, x, y))
          return <span key={x + ':' + y} className={'tile ' + (tile === '#' ? 'tile--wall' : 'tile--floor') + (goal ? ' tile--exit' : '')}
            data-x={x} data-y={y} data-item-id={item?.id} data-arena-change={changes || undefined}
            data-buff={buff?.kind} data-target-item={target || undefined}
            data-gate-switch={control?.itemId} data-switch-gate={gateState}
            data-device-id={device?.id} data-device={device?.kind} data-device-state={device?.status}
            data-crate={box ? (pad ? 'parked' : 'loose') : undefined} data-loading-pad={pad || undefined}
            data-hazard={hazards?.length ? [...new Set(hazards.map(h => h.kind))].join(' ') : undefined}
            data-inspected={selected && at(selected, x, y) || undefined}
            title={control || gate || device || hazards?.length || box || pad ? [control && switchDescription(control.open, locale),
              gate && (tile === '#' ? tr(locale, '闸门已关', 'Gate closed') : tr(locale, '闸门已开', 'Gate open')), cargoLabel(box, pad, locale), device && describeDevice(device, locale),
              ...new Set(hazards?.map(h => hazardName(h.kind, locale)))].filter(Boolean).join(' · ') : undefined}>
            {arms.get(y * columns + x)?.map(arm => <span key={arm.direction} className="board-trail-arm"
              data-trail={arm.recent ? 'recent' : 'history'} data-direction={arm.direction} aria-hidden="true" />)}
            {emitter && <span className="device-ray" data-kind={emitter.kind} data-arm={emitter.direction} aria-hidden="true" />}
            {hazards?.flatMap((hazard, i) => hazard.kind === 'bomb' ? <span key={i} className="device-burst" aria-hidden="true" />
              : rayArms(hazard, device).map(arm => <span key={i + arm} className="device-ray" data-kind={hazard.kind} data-arm={arm} aria-hidden="true" />))}
            {goal && (frame.ferryDock ? <FerryDockIcon /> : <span className="exit-icon" aria-hidden="true">↥</span>)}
            {pad && <LoadingPadGlyph />}
            {device && <GridDeviceGlyph device={device} />}
            {gate && gateState && <GridDeviceGlyph device={{ x, y, id: gate.itemId, kind: 'door', status: gateState }} />}
            {shots?.map(shot => <i key={shot.actorId} className="arena-pulse-line" data-shot-actor={shot.actorId} data-side={shot.actorId === 'player' ? 'player' : 'rival'}
              data-direction={shot.direction} aria-hidden="true" />)}
            {control ? <GridDeviceGlyph device={{ x, y, id: control.itemId, kind: 'switch', status: 'off' }} />
              : buff ? <span className="arena-chip" data-kind={buff.kind} aria-hidden="true">{buff.kind === 'power' ? 'ϟ' : '◆'}</span>
              : item && <span className={frame.arenaBuffs ? (target ? 'arena-parcel' : 'arena-token') : 'gem'} aria-hidden="true" />}
            {rivalsHere.map((rival, index) => rival.label
              ? <span key={rival.id ?? index} className="rival-marker" data-rival-id={rival.id} style={{ '--rival-index': rival.index ?? index } as CSSProperties}><Robot enemy /><small>{rival.label}</small></span>
              : <Robot key={index} enemy />)}
            {player && <ActionRobot activity={frame.activity} locale={locale} />}
            {cellControl?.({ x, y })}
          </span>
        }))}
        {frame.warehouse && <CargoOverlay {...frame.warehouse} arrival={frame.warehouseArrival} />}
      </div>
      {showMotion && frame.arenaMotion && <ArenaTurnEffects board={board} motion={frame.arenaMotion} />}
    </div>
  )
}

export function Board({ level, snapshot, locale, trail, activity, warehouseArrival, showHardware = true, exitLabel }: {
  level: Scenario & Pick<GridLevel, 'ferry'>; snapshot: GridSnapshot; locale: Locale; trail?: readonly Position[]; activity?: StationFrame['activity']; showHardware?: boolean; exitLabel?: string
  warehouseArrival?: StationFrame['warehouseArrival']
}) {
  const mapMode = useArenaMapMode()
  const exit = level.objectives.find(goal => goal.type === 'exit')
  const drops = snapshot.items.length > 0 || Boolean(level.items?.length)
  const state = snapshot.devices
  const devices = state && level.devices?.map(device => boardDevice(device, state, snapshot.turn))
  const deviceLegend = devices?.filter((device, i) => devices.findIndex(other => other.kind === device.kind) === i)
  return (
    <>
      <MapTiles tiles={level.tiles} exit={exit} ferryDock={Boolean(level.ferry)} playerPosition={snapshot.player} opponents={snapshot.enemies} items={snapshot.items}
        warehouse={level.warehouse && { boxes: snapshot.boxes ?? level.warehouse.boxes, targets: level.warehouse.targets }}
        warehouseArrival={warehouseArrival}
        mapTargets={mapMode ? gridMapTargets(level, snapshot) : undefined}
        activity={activity}
        devices={devices} hazards={state?.hazards} locale={locale} trail={trail} />
      <div className="board-legend" aria-label={tr(locale, '图例', 'Legend')}>
        <span><i className="legend-player" />{tr(locale, '芽芽', 'Sprout')}</span>
        {exit && <span><i className="legend-exit" />{exitLabel ?? tr(locale, '出口', 'Exit')}</span>}
        {drops && <span><i className="legend-item" />{tr(locale, '零件', 'Part')}</span>}
        {level.warehouse && <>
          <span><CargoGlyph />{tr(locale, '货箱', 'Crate')}</span>
          <span><LoadingPadGlyph />{tr(locale, '货位', 'Loading pad')}</span>
        </>}
        {Boolean(level.enemies?.length) && <span><i className="legend-enemy" />{tr(locale, '巡逻机器人', 'Patrol bot')}</span>}
        {deviceLegend?.map(device => <span key={device.kind}><GridDeviceGlyph device={device} legend />{deviceName(device.kind, locale)}</span>)}
        <span className="turn-display" data-testid={level.turnLimit === undefined ? undefined : 'grid-turn-budget'}>
          {tr(locale, '回合', 'Turn')} <strong>{snapshot.turn}{level.turnLimit === undefined ? '' : ` / ${level.turnLimit}`}</strong>
        </span>
      </div>
      {showHardware && level.input !== undefined && !snapshot.memory.length && (
        <section className="hardware-panel">
          <h3>{tr(locale, '扫描数据', 'Scan input')}</h3>
          <code>{literal(level.input)}</code>
        </section>
      )}
      {showHardware && snapshot.memory.length > 0 && (
        <section className="hardware-panel">
          {level.input !== undefined && <div className="memory-input"><h3>{tr(locale, '扫描数据', 'Scan input')}</h3><code>{literal(level.input)}</code></div>}
          <h3>{tr(locale, '内存', 'Memory')}</h3>
          <div className="memory-grid">{snapshot.memory.map((value, address) => <div key={address}><small>{address}</small><code>{value}</code></div>)}</div>
          {level.instructions && <>
            <div className="cpu-registers">
              <span>{tr(locale, '程序计数器', 'Program counter')} <code>{snapshot.pc}</code></span>
              <span>{tr(locale, '累加器', 'Accumulator')} <code>{snapshot.accumulator}</code></span>
              {snapshot.halted && <strong>HALT</strong>}
            </div>
            <ol className="cpu-instructions">
              {level.instructions.map((instruction, address) => <li key={address} className={snapshot.pc === address && !snapshot.halted ? 'active' : ''}>
                <small>{address}</small> <code>{instruction.op}{'address' in instruction ? ' ' + instruction.address : ''}</code>
              </li>)}
            </ol>
          </>}
        </section>
      )}
    </>
  )
}
