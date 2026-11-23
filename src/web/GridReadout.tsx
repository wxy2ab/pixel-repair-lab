import type { Locale, RunFrame } from '../shared/types'
import { pythonValue } from './pythonValue'
import { tr } from './text'

export function GridReadout({ frame, locale }: { frame?: RunFrame; locale: Locale }) {
  if (!frame) return null
  const { action, value, state } = frame
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const labels = {
    scan: t('传感器读到', 'Sensor reading'), move: t('芽芽的位置', 'Sprout’s position'),
    pick: t('取到的物品', 'Item collected'), say: t('芽芽说', 'Sprout says'),
    submit: t('交给维修站', 'Sent to the station'), load: t('从内存读到', 'Read from memory'),
    store: t('写入内存', 'Written to memory'), step: t('处理器回报', 'CPU response'),
    wait: t('原地等待', 'Waited in place'), read_map: t('地图数据', 'Map data'),
  }
  const reading = action === 'wait' ? t('第 ' + state.turn + ' 回合', 'Turn ' + state.turn)
    : action === 'move' ? `(${state.player.x}, ${state.player.y})`
    : value === undefined ? t('没有读数', 'No reading') : typeof value === 'string' ? value : pythonValue(value)
  return <div className="grid-readout">
    <span>{t(`第 ${frame.line} 行`, `Line ${frame.line}`)} <code>{action}()</code></span>
    <b aria-hidden="true">→</b>
    <span>{labels[action]} <strong>{reading}</strong></span>
  </div>
}
