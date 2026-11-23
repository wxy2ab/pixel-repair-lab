import { useState, type ReactNode } from 'react'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './for-lesson.css'

type TraceLine = { line: number; code: string }

export function StructureTrace<Frame extends TraceLine>({ frames, locale, children }: {
  frames?: Frame[]
  locale: Locale
  children: (frame?: Frame, index?: number) => ReactNode
}) {
  if (!frames?.length) return <>{children()}</>
  return <RecordedSteps frames={frames} locale={locale}>{children}</RecordedSteps>
}

function RecordedSteps<Frame extends TraceLine>({ frames, locale, children }: {
  frames: Frame[]; locale: Locale; children: (frame?: Frame, index?: number) => ReactNode
}) {
  const [position, setPosition] = useState(frames.length)
  const step = Math.min(position, frames.length)
  const current = frames[step - 1]
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <div data-testid="structure-trace">
    {children(current, step - 1)}
    {current && <ol className="for-source" aria-label={t('本步的 Python 代码', 'Python for this step')}>
      <li data-line={current.line} aria-current="step"><span>{current.line}</span><code>{current.code}</code></li>
    </ol>}
    <div className="replay-actions">
      <button type="button" className="text-button" disabled={step === 0} onClick={() => setPosition(0)}>{t('从头回看', 'Review from the start')}</button>
      <button type="button" className="subtle-button" disabled={step === 0} onClick={() => setPosition(step - 1)}>{t('上一步', 'Previous step')}</button>
      <output aria-live="polite">{step} / {frames.length}</output>
      <button type="button" className="subtle-button" disabled={step === frames.length} onClick={() => setPosition(step + 1)}>{t('下一步', 'Next step')}</button>
    </div>
  </div>
}
