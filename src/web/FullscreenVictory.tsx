import { createContext, useContext, useId, useLayoutEffect } from 'react'
import type { Locale, Localized } from '../shared/types'
import { advanceFullscreenMap } from './ArenaMapMode'
import { Icon } from './icons'
import { tr } from './text'
import './fullscreen-victory.css'

type VictoryNavigation = {
  next?: { title: Localized; open: () => void }
  browse: () => void
  requireMapWin?: boolean
}

export const FullscreenVictoryContext = createContext<VictoryNavigation | null>(null)
export const MapVictoryReporter = createContext<((won: boolean) => void) | null>(null)

// A course keeps its completion history when replayed. Follow the outcome on screen for this run.
export function useVisibleMapWin(visible: boolean) {
  const report = useContext(MapVictoryReporter)
  useLayoutEffect(() => {
    if (!visible || !report) return
    report(true)
    return () => report(false)
  }, [report, visible])
}

export function FullscreenVictoryActions({ locale, mapWon }: { locale: Locale; mapWon: boolean }) {
  const victory = useContext(FullscreenVictoryContext)
  const titleId = useId()
  if (!victory || (victory.requireMapWin && !mapWon)) return null

  const { next, browse } = victory
  const browseLabel = victory.requireMapWin ? tr(locale, '返回选课', 'Browse lessons') : tr(locale, '返回选关', 'Back to challenges')
  const label = next ? tr(locale, '下一关', 'Next level') : browseLabel
  return <button type="button" className="primary-button fullscreen-victory-action" data-map-keyboard-exclude
    aria-label={label} aria-describedby={next ? titleId : undefined} title={next?.title[locale]}
    onClick={next ? event => advanceFullscreenMap(event.currentTarget, next.open) : browse}>
    <span>{label}</span>
    {next && <span id={titleId} className="fullscreen-victory-action__title">{next.title[locale]}</span>}
    <Icon name={next ? 'next' : 'modules'} size={16} />
  </button>
}
