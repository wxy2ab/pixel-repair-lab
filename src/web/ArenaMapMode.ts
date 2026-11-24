import { createContext, useContext, type ReactNode } from 'react'

export const ArenaMapModeContext = createContext(false)
export const ArenaMapControlsContext = createContext<ReactNode>(null)

export function useArenaMapMode() {
  return useContext(ArenaMapModeContext)
}

/** Keep the editor, native controls, IME and browser shortcuts in charge of their own keys. */
export function isMapShortcutTarget(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229 || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return false
  const target = event.target
  if (!(target instanceof Element) || target === document.body || target === document.documentElement) return true
  return !!target.closest('.arena-layout') && !target.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], .arena-console, [data-map-keyboard-exclude]',
  )
}
