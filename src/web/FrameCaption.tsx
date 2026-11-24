import type { Locale } from '../shared/types'
import { tr } from './text'

export function FrameCaption({ caption, locale }: { caption: string; locale: Locale }) {
  return <>
    <details className="frame-caption">
      <summary>{tr(locale, '这一步的说明', 'Describe this step')}</summary>
      <p className="animation-caption">{caption}</p>
    </details>
    <span className="sr-only" aria-live="polite" aria-atomic="true">{caption}</span>
  </>
}
