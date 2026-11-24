import { useEffect } from 'react'
import type { ArenaChoice } from '../engine/realtimeProtocol'
import type { Direction, Locale } from '../shared/types'
import { isMapShortcutTarget, useArenaMapMode } from './ArenaMapMode'
import { tr } from './text'

const arrowKeys = new Map<string, Direction>([
  ['ArrowUp', 'up'], ['ArrowDown', 'down'], ['ArrowLeft', 'left'], ['ArrowRight', 'right'],
])

function choiceForKey(event: KeyboardEvent, combat: boolean): ArenaChoice | undefined {
  const direction = arrowKeys.get(event.key)
  if (direction) return event.shiftKey ? (combat ? `shoot-${direction}` : undefined) : direction
  if (event.shiftKey) return
  if (event.key.toLowerCase() === 'e') return 'pick'
  if (combat && event.key.toLowerCase() === 'g') return 'guard'
}

export function ArenaMatchKeys({ playing, combat, onChoose }: {
  playing: boolean; combat: boolean; onChoose: (action: ArenaChoice) => void
}) {
  const mapMode = useArenaMapMode()
  useEffect(() => {
    if (!mapMode || !playing) return
    function handle(event: KeyboardEvent) {
      if (!isMapShortcutTarget(event)) return
      const choice = choiceForKey(event, combat)
      if (!choice) return
      // In a live turn the arrows drive Sprout, ahead of the board's cell inspector.
      event.preventDefault()
      event.stopPropagation()
      if (!event.repeat) onChoose(choice)
    }
    window.addEventListener('keydown', handle, true)
    return () => window.removeEventListener('keydown', handle, true)
  }, [mapMode, playing, combat, onChoose])
  return null
}

export function MapShortcutGuide({ locale, timed, combat }: { locale: Locale; timed?: boolean; combat?: boolean }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <dl className="map-shortcut-guide">
    <div><dt><kbd>W A S D</kbd></dt><dd>{t('平移地图', 'Pan map')}</dd></div>
    <div><dt><kbd>+</kbd> <kbd>−</kbd></dt><dd>{t('缩放地图', 'Zoom map')}</dd></div>
    <div><dt><kbd>Home</kbd></dt><dd>{t('适应全图', 'Fit map')}</dd></div>
    {timed && <>
      <div><dt><kbd>↑ ↓ ← →</kbd></dt><dd>{t('移动芽芽', 'Move Sprout')}</dd></div>
      {combat && <div><dt><kbd>Shift</kbd> + <kbd>↑ ↓ ← →</kbd></dt><dd>{t('向该方向发射', 'Fire in that direction')}</dd></div>}
      <div><dt><kbd>E</kbd></dt><dd>{t('拾取', 'Pick up')}</dd></div>
      {combat && <div><dt><kbd>G</kbd></dt><dd>{t('防守', 'Guard')}</dd></div>}
    </>}
  </dl>
}

export function ArenaMapOutcome({ text, won }: { text?: string; won?: boolean }) {
  const mapMode = useArenaMapMode()
  return mapMode && text ? <p className="arena-map-outcome" role="status" data-victory={won || undefined}>
    {won && <span aria-hidden="true">✓</span>}{text}
  </p> : null
}
