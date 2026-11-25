import { useEffect, useRef } from 'react'
import type { ArenaChoice } from '../engine/realtimeProtocol'
import type { Direction, Locale } from '../shared/types'
import { arenaControlKey, useArenaKeyboardMode, useArenaMapMode, type ArenaKeyboardMode } from './ArenaMapMode'
import { useVisibleMapWin } from './FullscreenVictory'
import { tr } from './text'

const arrowKeys = new Map<string, Direction>([
  ['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
])
const walkKeys = new Map<string, Direction>([['w', 'up'], ['a', 'left'], ['s', 'down'], ['d', 'right']])

function choiceForKey(key: string, shift: boolean, combat: boolean): ArenaChoice | undefined {
  const direction = arrowKeys.get(key)
  if (direction) return shift ? (combat ? `shoot-${direction}` : undefined) : direction
  if (shift) return
  if (key === 'e') return 'pick'
  if (combat && key === 'g') return 'guard'
  return walkKeys.get(key)
}

export function ArenaMatchKeys({ playing, combat, onChoose }: {
  playing: boolean; combat: boolean; onChoose: (action: ArenaChoice) => void
}) {
  const marker = useRef<HTMLSpanElement>(null)
  const mode = useArenaKeyboardMode()
  useEffect(() => {
    const board = marker.current?.closest('.arena-map-workspace') ?? null
    if (!playing || mode !== 'player' || !board) return
    function handle(event: KeyboardEvent) {
      const key = arenaControlKey(event, board)
      if (!key) return
      const choice = choiceForKey(key, event.shiftKey, combat)
      if (!choice) return
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) onChoose(choice)
    }
    window.addEventListener('keydown', handle, true)
    return () => window.removeEventListener('keydown', handle, true)
  }, [playing, mode, combat, onChoose])
  return <span hidden ref={marker} />
}

export function MapShortcutGuide({ locale, keyboardMode, viewOnly, combat, camera = true }: {
  locale: Locale; keyboardMode?: ArenaKeyboardMode; viewOnly?: boolean; combat?: boolean; camera?: boolean
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <dl className="map-shortcut-guide">
    {keyboardMode && !viewOnly && <div><dt><kbd>M</kbd></dt><dd>{t('切换查看地图 / 控制芽芽', 'Switch between map and Sprout controls')}</dd></div>}
    {keyboardMode === 'map' && <div><dt><kbd>↑ ↓ ← →</kbd></dt><dd>{t('查看相邻格子', 'Inspect adjacent cells')}</dd></div>}
    {camera && keyboardMode !== 'player' && <>
      <div><dt><kbd>W A S D</kbd></dt><dd>{t('平移地图', 'Pan map')}</dd></div>
      <div><dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>{t('缩放地图', 'Zoom map')}</dd></div>
      <div><dt><kbd>Home</kbd></dt><dd>{t('适应全图', 'Fit map')}</dd></div>
    </>}
    {keyboardMode === 'player' && <>
      <div><dt><kbd>↑ ↓ ← →</kbd> / <kbd>W A S D</kbd></dt><dd>{t('移动芽芽', 'Move Sprout')}</dd></div>
      {combat && <div><dt><kbd>Shift</kbd> + <kbd>↑ ↓ ← →</kbd></dt><dd>{t('向该方向发射', 'Fire in that direction')}</dd></div>}
      <div><dt><kbd>E</kbd></dt><dd>{t('拾取', 'Pick up')}</dd></div>
      {combat && <div><dt><kbd>G</kbd></dt><dd>{t('防守', 'Guard')}</dd></div>}
    </>}
  </dl>
}

export function ArenaMapOutcome({ text, won }: { text?: string; won?: boolean }) {
  const mapMode = useArenaMapMode()
  useVisibleMapWin(Boolean(mapMode && text && won))
  return mapMode && text ? <p className="arena-map-outcome" role="status" data-victory={won || undefined}>
    {won && <span aria-hidden="true">✓</span>}{text}
  </p> : null
}
