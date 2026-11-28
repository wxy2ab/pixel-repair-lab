import { useId, useState, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { Icon } from './icons'
import { tr } from './text'
import { arenaBoardInView, arenaBoardSurface } from './arenaBoardVisibility'

export function useArenaConsole(storageKey = 'pixel-repair-lab:arena-console') {
  const id = useId()
  const [standardOpen, setStandardOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'hidden' } catch { return true }
  })
  const [mapConsoleOpen, setMapConsoleOpen] = useState<boolean | null>(null)
  function toggle() {
    if (mapConsoleOpen !== null) {
      setMapConsoleOpen(!mapConsoleOpen)
      return
    }
    setStandardOpen(!standardOpen)
    try { localStorage.setItem(storageKey, standardOpen ? 'hidden' : 'shown') } catch { /* The switch still works for this visit. */ }
  }

  function revealBoard() {
    const panel = document.getElementById(id)
    const workspace = panel?.closest('.arena-map-workspace')
    const surface = workspace && arenaBoardSurface(workspace)
    if (surface && mapConsoleOpen === null && !arenaBoardInView(surface)) surface.scrollIntoView({ block: 'center', behavior: 'instant' })
  }

  function uncoverVolley() {
    const panel = document.getElementById(id)
    const workspace = panel?.closest('.arena-map-workspace')
    const surface = workspace && arenaBoardSurface(workspace)
    if (!panel || !surface) return
    const board = surface.getBoundingClientRect()
    const popup = panel.getBoundingClientRect()
    const coveredWidth = Math.min(board.right, popup.right) - Math.max(board.left, popup.left)
    const coveredHeight = Math.min(board.bottom, popup.bottom) - Math.max(board.top, popup.top)
    // A panel covering even one side of a duel can hide the entire hit. Panels
    // placed alongside the field stay open.
    if (coveredWidth > 1 && coveredHeight > 1) {
      if (panel.contains(document.activeElement)) document.getElementById(id + '-toggle')?.focus({ preventScroll: true })
      if (mapConsoleOpen !== null) setMapConsoleOpen(false)
      else setStandardOpen(false) // Manual toggles own the saved preference.
    }
  }
  return { id, open: mapConsoleOpen ?? standardOpen, toggle, revealBoard, uncoverVolley, mapMode: mapConsoleOpen !== null, setMapConsoleOpen }
}

export type ArenaConsoleControl = ReturnType<typeof useArenaConsole>

export function ArenaConsoleToggle({ control, locale }: { control: ArenaConsoleControl; locale: Locale }) {
  function toggle() {
    control.toggle()
    if (!control.open && !control.mapMode) {
      requestAnimationFrame(() => {
        const panel = document.getElementById(control.id)
        panel?.focus({ preventScroll: true })
        if (panel?.closest('.arena-map-floating') && getComputedStyle(panel).position === 'static') panel.scrollIntoView({ block: 'nearest' })
      })
    }
  }
  const label = control.open ? tr(locale, '收起控制台', 'Hide console') : tr(locale, '弹出控制台', 'Show console')
  return <button type="button" id={control.id + '-toggle'} className="subtle-button arena-console-toggle" aria-controls={control.id} title={label} aria-label={label}
    aria-expanded={control.open} onClick={toggle} data-testid="arena-console-toggle">
    <Icon name={control.open ? 'collapse' : 'expand'} size={17} />
    <span>{label}</span>
    {!control.mapMode && <small aria-hidden="true" className="arena-map-compact-label">{tr(locale, '控制台', 'Code')}</small>}
  </button>
}

export function ArenaConsolePanel({ control, locale, children }: { control: ArenaConsoleControl; locale: Locale; children: ReactNode }) {
  const label = tr(locale, '程序控制台', 'Program console')
  const dismissLabel = tr(locale, '收起程序控制台', 'Close program console')
  function dismiss() {
    control.toggle()
    document.getElementById(control.id + '-toggle')?.focus({ preventScroll: true })
  }
  return <section className="arena-console" hidden={!control.open} id={control.id} aria-label={label} tabIndex={-1}
    onKeyDown={event => {
      if (event.key === 'Escape' && !control.mapMode && !event.defaultPrevented && !event.nativeEvent.isComposing
        && !(event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        dismiss()
      }
    }}>
    {!control.mapMode && <div className="arena-console-heading">
      <h2>{label}</h2>
      <button type="button" className="subtle-button arena-console-dismiss" aria-label={dismissLabel} title={dismissLabel} onClick={dismiss}>
        <Icon name="close" />
      </button>
    </div>}
    {children}
  </section>
}
