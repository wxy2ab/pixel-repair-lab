import { useSyncExternalStore } from 'react'
import type { Locale } from '../shared/types'
import type { ArenaAttackSpeed } from './arenaTurnMotion'
import { tr } from './text'

const preferenceKey = 'pixel-repair-lab:arena-attack-speed'
let sessionChoice: string | null = null
let storageAvailable = true

function readChoice() {
  if (storageAvailable) {
    try { return localStorage.getItem(preferenceKey) } catch { storageAvailable = false }
  }
  return sessionChoice
}

// Older numeric choices set a speed but never opted in to motion when the system asks for less.
function playback(choice: string | null) {
  const explicit = choice === 'play:0.5' || choice === 'play:1' || choice === 'play:2'
  const rate = explicit ? choice.slice(5) : choice
  const speed: ArenaAttackSpeed = rate === '0.5' ? 0.5 : rate === '2' ? 2 : 1
  return { explicit, speed }
}

/** Read once per turn so a new selection cannot jump an in-flight pulse. */
export function readArenaAttackPlayback() {
  return playback(readChoice())
}

const reduceQuery = '(prefers-reduced-motion: reduce)'
function subscribeMotionPreference(update: () => void) {
  const media = window.matchMedia(reduceQuery)
  media.addEventListener('change', update)
  return () => media.removeEventListener('change', update)
}
const prefersReducedMotion = () => window.matchMedia(reduceQuery).matches

export function useSystemReducedMotion() {
  return useSyncExternalStore(subscribeMotionPreference, prefersReducedMotion)
}

function subscribe(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === preferenceKey || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(preferenceKey, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(preferenceKey, listener)
  }
}

export function ArenaAttackSpeedControl({ locale }: { locale: Locale }) {
  const choice = useSyncExternalStore(subscribe, readChoice)
  const reduced = useSystemReducedMotion()
  const { explicit, speed } = playback(choice)
  const systemRate = !explicit && choice ? speed : 1
  function choose(value: string) {
    sessionChoice = value === 'system' ? null : 'play:' + value
    try {
      if (sessionChoice === null) localStorage.removeItem(preferenceKey)
      else localStorage.setItem(preferenceKey, sessionChoice)
    } catch { storageAvailable = false }
    window.dispatchEvent(new Event(preferenceKey))
  }
  const label = tr(locale, '攻击速度', 'Attack speed')
  return <label className="arena-attack-speed" title={tr(locale, '从下次攻击起生效', 'Applies to the next attack')}>
    {label}
    <select aria-label={label} value={explicit ? speed : 'system'} onChange={event => choose(event.target.value)}>
      <option value="system">{tr(locale, '跟随系统', 'System')} · {reduced ? tr(locale, '静态', 'Still') : systemRate + '×'}</option>
      <option value="0.5">0.5×</option>
      <option value="1">1×</option>
      <option value="2">2×</option>
    </select>
  </label>
}
