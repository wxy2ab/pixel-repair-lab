import { useCallback, useEffect, useEffectEvent, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import type { Locale } from '../shared/types'
import { ArenaConsoleToggle, type ArenaConsoleControl } from './ArenaConsole'
import { advancingMapStages, arenaControlKey, ArenaKeyboardModeContext, ArenaMapControlsContext, ArenaMapModeContext, ArenaTouchMoveContext, focusArenaBoard, mapStageSelector, type ArenaKeyboardMode, type BoardTouchActions } from './ArenaMapMode'
import { Icon } from './icons'
import { tr } from './text'
import './arena-map-workspace.css'

type Props = {
  locale: Locale
  title: string
  consoleControl: ArenaConsoleControl
  modeControl?: ReactNode
  keyboardControl?: {
    mode: ArenaKeyboardMode
    choose: (mode: ArenaKeyboardMode) => void
    viewOnly: boolean
    playerTitle: string
  }
  touchControl?: BoardTouchActions & {
    viewOnly?: boolean
    activePlayer?: boolean
    onChoosePlayer?: () => void
    onDeactivate?: () => void
  }
  shortcutHelp?: ReactNode
  dockedConsole?: boolean
  hasConsole?: boolean
  className?: string
  children: ReactNode
}

// The console is a sibling of the board so opening it never interrupts the editor or scene.
function anchorConsole(controls: HTMLDivElement | null) {
  if (!controls) return
  const workspace = controls.closest<HTMLElement>('.arena-map-workspace')
  const viewport = controls.closest<HTMLElement>('.station-viewport')
  const tools = controls.parentElement
  if (!workspace || !viewport || !tools) return
  const align = () => {
    const bottom = tools.getBoundingClientRect().bottom
    workspace.style.setProperty('--arena-map-tools-bottom', bottom - workspace.getBoundingClientRect().top + 'px')
    workspace.style.setProperty('--arena-map-surface-height', viewport.getBoundingClientRect().bottom - bottom + 'px')
  }
  align()
  const observer = new ResizeObserver(align)
  for (let node: HTMLElement | null = tools; node; node = node.parentElement) {
    observer.observe(node)
    if (node === workspace) break
  }
  return () => observer.disconnect()
}

export function ArenaMapWorkspace({ locale, title, consoleControl, modeControl, keyboardControl, touchControl, shortcutHelp, dockedConsole, hasConsole = true, className = '', children }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { mapMode, open, setMapConsoleOpen } = consoleControl
  const [drawer, setDrawer] = useState<'report' | 'keys'>()
  const [swipeToMove, setSwipeToMove] = useState(false)
  const canMoveByTouch = mapMode && !!touchControl && !touchControl.viewOnly && touchControl.activePlayer !== false
  const touchEnabled = canMoveByTouch && swipeToMove
  const stopTouch = touchControl?.onDeactivate
  useLayoutEffect(() => {
    if (touchEnabled) return stopTouch
  }, [touchEnabled, stopTouch])
  useEffect(() => {
    if (!canMoveByTouch) setSwipeToMove(false)
  }, [canMoveByTouch])
  const host = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const fullscreenSurface = useRef<HTMLElement | null>(null)
  const nativeFullscreen = useRef(false)
  const savedScroll = useRef(0)
  const keysId = useId()

  function chooseKeyboard(mode: ArenaKeyboardMode) {
    // Switching from the program to timed practice replaces the board. Focus its new surface in this gesture.
    flushSync(() => keyboardControl?.choose(mode))
    focusArenaBoard(host.current)
  }

  const switchKeyboard = useEffectEvent((event: KeyboardEvent) => {
    if (!keyboardControl || keyboardControl.viewOnly || event.shiftKey || event.repeat) return
    if (arenaControlKey(event, host.current) !== 'm') return
    event.preventDefault()
    chooseKeyboard(keyboardControl.mode === 'map' ? 'player' : 'map')
  })
  const hasKeyboardSwitch = Boolean(keyboardControl)
  useEffect(() => {
    if (!hasKeyboardSwitch) return
    const handle = (event: KeyboardEvent) => switchKeyboard(event)
    window.addEventListener('keydown', handle)
    return () => window.removeEventListener('keydown', handle)
  }, [hasKeyboardSwitch])

  const leave = useCallback((restoreFocus = true) => {
    const surface = fullscreenSurface.current
    if (!surface) return
    fullscreenSurface.current = null
    nativeFullscreen.current = false
    setMapConsoleOpen(null)
    setDrawer(undefined)
    if (document.fullscreenElement === surface) {
      void document.exitFullscreen().catch(() => {})
    }
    if (restoreFocus) requestAnimationFrame(() => {
      if (!toggle.current?.isConnected) return
      window.scrollTo({ top: savedScroll.current, behavior: 'instant' })
      toggle.current.focus({ preventScroll: true })
    })
  }, [setMapConsoleOpen])

  function enter() {
    const element = host.current
    if (!element) return
    // The stage stays mounted when a cleared challenge is replaced by the next one.
    const surface = element.closest<HTMLElement>(mapStageSelector) ?? element
    fullscreenSurface.current = surface
    savedScroll.current = window.scrollY
    setMapConsoleOpen(false)
    setDrawer(undefined)
    // The same surface fills the application window when the embed disallows native fullscreen.
    if (document.fullscreenEnabled && surface.requestFullscreen) {
      void surface.requestFullscreen().then(() => {
        if (fullscreenSurface.current === surface) {
          // Entry and exit can both complete before the browser delivers its first fullscreenchange.
          nativeFullscreen.current = true
          if (document.fullscreenElement !== surface) leave()
        } else if (!fullscreenSurface.current && document.fullscreenElement === surface && !surface.querySelector('[data-map-fullscreen]')) {
          void document.exitFullscreen().catch(() => {})
        }
      }).catch(() => {})
    }
    element.focus({ preventScroll: true })
  }

  useLayoutEffect(() => {
    const element = host.current
    const stage = element?.closest<HTMLElement>(mapStageSelector)
    if (element && stage && advancingMapStages.delete(stage)) {
      fullscreenSurface.current = stage
      nativeFullscreen.current = document.fullscreenElement === stage
      savedScroll.current = window.scrollY
      setMapConsoleOpen(false)
      element.focus({ preventScroll: true })
    }
    return () => {
      const surface = fullscreenSurface.current
      if (!surface) return
      fullscreenSurface.current = null
      nativeFullscreen.current = false
      if (!advancingMapStages.has(surface) && document.fullscreenElement === surface) {
        void document.exitFullscreen().catch(() => {})
      }
      setMapConsoleOpen(null)
    }
  }, [setMapConsoleOpen])

  useEffect(() => {
    function observeFullscreen() {
      if (fullscreenSurface.current && document.fullscreenElement === fullscreenSurface.current) nativeFullscreen.current = true
      else if (nativeFullscreen.current) leave()
    }
    const onNavigate = () => leave(false)
    document.addEventListener('fullscreenchange', observeFullscreen)
    window.addEventListener('popstate', onNavigate)
    window.addEventListener('hashchange', onNavigate)
    return () => {
      document.removeEventListener('fullscreenchange', observeFullscreen)
      window.removeEventListener('popstate', onNavigate)
      window.removeEventListener('hashchange', onNavigate)
    }
  }, [leave])

  useEffect(() => {
    if (mapMode && open) setDrawer(undefined)
  }, [mapMode, open])

  useLayoutEffect(() => {
    if (!mapMode || !bar.current || !host.current) return
    const element = host.current
    const header = bar.current
    const sizeHeader = () => element.style.setProperty('--arena-map-heading', header.offsetHeight + 'px')
    sizeHeader()
    const observer = new ResizeObserver(sizeHeader)
    observer.observe(header)
    const challengeStage = element.closest(mapStageSelector)
    const detach = new MutationObserver(() => {
      if (!element.isConnected) leave(false)
    })
    if (challengeStage) detach.observe(challengeStage, { childList: true })
    const outside: HTMLElement[] = []
    for (let branch: HTMLElement | null = element; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
        if (sibling !== branch && sibling instanceof HTMLElement && !sibling.inert && !sibling.matches('script, style, link')) {
          sibling.inert = true
          outside.push(sibling)
        }
      }
    }
    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isComposing) {
        e.preventDefault()
        leave()
      } else if (e.key === 'Tab') {
        const visible = Array.from(element.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]',
        )).filter(node => node.getClientRects().length && getComputedStyle(node).visibility === 'visible')
        const first = visible[0]
        const last = visible.at(-1)
        if (first && last && (e.shiftKey ? document.activeElement === first || document.activeElement === element : document.activeElement === last)) {
          e.preventDefault()
          const destination = e.shiftKey ? last : first
          destination.focus()
        }
      }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      observer.disconnect()
      detach.disconnect()
      outside.forEach(sibling => { sibling.inert = false })
      document.removeEventListener('keydown', keydown)
    }
  }, [mapMode, leave])

  function showDrawer(next: 'report' | 'keys') {
    setMapConsoleOpen(false)
    setDrawer(drawer === next ? undefined : next)
  }

  const sizeLabel = mapMode ? t('退出全屏', 'Exit fullscreen') : t('全屏地图', 'Fullscreen map')
  const fullscreenButton = <button ref={mapMode ? undefined : toggle} type="button" className="subtle-button arena-map-size-toggle"
    data-testid="arena-map-fullscreen-toggle" aria-label={sizeLabel} aria-pressed={mapMode}
    onClick={() => mapMode ? leave() : enter()}>
    <Icon name={mapMode ? 'close' : 'fullscreen'} /><span>{sizeLabel}</span>
  </button>
  const keyboardSwitch = keyboardControl && <div className="segmented arena-keyboard-switch" role="group"
    aria-label={t('键盘控制对象', 'Keyboard controls')} aria-keyshortcuts={keyboardControl.viewOnly ? undefined : 'M'}>
    {!keyboardControl.viewOnly && <kbd aria-hidden="true">M</kbd>}
    <button type="button" aria-pressed={keyboardControl.mode === 'map'} onClick={() => chooseKeyboard('map')}
      title={t('用方向键查看格子', 'Inspect cells with the arrow keys')}>{t('查看地图', 'View map')}</button>
    <button type="button" disabled={keyboardControl.viewOnly} aria-pressed={keyboardControl.mode === 'player'}
      onClick={() => chooseKeyboard('player')} title={keyboardControl.playerTitle}>{t('控制芽芽', 'Control Sprout')}</button>
  </div>
  const touchSwitch = mapMode && touchControl && <div className="segmented arena-touch-switch" role="group"
    aria-label={t('触控操作', 'Touch controls')} data-touchscreen={navigator.maxTouchPoints > 0 || undefined}>
    <span aria-hidden="true">{t('触控', 'Touch')}</span>
    <button type="button" aria-pressed={!touchEnabled} onClick={() => setSwipeToMove(false)}>{t('操作地图', 'Map gestures')}</button>
    <button type="button" aria-pressed={touchEnabled} disabled={touchControl.viewOnly}
      title={touchControl.tap ? t('点空地走过去，点身旁的箱子或滑动推一格', 'Tap open floor to walk there. Tap a box next to Sprout or swipe toward it to push.')
        : t('在棋盘上滑动，让芽芽走一格', 'Swipe the board to move Sprout one square')}
      onClick={() => { touchControl.onChoosePlayer?.(); setSwipeToMove(true) }}>{t('移动芽芽', 'Move Sprout')}</button>
  </div>
  const inlineControls = !mapMode && <div className="arena-map-controls" ref={dockedConsole || !hasConsole ? undefined : anchorConsole}
    role="group" aria-label={t('地图显示', 'Map display')}>
    {keyboardSwitch}
    {fullscreenButton}
    {hasConsole && <ArenaConsoleToggle control={consoleControl} locale={locale} />}
  </div>

  return <ArenaKeyboardModeContext.Provider value={keyboardControl?.mode ?? null}><ArenaMapModeContext.Provider value={mapMode}>
    <div ref={host} className={'lesson-layout arena-layout arena-map-workspace ' + (dockedConsole ? 'arena-map-docked ' : 'arena-map-floating ') + className}
      data-testid="arena-map-workspace" data-console={hasConsole && open ? 'open' : 'closed'} data-map-fullscreen={mapMode || undefined}
      data-map-drawer={mapMode ? drawer : undefined} role={mapMode ? 'dialog' : undefined}
      aria-modal={mapMode || undefined} aria-label={mapMode ? title : undefined} tabIndex={-1}>
      <ArenaTouchMoveContext.Provider value={touchEnabled ? touchControl : null}>
        <ArenaMapControlsContext.Provider value={inlineControls}>{children}</ArenaMapControlsContext.Provider>
      </ArenaTouchMoveContext.Provider>
      {mapMode && <div ref={bar} className="arena-map-bar">
        <strong className="arena-map-title">{title}</strong>
        {modeControl}
        {keyboardSwitch}
        {touchSwitch}
        <button type="button" className="subtle-button" data-testid="arena-map-report-toggle"
          aria-expanded={drawer === 'report'} onClick={() => showDrawer('report')}>
          <Icon name="record" />{t('战况', 'Status')}
        </button>
        {shortcutHelp && <button type="button" className="subtle-button" aria-controls={keysId}
          aria-expanded={drawer === 'keys'} onClick={() => showDrawer('keys')}>{t('键盘操作', 'Keyboard')}</button>}
        {fullscreenButton}
      </div>}
      {mapMode && drawer === 'keys' && <div id={keysId} className="arena-map-keys">{keyboardSwitch}{shortcutHelp}</div>}
    </div>
  </ArenaMapModeContext.Provider></ArenaKeyboardModeContext.Provider>
}
