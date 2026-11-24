import type { GridLevel, GridSnapshot, Locale, RunResult } from '../shared/types'
import { runIssueText, tr } from './text'
import './laser-crossing.css'

export function LaserStatus({ level, snapshot, locale }: { level: GridLevel; snapshot: GridSnapshot; locale: Locale }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <div className="laser-status-strip" aria-label={t('机关状态', 'Device status')}>
    {level.devices?.map(device => {
      if (device.kind === 'mirror') return <span key={device.id}>{t('镜面', 'Mirror')} <b>{device.orientation === '/' ? '╱' : '╲'}</b></span>
      if (device.kind === 'laser') {
        const on = !(device.switchId && snapshot.devices?.switches.includes(device.switchId))
        return <span key={device.id} data-active={on}>{t('激光', 'Laser')} <b>{on ? t('亮', 'On') : t('灭', 'Off')}</b></span>
      }
      if (device.kind === 'key') return <span key={device.id}>{t('钥匙', 'Key')} <b>{snapshot.devices?.keys.includes(device.id)
        ? t('已拿到', 'Collected') : t('未拿到', 'On map')}</b></span>
      return null
    })}
  </div>
}

export function laserCrossingResult(locale: Locale, result: RunResult) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const { turn, player } = result.final
  if (result.won) return t(`第 ${turn} 回合，芽芽安全到达出口。`, `Sprout reached the exit safely on turn ${turn}.`)
  const issue = result.issue
  if (!issue) return
  const line = issue.line ? t(`程序停在第 ${issue.line} 行。`, ` The program stopped on line ${issue.line}.`) : ''
  switch (issue.code) {
    case 'laserHit': return t(`第 ${turn} 回合，激光照到了芽芽所在的格子（${player.x}, ${player.y}）。`,
      `On turn ${turn}, the laser hit Sprout at (${player.x}, ${player.y}).`) + line
    case 'lockedDoor': return t('芽芽来到门前，门还锁着。', 'Sprout reached the gate while it was locked.') + line
    case 'fixtureBlocked': return t('这格被机关占住了。', 'A fixture blocked this square.') + line
    case 'blocked': return t('前方没有通路。', 'The way ahead was blocked.') + line
    case 'unfinished': return t(`程序在第 ${turn} 回合结束，芽芽还没到出口。`, `The program ended on turn ${turn}, before Sprout reached the exit.`)
    default: return runIssueText(locale, issue)
  }
}
