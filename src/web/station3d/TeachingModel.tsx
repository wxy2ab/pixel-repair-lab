import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '../../shared/types'
import { useClassroom } from '../Classroom'
import { tr } from '../text'
import type { ModelBuilder } from './teaching-model-types'
import type { createTeachingRenderer } from './teaching-model-renderer'
import './teaching-model.css'

type ModelProps<State> = {
  sceneKey: string
  label: string
  locale: Locale
  state: State
  load: () => Promise<ModelBuilder<State>>
  onPick?: (id: string) => void
}

export function TeachingModel<State>(props: ModelProps<State>) {
  const classroom = useClassroom()
  return classroom ? <Instrument key={props.sceneKey} {...props} /> : null
}

function Instrument<State>({ sceneKey, label, locale, state, load, onPick }: ModelProps<State>) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const notes = useRef<HTMLDivElement>(null)
  const engine = useRef<ReturnType<typeof createTeachingRenderer<State>>>(undefined)
  const latest = useRef(state)
  const [status, setStatus] = useState<'loading' | 'fallback' | 'webgl'>('loading')
  const [overhead, setOverhead] = useState(false)
  useLayoutEffect(() => {
    latest.current = state
    engine.current?.update(state)
  }, [state])

  useEffect(() => {
    const surface = canvas.current, annotations = notes.current
    if (!surface || !annotations) return
    let active = true
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      observer.disconnect()
      void Promise.all([import('./teaching-model-renderer'), load()]).then(([module, build]) => {
        if (!active) return
        engine.current = module.createTeachingRenderer(surface, annotations, build, {
          ready: () => { if (active) setStatus('webgl') },
          failed: () => { if (active) setStatus('fallback') },
        })
        engine.current.update(latest.current)
      }).catch(() => { if (active) setStatus('fallback') })
    }, { rootMargin: '120px' })
    observer.observe(surface)
    return () => {
      active = false
      observer.disconnect()
      engine.current?.dispose()
      engine.current = undefined
    }
  }, [load])

  return <figure className="teaching-model" data-teaching-model={sceneKey} data-renderer={status}
    aria-label={label} hidden={status === 'fallback'}>
    <figcaption><strong>{label}</strong>
      <button type="button" className="teaching-model-view" aria-pressed={overhead} disabled={status !== 'webgl'}
        onClick={() => { engine.current?.setOverhead(!overhead); setOverhead(!overhead) }}>
        {tr(locale, '俯视', 'Top view')}
      </button>
    </figcaption>
    <div className="teaching-model-tray">
      <canvas ref={canvas} role="img" aria-label={label} data-pickable={Boolean(onPick)}
        onClick={event => {
          if (!onPick) return
          const id = engine.current?.pick(event.clientX, event.clientY)
          if (id !== undefined) onPick(id)
        }} />
      <div className="teaching-model-labels" ref={notes} aria-hidden="true" />
    </div>
  </figure>
}
