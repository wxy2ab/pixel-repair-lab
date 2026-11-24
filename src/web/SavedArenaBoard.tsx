import type { CSSProperties } from 'react'
import type { ArenaPreviewBoard } from '../engine/arenaMatchPreview'
import type { ArenaLevel } from '../shared/advanced'
import type { Locale, Position } from '../shared/types'
import { changedSavedArenaLocations, type SavedArenaChangeKind } from './savedArenaChanges'
import { tr } from './text'
import './saved-arena-board.css'

const cellKey = ({ x, y }: Position) => `${x},${y}`
const coordinates = ({ x, y }: Position) => `(${x}, ${y})`
const changeKinds = ['player', 'rivals', 'battery', 'gate'] as const

export function SavedArenaBoard({ level, board, compareBoard, locale, testId, onSelectChange, selectedChange }: {
  level: ArenaLevel
  board: ArenaPreviewBoard
  compareBoard?: ArenaPreviewBoard
  locale: Locale
  testId: string
  onSelectChange?: (kind: SavedArenaChangeKind, position: Position) => void
  selectedChange?: { kind: SavedArenaChangeKind; positions: readonly Position[] }
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const sprout = t('芽芽', 'Sprout')
  const namedOpponents = new Map(level.opponents.map(({ id, title }, index) => [id, { name: title[locale], marker: String(index + 1) }]))
  const actors = board.actors.map(actor => ({
    ...actor,
    name: actor.id === 'player' ? sprout : namedOpponents.get(actor.id)?.name ?? actor.id,
    marker: actor.id === 'player' ? t('芽', 'S') : namedOpponents.get(actor.id)?.marker ?? '?',
  }))
  const gates = new Map((level.shifts ?? []).flatMap(({ open = [], close = [] }) => [...open, ...close])
    .map(position => [cellKey(position), position]))
  const items = new Map(board.items.map(item => [cellKey(item), item]))
  const gateIsOpen = ({ x, y }: Position) => board.tiles[y]?.[x] === '.'
  const changes = compareBoard ? {
    player: changedSavedArenaLocations(board.actors.filter(actor => actor.id === 'player'), compareBoard.actors.filter(actor => actor.id === 'player')),
    rivals: changedSavedArenaLocations(board.actors.filter(actor => actor.id !== 'player'), compareBoard.actors.filter(actor => actor.id !== 'player')),
    battery: changedSavedArenaLocations(board.items, compareBoard.items),
    gate: new Map([...gates].filter(([, position]) => gateIsOpen(position) !== (compareBoard.tiles[position.y]?.[position.x] === '.'))),
  } : undefined
  const selectedPositions = changes && selectedChange ? new Set(selectedChange.positions.map(cellKey)) : undefined
  const changeLabels = {
    player: t('芽芽位置', 'Sprout position'),
    rivals: t('对手位置', 'Rival positions'),
    battery: level.combat ? t('剩余道具', 'Remaining items') : t('剩余电池', 'Remaining batteries'),
    gate: t('通道开关', 'Gate states'),
  }
  const listPositions = (positions: Position[]) => positions.map(coordinates).join(t('、', ', '))
  const changeDetails = changes ? changeKinds.flatMap(kind => {
    const cells = [...changes[kind].values()]
    if (!cells.length) return []
    const positions = listPositions(cells)
    return [t(`${changeLabels[kind]}有变化的格子 ${positions}`, `${changeLabels[kind]} changed at ${positions}`)]
  }) : []
  const noChanges = t('棋盘没有变化', 'No board changes')
  const openGates = [...gates.values()].filter(gateIsOpen)
  const closedGates = [...gates.values()].filter(gate => !gateIsOpen(gate))
  const description = [
    t('保存时的棋盘', 'Saved board'),
    ...actors.map(actor => t(`${actor.name}位于 ${coordinates(actor)}`, `${actor.name} at ${coordinates(actor)}`)),
    items.size ? t(level.combat ? '道具位于 ' : '电池位于 ', level.combat ? 'Items at ' : 'Batteries at ') + listPositions(board.items)
      : level.combat ? t('没有剩余道具', 'No items left') : t('没有剩余电池', 'No batteries left'),
    ...(openGates.length ? [t(`开启的门位于 ${listPositions(openGates)}`, `Open gates at ${listPositions(openGates)}`)] : []),
    ...(closedGates.length ? [t(`关闭的门位于 ${listPositions(closedGates)}`, `Closed gates at ${listPositions(closedGates)}`)] : []),
    ...(changes && !changeDetails.length ? [noChanges] : changeDetails),
  ].join(t('。', '. '))

  return <figure className="saved-arena-board" data-testid={testId}>
    <div className="saved-arena-board-grid" role={changeDetails.length > 0 && onSelectChange ? 'group' : 'img'} aria-label={description}
      style={{ '--board-cols': board.tiles[0].length } as CSSProperties}>
      {board.tiles.flatMap((row, y) => Array.from(row, (tile, x) => {
        const position = { x, y }
        const key = cellKey(position)
        const item = items.get(key)
        const occupants = actors.filter(actor => actor.x === x && actor.y === y)
        const floor = tile === '.'
        const gate = gates.has(key) ? floor ? 'open' : 'closed' : undefined
        const selectedKind = selectedPositions?.has(key) ? selectedChange?.kind : undefined
        return <span key={key} className="saved-arena-board-cell" data-x={x} data-y={y} data-tile={floor ? 'floor' : 'wall'}
          data-gate={gate} data-item-id={item?.id} data-change-player={changes?.player.has(key) || undefined}
          data-change-rivals={changes?.rivals.has(key) || undefined} data-change-battery={changes?.battery.has(key) || undefined}
          data-change-gate={changes?.gate.has(key) || undefined} data-selected-change={selectedKind}>
          {occupants.length > 0 && <span className="saved-arena-board-occupants" data-stacked={occupants.length > 1} aria-hidden="true">
            {occupants.map(actor => <span key={actor.id}
              className={actor.id === 'player' ? 'saved-arena-board-actor saved-arena-board-actor--player' : 'saved-arena-board-actor'} data-actor-id={actor.id}
              title={actor.name}>{actor.marker}</span>)}
          </span>}
          {item && <i className="saved-arena-board-battery" aria-hidden="true" />}
          {changes && changeKinds.map(kind => {
            if (!changes[kind].has(key)) return null
            const markerClass = `saved-arena-change-marker saved-arena-change-marker--${kind}`
            if (!onSelectChange) return <i key={kind} className={markerClass} aria-hidden="true" />

            const label = t(`查看${changeLabels[kind]}变化，格子 ${coordinates(position)}`,
              `Inspect ${changeLabels[kind].toLowerCase()} at ${coordinates(position)}`)
            return <button key={kind} className="saved-arena-change-button" type="button" data-change-kind={kind}
              aria-label={label} aria-pressed={selectedKind === kind} title={label}
              onClick={() => onSelectChange(kind, position)}>
              <i className={markerClass} aria-hidden="true" />
            </button>
          })}
        </span>
      }))}
    </div>
    <figcaption className="saved-arena-board-legend">
      <span><i className="saved-arena-board-actor saved-arena-board-actor--player" aria-hidden="true" />{sprout}</span>
      <span><i className="saved-arena-board-actor" aria-hidden="true" />{t('对手', 'Rivals')}</span>
      <span><i className="saved-arena-board-battery" aria-hidden="true" />{level.combat ? t('道具', 'Item') : t('电池', 'Battery')}</span>
      {gates.size > 0 && <>
        <span><i className="saved-arena-board-gate saved-arena-board-gate--open" aria-hidden="true" />{t('门已开', 'Gate open')}</span>
        <span><i className="saved-arena-board-gate saved-arena-board-gate--closed" aria-hidden="true" />{t('门已关', 'Gate closed')}</span>
      </>}
      {changes && <div className="saved-arena-board-change-legend">
        {changeDetails.length > 0 ? <>
          <strong>{onSelectChange ? t('点标记看详情', 'Select a marker for details') : t('变化标记', 'Changes')}</strong>
          {changeKinds.map(kind => <span key={kind}>
            <i className={`saved-arena-change-marker saved-arena-change-marker--${kind}`} aria-hidden="true" />{changeLabels[kind]}
          </span>)}
        </> : noChanges}
      </div>}
    </figcaption>
  </figure>
}
