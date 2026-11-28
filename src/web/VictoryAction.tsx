import { createContext, useContext, useId } from 'react'
import { advanceFullscreenMap, useArenaMapMode } from './ArenaMapMode'
import { Icon } from './icons'
import './victory-action.css'

export type VictoryDestination = { label: string; nextTitle?: string; open: () => void }
export const MapVictoryContext = createContext<{
  inline?: VictoryDestination; fullscreen?: VictoryDestination
}>({})

export function VictoryAction({ destination, fullscreen = false }: {
  destination: VictoryDestination; fullscreen?: boolean
}) {
  const titleId = useId()
  const { label, nextTitle, open } = destination
  return <button type="button" className="primary-button victory-action" data-map-keyboard-exclude
    aria-label={label} aria-describedby={nextTitle ? titleId : undefined} title={nextTitle}
    onClick={event => fullscreen && nextTitle ? advanceFullscreenMap(event.currentTarget, open) : open()}>
    <span>{label}</span>
    {nextTitle && <small id={titleId}>{nextTitle}</small>}
    <Icon name={nextTitle ? 'next' : 'modules'} size={16} />
  </button>
}

// The result that actually won owns this action, including on a replay of a completed level.
export function MapVictoryAction() {
  const fullscreen = useArenaMapMode()
  const destinations = useContext(MapVictoryContext)
  const destination = fullscreen ? destinations.fullscreen : destinations.inline
  return destination ? <VictoryAction destination={destination} fullscreen={fullscreen} /> : null
}
