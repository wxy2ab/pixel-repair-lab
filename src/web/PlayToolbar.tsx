import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { useArenaMapMode } from './ArenaMapMode'
import './play-toolbar.css'

const preferenceKey = 'pixel-repair-lab:show-trail'
const preferenceChange = 'pixel-repair-lab:trail-change'
let memoryPreference = true
let storageUnavailable = false

function readTrailPreference() {
  if (storageUnavailable) return memoryPreference
  try { return localStorage.getItem(preferenceKey) !== 'off' } catch { return memoryPreference }
}

function subscribeTrail(listener: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === preferenceKey || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(preferenceChange, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(preferenceChange, listener)
  }
}

function toggleTrail() {
  memoryPreference = !readTrailPreference()
  try { localStorage.setItem(preferenceKey, memoryPreference ? 'on' : 'off') } catch { storageUnavailable = true }
  window.dispatchEvent(new Event(preferenceChange))
}

export function useTrailPreference() {
  const visible = useSyncExternalStore(subscribeTrail, readTrailPreference)
  return { visible, toggle: toggleTrail }
}

export function PlayToolbar({ locale, children, trail, status, guided, quickActions, result }: {
  locale: Locale; children: ReactNode; trail?: ReturnType<typeof useTrailPreference>; status?: ReactNode; guided?: boolean; quickActions?: ReactNode; result?: ReactNode
}) {
  const toolbar = useRef<HTMLDivElement>(null)
  const mapMode = useArenaMapMode()
  const [compact, setCompact] = useState(false)
  const folded = mapMode && compact
  const actionsId = useId()
  useLayoutEffect(() => {
    const element = toolbar.current
    if (!element) return
    const reserveSpace = () => {
      const height = element.getBoundingClientRect().height
      if (height > 0) document.documentElement.style.setProperty('--play-toolbar-height', height + 'px')
    }
    reserveSpace()
    const observer = new ResizeObserver(reserveSpace)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const label = tr(locale, '运行工具条', 'Run toolbar')
  return <div ref={toolbar} className={'play-toolbar' + (guided ? ' guided' : '')} data-testid="play-toolbar" role="toolbar" aria-label={label} data-folded={folded || undefined}
    onKeyDown={event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')).filter(button => button.getClientRects().length)
      const index = buttons.indexOf(event.target as HTMLButtonElement)
      if (index < 0) return
      event.preventDefault()
      buttons[(index + buttons.length + (event.key === 'ArrowRight' ? 1 : -1)) % buttons.length].focus()
    }}>
    {result}
    {!folded && quickActions}
    {!folded && status && <div className="play-toolbar__status" role="status">{status}</div>}
    <div className="play-toolbar__actions" id={actionsId}>{children}
      {trail && <button type="button" className="subtle-button play-toolbar__trail" aria-pressed={trail.visible}
        data-testid="trail-toggle" onClick={trail.toggle}
        title={tr(locale, '灰线是已经走过的路，绿线是刚走的一步。', 'Gray marks earlier moves. Green marks the latest step.')}>
        <svg viewBox="0 0 28 16" width="27" height="16" fill="none" aria-hidden="true">
          <path d="M2 13h7V3h7" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeDasharray="3 2" />
          <path d="M16 3h9" className="play-toolbar__recent" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
        {tr(locale, '显示路线', 'Show trail')}
      </button>}
    </div>
    {mapMode && <button type="button" className="play-toolbar__fold" aria-expanded={!folded} aria-controls={actionsId}
      onClick={() => setCompact(!compact)}>
      <span aria-hidden="true">{folded ? '▴' : '▾'}</span> {folded ? tr(locale, '展开操作栏', 'Show controls') : tr(locale, '收起操作栏', 'Fold controls')}
    </button>}
  </div>
}
