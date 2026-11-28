import { useSyncExternalStore } from 'react'

type BoardTouchMode = 'map' | 'player'
const preferenceKey = 'pixel-repair-lab:board-touch-mode'
let sessionMode: BoardTouchMode = 'map'
let storageAvailable = true

export function readBoardTouchMode(): BoardTouchMode {
  if (storageAvailable) {
    try { sessionMode = localStorage.getItem(preferenceKey) === 'player' ? 'player' : 'map' }
    catch { storageAvailable = false }
  }
  return sessionMode
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

export function useBoardTouchMode() {
  return useSyncExternalStore(subscribe, readBoardTouchMode)
}

export function setBoardTouchMode(mode: BoardTouchMode) {
  sessionMode = mode
  if (storageAvailable) {
    try { localStorage.setItem(preferenceKey, mode) } catch { storageAvailable = false }
  }
  window.dispatchEvent(new Event(preferenceKey))
}
