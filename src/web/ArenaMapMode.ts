import { createContext, useContext, type ReactNode } from 'react'
import { flushSync } from 'react-dom'

export const ArenaMapModeContext = createContext(false)
export const ArenaMapControlsContext = createContext<ReactNode>(null)
export type ArenaKeyboardMode = 'map' | 'player'
export const ArenaKeyboardModeContext = createContext<ArenaKeyboardMode | null>(null)
export const mapStageSelector = '.challenge-stage, [data-map-stage]'

// Only the workspace mounted by this navigation can inherit the fullscreen stage.
export const advancingMapStages = new WeakSet<Element>()

export function advanceFullscreenMap(button: HTMLElement, openNext: () => void) {
  const stage = button.closest(mapStageSelector)
  if (!stage) return openNext()
  advancingMapStages.add(stage)
  try {
    flushSync(openNext)
  } finally {
    // A challenge without a map has no workspace to claim fullscreen.
    if (advancingMapStages.delete(stage) && document.fullscreenElement === stage) {
      void document.exitFullscreen().catch(() => {})
    }
  }
}

export function useArenaMapMode() {
  return useContext(ArenaMapModeContext)
}

export function useArenaKeyboardMode() {
  return useContext(ArenaKeyboardModeContext)
}

export function focusArenaBoard(workspace: HTMLElement | null) {
  const surface = workspace?.querySelector<HTMLElement>('.station-viewport[data-view="3d"] canvas, .station-viewport[data-view="2d"] .station-flat-board')
  const destination = surface ?? workspace
  destination?.focus({ preventScroll: true })
}

const excludedControls = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], .arena-console, [data-map-keyboard-exclude]'

function ownsKeyEvent(event: KeyboardEvent, workspace: Element | null) {
  if (!workspace?.isConnected || workspace.closest('[inert], [hidden]')) return false
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return false
  const target = event.target
  if (!(target instanceof Element) || target.closest(excludedControls)) return false
  // Losing the Start button or entering native fullscreen can focus the document or the fullscreen stage.
  if (target === document.body || target === document.documentElement || target === document.fullscreenElement && target.contains(workspace)) {
    const focus = document.activeElement
    return !focus || focus === target || focus === document.body || (workspace.contains(focus) && !focus.closest(excludedControls))
  }
  return workspace.contains(target)
}

export function isWorkspaceShortcut(event: KeyboardEvent, workspace: Element | null) {
  return !event.isComposing && event.keyCode !== 229 && ownsKeyEvent(event, workspace)
}

const physicalControls = new Map([
  ['KeyW', 'w'], ['KeyA', 'a'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyE', 'e'], ['KeyG', 'g'], ['KeyM', 'm'],
  ['ArrowUp', 'ArrowUp'], ['ArrowDown', 'ArrowDown'], ['ArrowLeft', 'ArrowLeft'], ['ArrowRight', 'ArrowRight'],
])
const logicalControls = new Set(physicalControls.values())

/** A focused board can use the physical key even when an IME reports it as Process or 229. */
export function arenaControlKey(event: KeyboardEvent, workspace: Element | null) {
  if (!ownsKeyEvent(event, workspace)) return
  const logical = event.key.length === 1 ? event.key.toLowerCase() : event.key
  if (!event.isComposing && event.keyCode !== 229 && logicalControls.has(logical)) return logical
  return physicalControls.get(event.code) ?? (logicalControls.has(logical) ? logical : undefined)
}
