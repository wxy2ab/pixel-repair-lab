import type { ApiName, Locale } from '../shared/types'
import type { StationActivity } from './station3d/types'
import { pythonValue } from './pythonValue'
import { describeFlow } from './stationFlowCue'
import { tr } from './text'

const labels: Record<ApiName, readonly [string, string]> = {
  scan: ['扫描', 'Scan'], read_map: ['读取地图', 'Read map'], submit: ['提交', 'Submit'], pick: ['拾取', 'Pick up'],
  move: ['移动', 'Move'], wait: ['等待', 'Wait'], say: ['说话', 'Say'], load: ['读取内存', 'Read memory'],
  store: ['写入内存', 'Write memory'], step: ['推进时钟', 'Clock pulse'],
}

export function StationActionCue({ activity, locale, showValue = true }: { activity?: StationActivity; locale: Locale; showValue?: boolean }) {
  if (!activity) return null
  if (activity.flow) {
    const { label, code, detail } = describeFlow(activity.flow, locale)
    return <div className="station-action-cue station-flow-cue" data-action={activity.action} data-condition={activity.flow.condition}>
      <strong>{label}</strong><code title={code}>{code}</code><span title={detail}>{detail}</span>
    </div>
  }
  const { action, failed, value } = activity
  const pickup = !failed && activity.pickupKind
  const label = pickup === 'chest' ? tr(locale, '打开宝箱', 'Open chest') : tr(locale, ...labels[action])
  const display = !showValue || value === undefined ? '' : typeof value === 'string' ? value : pythonValue(value)
  return <div className="station-action-cue" data-action={action} data-failed={failed || undefined}>
    <strong>{label}</strong><code>{action}()</code>
    {display && <span title={display}>{display}</span>}
    {pickup === 'key' && <b>{tr(locale, '拿到钥匙', 'Collected key')}</b>}
    {failed && <b>{tr(locale, '未完成', 'Unsuccessful')}</b>}
  </div>
}
