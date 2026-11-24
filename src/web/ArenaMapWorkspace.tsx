import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { ArenaConsoleToggle, type ArenaConsoleControl } from './ArenaConsole'
import { ArenaMapControlsContext, ArenaMapModeContext } from './ArenaMapMode'
import { Icon } from './icons'
import { tr } from './text'
import './arena-map-workspace.css'

type Props = {
  locale: Locale
  title: string
  consoleControl: ArenaConsoleControl
  modeControl?: ReactNode
  shortcutHelp?: ReactNode
  dockedConsole?: boolean
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

export function ArenaMapWorkspace({ locale, title, consoleControl, modeControl, shortcutHelp, dockedConsole, className = '', children }: Props) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { mapMode, open, setMapConsoleOpen } = consoleControl
  const [drawer, setDrawer] = useState<'report' | 'keys'>()
  const host = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const didEnter = useRef(false)
  const savedScroll = useRef(0)
  const keysId = useId()

  const leave = useCallback((restoreFocus = true) => {
    if (!didEnter.current) return
    didEnter.current = false
    setMapConsoleOpen(null)
    setDrawer(undefined)
    if (document.fullscreenElement === host.current && document.fullscreenElement) {
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
    didEnter.current = true
    savedScroll.current = window.scrollY
    setMapConsoleOpen(false)
    setDrawer(undefined)
    // The same surface fills the application window when the embed disallows native fullscreen.
    if (document.fullscreenEnabled && element.requestFullscreen) {
      void element.requestFullscreen().then(() => {
        if (!didEnter.current && document.fullscreenElement === element) void document.exitFullscreen().catch(() => {})
      }).catch(() => {})
    }
    element.focus({ preventScroll: true })
  }

  useEffect(() => {
    let native = false
    function observeFullscreen() {
      if (document.fullscreenElement === host.current && host.current) native = true
      else if (native) {
        native = false
        leave()
      }
    }
    const onNavigate = () => leave(false)
    document.addEventListener('fullscreenchange', observeFullscreen)
    window.addEventListener('popstate', onNavigate)
    window.addEventListener('hashchange', onNavigate)
    return () => {
      document.removeEventListener('fullscreenchange', observeFullscreen)
      window.removeEventListener('popstate', onNavigate)
      window.removeEventListener('hashchange', onNavigate)
      if (didEnter.current) {
        didEnter.current = false
        setMapConsoleOpen(null)
      }
    }
  }, [leave, setMapConsoleOpen])

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
    const challengeStage = element.closest('.challenge-stage')
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
  const inlineControls = !mapMode && <div className="arena-map-controls" ref={dockedConsole ? undefined : anchorConsole}
    role="group" aria-label={t('地图显示', 'Map display')}>
    {fullscreenButton}
    <ArenaConsoleToggle control={consoleControl} locale={locale} />
  </div>

  return <ArenaMapModeContext.Provider value={mapMode}>
    <div ref={host} className={'lesson-layout arena-layout arena-map-workspace ' + (dockedConsole ? 'arena-map-docked ' : 'arena-map-floating ') + className}
      data-testid="arena-map-workspace" data-console={open ? 'open' : 'closed'} data-map-fullscreen={mapMode || undefined}
      data-map-drawer={mapMode ? drawer : undefined} role={mapMode ? 'dialog' : undefined}
      aria-modal={mapMode || undefined} aria-label={mapMode ? title : undefined} tabIndex={-1}>
      <ArenaMapControlsContext.Provider value={inlineControls}>{children}</ArenaMapControlsContext.Provider>
      {mapMode && <div ref={bar} className="arena-map-bar">
        <strong className="arena-map-title">{title}</strong>
        {modeControl}
        <button type="button" className="subtle-button" data-testid="arena-map-report-toggle"
          aria-expanded={drawer === 'report'} onClick={() => showDrawer('report')}>
          <Icon name="record" />{t('战况', 'Status')}
        </button>
        {shortcutHelp && <button type="button" className="subtle-button" aria-controls={keysId}
          aria-expanded={drawer === 'keys'} onClick={() => showDrawer('keys')}>{t('键盘操作', 'Keyboard')}</button>}
        {fullscreenButton}
      </div>}
      {mapMode && drawer === 'keys' && <div id={keysId} className="arena-map-keys">{shortcutHelp}</div>}
    </div>
  </ArenaMapModeContext.Provider>
}
