import { useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { Icon, type IconName } from './icons'
import { tr } from './text'

export type MissionRailMode = 'pinned' | 'compact' | 'hidden'

const drawerWidth = '(max-width: 1024px)'
function watchWidth(update: () => void) {
  const query = window.matchMedia(drawerWidth)
  query.addEventListener('change', update)
  return () => query.removeEventListener('change', update)
}
const needsDrawer = () => window.matchMedia(drawerWidth).matches

type RailProps = {
  locale: Locale
  mode: MissionRailMode
  onModeChange: (mode: MissionRailMode) => void
  levelId: string
  isChallenge: boolean
  classroom?: boolean
  onHome: () => void
  onPrevious?: () => void
  onNext?: () => void
  children: ReactNode
}

export function MissionRail({ locale, mode, onModeChange, levelId, isChallenge, classroom, onHome, onPrevious, onNext, children }: RailProps) {
  const drawerLayout = useSyncExternalStore(watchWidth, needsDrawer)
  const [open, setOpen] = useState(false)
  const dialogId = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const body = useRef<HTMLDivElement>(null)
  const entryButton = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const backdropDown = useRef(false)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const title = t('任务列表', 'Mission list')
  const pinned = !drawerLayout && mode === 'pinned'
  const compact = !drawerLayout && mode === 'compact'

  // A new lesson or a different screen layout starts with its own navigation state.
  useLayoutEffect(() => { setOpen(false) }, [levelId, drawerLayout])

  useLayoutEffect(() => {
    const element = dialog.current
    if (open && element) {
      element.showModal()
      closeButton.current?.focus({ preventScroll: true })
      return () => element.close()
    }
    if (restoreFocus.current) {
      entryButton.current?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [open, mode, drawerLayout])

  // Center the current item in the scrollable list without scrolling the classroom or its toolbar.
  useLayoutEffect(() => {
    const list = body.current
    const current = list?.querySelector<HTMLElement>('.mission-list [aria-current="step"]')
    if (!current || !list || list.scrollHeight <= list.clientHeight) return
    const frame = list.getBoundingClientRect()
    const item = current.getBoundingClientRect()
    if (item.top < frame.top + 8 || item.bottom > frame.bottom - 8) {
      list.scrollTop += item.top - frame.top - (frame.height - item.height) / 2
    }
  }, [levelId, mode, open, drawerLayout, locale])

  function dismiss() {
    restoreFocus.current = true
    setOpen(false)
  }
  function chooseMode(next: MissionRailMode) {
    dismiss()
    onModeChange(next)
  }

  const openerName = drawerLayout ? title : t('展开任务列表栏', 'Show the mission list panel')
  const opener = <button type="button" ref={entryButton} className="mission-rail__open" aria-label={openerName}
    title={openerName} aria-haspopup="dialog" aria-controls={dialogId} aria-expanded={open} onClick={() => setOpen(true)}>
    <Icon name="expand" size={20} /><span className="mission-rail__label">{drawerLayout ? title : t('目录', 'List')}</span>
  </button>

  function shortcut(icon: IconName, text: string, label: string, action?: () => void) {
    return <button type="button" className="icon-button mission-rail__shortcut" title={label} aria-label={label}
      disabled={!action} onClick={action}><Icon name={icon} size={20} /><span className="mission-rail__label">{text}</span></button>
  }
  const hide = t('收起任务列表栏', 'Hide the mission list panel')
  const minimal = t('精简导航', 'Compact navigation')
  const pin = t('固定侧栏', 'Pin sidebar')
  const close = t('关闭任务列表', 'Close mission list')
  const panel = <aside className={'sidebar sidebar-open mission-rail__panel' + (classroom ? ' classroom-rail' : '')}
    aria-label={t('学习进度与任务列表', 'Progress and mission list')}>
    <div className="mission-rail__toolbar">
      <strong className="mission-rail__title">{t('导航', 'Navigation')}</strong>
      <div className="mission-rail__actions">
        {open && !drawerLayout && <button type="button" className="mission-rail__action" title={pin} aria-label={pin}
          onClick={() => chooseMode('pinned')}><Icon name="pin" /><span>{t('固定', 'Pin')}</span></button>}
        {!drawerLayout && mode !== 'compact' && <button type="button" className="mission-rail__action" title={minimal} aria-label={minimal}
          ref={!open && pinned ? entryButton : undefined} onClick={() => chooseMode('compact')}>
          <Icon name="compact" /><span>{t('精简', 'Compact')}</span></button>}
        {!drawerLayout && mode !== 'hidden' && <button type="button" className="mission-rail__action" title={hide} aria-label={hide}
          onClick={() => chooseMode('hidden')}><Icon name="collapse" /><span>{t('隐藏', 'Hide')}</span></button>}
        {open && <button type="button" className="mission-rail__action" ref={closeButton} title={close} aria-label={close}
          onClick={dismiss}><Icon name="close" /><span>{t('关闭', 'Close')}</span></button>}
      </div>
    </div>
    <div className="mission-rail__body" ref={body} onClick={event => {
      if (open && event.target instanceof Element && event.target.closest('.mission-list button, .course-route-nav nav button')) dismiss()
    }}>{children}</div>
  </aside>

  return <>
    {pinned ? !open && panel : compact ? <nav className="mission-rail__compact" aria-label={minimal}>
      {opener}
      {shortcut(isChallenge ? 'challenge' : 'modules', isChallenge ? t('挑战场', 'Arena') : t('模块', 'Modules'),
        isChallenge ? t('返回挑战场', 'Back to Challenge Arena') : t('返回学习模块', 'Back to learning modules'), onHome)}
      {shortcut('previous', t(isChallenge ? '上一关' : '上一课', 'Back'), isChallenge ? t('上一关', 'Previous challenge') : t('上一课', 'Previous lesson'), onPrevious)}
      {shortcut('next', t(isChallenge ? '下一关' : '下一课', 'Next'), isChallenge ? t('下一关', 'Next challenge') : t('下一课', 'Next lesson'), onNext)}
    </nav> : <div className="mission-rail__launcher">{opener}</div>}
    <dialog ref={dialog} id={dialogId} className="mission-rail__dialog" aria-label={title}
      onCancel={event => { event.preventDefault(); dismiss() }}
      onPointerDown={event => { backdropDown.current = event.target === event.currentTarget }}
      onClick={event => { if (backdropDown.current && event.target === event.currentTarget) dismiss() }}>
      {open && panel}
    </dialog>
  </>
}
