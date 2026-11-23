import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Locale } from '../../shared/types'
import { tr } from '../text'
import type { createHubRenderer, HubCharacter, WorkshopStop } from './hub-renderer'
import benchPoster from './workshop-learning.webp'
import arenaPoster from './workshop-arena.webp'
import './workshop-hub.css'

type WorkshopProps = {
  locale: Locale
  variant: WorkshopStop
  onLearn: () => void
  onChallenge?: () => void
  children?: ReactNode
}

export function WorkshopHub({ locale, variant, onLearn, onChallenge, children }: WorkshopProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const engine = useRef<ReturnType<typeof createHubRenderer> | undefined>(undefined)
  const navigation = useRef({ onLearn, onChallenge })
  const messageTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [greeting, setGreeting] = useState<HubCharacter>()
  const [status, setStatus] = useState<'poster' | 'ready' | 'unavailable'>('poster')
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const arena = variant === 'arena'
  useEffect(() => { navigation.current = { onLearn, onChallenge } }, [onLearn, onChallenge])

  function greet(who: HubCharacter = 'sprout') {
    setGreeting(who)
    clearTimeout(messageTimer.current)
    messageTimer.current = setTimeout(() => setGreeting(undefined), 2900)
  }
  function open(stop: WorkshopStop) {
    if (stop === 'arena') navigation.current.onChallenge?.()
    else navigation.current.onLearn()
  }
  useEffect(() => {
    if (!canvas.current) return
    const surface = canvas.current
    let active = true
    setStatus('poster')
    function failed() {
      if (!active) return
      engine.current = undefined
      setStatus('unavailable')
    }
    const upcoming = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      upcoming.disconnect()
      void import('./hub-renderer').then(({ createHubRenderer }) => {
        if (!active) return
        engine.current = createHubRenderer(surface, variant, {
          onVisit: open, canVisit: stop => stop === 'learning' || Boolean(navigation.current.onChallenge),
          onGreet: greet, onReady: () => { if (active) setStatus('ready') }, onFailure: failed,
        })
      }).catch(failed)
    }, { rootMargin: '180px' })
    upcoming.observe(surface)
    return () => {
      active = false
      upcoming.disconnect()
      engine.current?.dispose()
      engine.current = undefined
      clearTimeout(messageTimer.current)
    }
  }, [variant])

  function visit(stop: WorkshopStop) {
    if (engine.current) engine.current.visit(stop)
    else open(stop)
  }
  return <div className="workshop-hub" data-variant={variant} data-ready={status === 'ready'} data-testid={`workshop-hub-${variant}`}>
    <div className="workshop-copy">
      {children}
      <div className="workshop-passages">
        <button type="button" className={arena ? 'workshop-secondary' : 'workshop-primary'} onClick={() => visit('learning')}>
          {t('前往学习工作台', 'Visit the learning bench')} <span aria-hidden="true">↗</span>
        </button>
        {onChallenge && <button type="button" className={arena ? 'workshop-primary' : 'workshop-secondary'} onClick={() => visit('arena')}>
          {arena ? t('上场挑战', 'Enter the match') : t('进入挑战机库', 'Visit the arena hangar')} <span aria-hidden="true">↗</span>
        </button>}
      </div>
    </div>
    <div className="workshop-scene">
      {status !== 'ready' && <img className="workshop-poster" src={arena ? arenaPoster : benchPoster} alt="" loading="lazy" />}
      <canvas ref={canvas} role="img" tabIndex={status === 'ready' ? 0 : undefined}
        aria-label={(arena ? t('三维挑战机库', '3D challenge hangar') : t('三维维修站', '3D repair station')) +
          (status === 'ready' ? t('，方向键让芽芽走动', '. Use arrow keys to walk with Sprout') : '')} />
      <div className="workshop-scene-tools">
        <button type="button" className="workshop-hello-button" onClick={() => engine.current ? engine.current.greet() : greet()}>
          <span className="workshop-signal" aria-hidden="true" />{t('向芽芽打招呼', 'Greet Sprout')}
        </button>
        {arena && <button type="button" onClick={() => engine.current ? engine.current.greet('rival') : greet('rival')}>
          {t('招呼对手', 'Greet the rivals')}
        </button>}
        {status === 'ready' && <button type="button" className="workshop-reset" aria-label={t('复位场景视角', 'Reset scene view')}
          title={t('复位场景视角', 'Reset scene view')} onClick={() => engine.current?.resetCamera()}>↺</button>}
      </div>
      <span className="workshop-drag-hint">{status === 'ready' && t('点地面走动 · 拖动环顾', 'Tap the floor to walk · Drag to look around')}</span>
      <div className="workshop-speech" role="status" data-visible={Boolean(greeting)}>{greeting === 'rival'
        ? t('对手：赛道上见！', 'Rival: See you on the track!')
        : greeting && (arena
        ? t('芽芽：我准备好了！', 'Sprout: Ready when you are!')
        : t('芽芽：一起给电池补电吧！', 'Sprout: Let’s charge some batteries!'))}</div>
    </div>
  </div>
}
