import type { Locale } from '../shared/types'
import type { ReplayCursor } from './lessonTools'
import { tr } from './text'

export function ReplayControls({ cursor, count, locale, onNext, nextBusy }: {
  cursor: ReplayCursor; count: number; locale: Locale; onNext?: () => void; nextBusy?: boolean
}) {
  if (!count) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <div className="replay-controls">
    <div className="section-label">
      <label>{t('回放进度', 'Replay position')}
        <input type="range" min={0} max={count} value={cursor.step} onChange={event => cursor.seek(Number(event.target.value))} />
      </label>
      <output>{cursor.step} / {count}</output>
    </div>
    <div className="replay-actions">
      <button type="button" className="subtle-button" disabled={cursor.step === 0} onClick={() => cursor.seek(cursor.step - 1)}>{t('上一步', 'Previous step')}</button>
      <button type="button" className="subtle-button" onClick={() => cursor.toggle()}>
        {cursor.playing ? t('暂停回放', 'Pause replay') : t('播放回放', 'Play replay')}
      </button>
      <button type="button" className="subtle-button" disabled={cursor.step === count || nextBusy} onClick={onNext ?? (() => cursor.seek(cursor.step + 1))}>{t('下一步', 'Next step')}</button>
      <button type="button" className="text-button" disabled={cursor.step === count} onClick={() => cursor.seek(count)}>{t('跳到结尾', 'Skip to end')}</button>
    </div>
  </div>
}
