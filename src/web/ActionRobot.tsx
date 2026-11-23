import { useState } from 'react'
import type { ApiName, Locale } from '../shared/types'
import type { StationActivity } from './station3d/types'
import { describeFlow } from './stationFlowCue'
import { tr } from './text'
import './action-robot.css'

const actions: Record<ApiName, [symbol: string, zh: string, en: string]> = {
  scan: ['◎', '扫描', 'Scanning'],
  read_map: ['▦', '看地图', 'Reading the map'],
  move: ['➜', '移动', 'Moving'],
  pick: ['+', '拾取', 'Picking up'],
  say: ['···', '说话', 'Speaking'],
  submit: ['↑', '交付', 'Handing in'],
  load: ['←', '读取内存', 'Reading memory'],
  store: ['→', '写入内存', 'Writing memory'],
  step: ['▶', '执行指令', 'Executing an instruction'],
  wait: ['◷', '等待', 'Waiting'],
}
const arrows: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' }

export function ActionRobot({ activity, locale }: { activity?: StationActivity; locale: Locale }) {
  const token = activity?.token
  const [frame, setFrame] = useState({ token, number: 0 })
  // Remount the moving parts only for a fresh frame. A second pick() has its own
  // gesture even if its arguments and the player's square stay the same.
  if (token !== frame.token) setFrame({ token, number: frame.number + 1 })
  if (!activity) return <span className="pixel-bot" aria-hidden="true" />
  const { action, value, failed } = activity
  const direction = action === 'move' && typeof value === 'string' && Object.hasOwn(arrows, value) ? value : undefined
  let label: string
  let badge: string
  if (activity.flow) {
    const flow = describeFlow(activity.flow, locale)
    label = [flow.label, flow.code, flow.detail].join(' · ')
    badge = flow.symbol
  } else {
    const [symbol, zh, en] = actions[activity.action]
    const speech = action === 'say' && typeof value === 'string' ? ' · ' + value : ''
    label = tr(locale, zh, en) + (failed ? tr(locale, ' · 未完成', ' · Unsuccessful') : speech)
    badge = failed ? '!' : direction ? arrows[direction] : symbol
    if (!failed && activity.pickupKind === 'chest') { label = tr(locale, '打开宝箱', 'Open chest'); badge = '◇' }
    if (!failed && activity.pickupKind === 'key') { label += tr(locale, ' · 拿到钥匙', ' · Collected key'); badge = '⚿' }
  }
  return <span className="pixel-bot action-robot" data-robot-action={action} data-failed={failed || undefined}
    data-pickup={!failed ? activity.pickupKind : undefined}
    data-condition={activity.flow?.condition}
    data-direction={direction} role="img" aria-label={label} title={label}>
    <span key={frame.number} className="action-robot__pose" aria-hidden="true">
      <i className="action-robot__body" />
      <i className="action-robot__effect" />
      <b className="action-robot__badge">{badge}</b>
    </span>
  </span>
}
