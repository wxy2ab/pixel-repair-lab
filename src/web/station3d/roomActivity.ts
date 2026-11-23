import { componentReading, gateOutput } from '../../engine/circuit'
import { executeCpuInstruction } from '../../engine/cpu'
import type { Bit } from '../../shared/hardware'
import type { Locale } from '../../shared/types'
import type { LessonRoomFamily } from './lessonRoom'
import { tr } from '../text'

export type RoomTarget = 'sample' | 'setting' | 'run'
export type RoomActivityState = { sample: number; setting: number; ran: boolean; revision: number; unitId?: string }
export type RoomActivityKind = LessonRoomFamily | 'stack-queue' | 'cpu' | 'array' | 'table' | 'statistics' | 'query' | 'pixels'
export type RoomActivityReading = {
  kind: RoomActivityKind; mode: 'scalar' | 'series' | 'mask'; input: number[]; setting: number; output: number[] | null
}
export type RoomActivityDescription = { controls: Record<RoomTarget, { label: string; value: string }>; status: string }

const racks = [[4, 1, 3, 2], [2, 5, 1, 4], [3, 1, 3, 2]]
const samples = [[2, 8, 5], [4, 7, 7], [3, 6, 3]]
const tables = {
  coding: { samples: [[2], [5], [0]], settings: [3, 1], mode: 'scalar' },
  algorithms: { samples: racks, settings: [0, 1], mode: 'series' },
  'stack-queue': { samples: racks, settings: [0, 1], mode: 'mask' },
  systems: { samples: [[1, 0], [1, 1], [0, 1], [0, 0]], settings: [0, 1], mode: 'scalar' },
  cpu: { samples: [[4, 2], [7, 3], [5, 5]], settings: [0, 1], mode: 'scalar' },
  electronics: { samples: [[1], [0]], settings: [1, 0], mode: 'scalar' },
  data: { samples, settings: [0, 1], mode: 'scalar' },
  array: { samples, settings: [1, 2], mode: 'series' },
  table: { samples, settings: [0, 1], mode: 'series' },
  statistics: { samples, settings: [0, 1], mode: 'scalar' },
  query: { samples, settings: [5, 7, 3], mode: 'mask' },
  vision: { samples: [[50, 70, 90], [85, 45, 60], [72, 91, 67]], settings: [70, 85, 50], mode: 'mask' },
  pixels: { samples: [[40, 128, 210], [180, 60, 120], [100, 190, 230]], settings: [128, 80, 192], mode: 'mask' },
  ai: { samples: [[2, 4, 7], [6, 2, 5], [1, 3, 2]], settings: [4, 6, 2], mode: 'mask' },
} satisfies Record<RoomActivityKind, { samples: number[][]; settings: number[]; mode: RoomActivityReading['mode'] }>

const unitActivities: Partial<Record<string, { family: LessonRoomFamily; kind: RoomActivityKind }>> = {
  structures: { family: 'algorithms', kind: 'stack-queue' },
  architecture: { family: 'systems', kind: 'cpu' },
  numpy: { family: 'data', kind: 'array' },
  pandas: { family: 'data', kind: 'table' },
  statistics: { family: 'data', kind: 'statistics' },
  database: { family: 'data', kind: 'query' },
  opencv: { family: 'vision', kind: 'pixels' },
}

function activityKind(family: LessonRoomFamily, state: RoomActivityState): RoomActivityKind {
  const preset = state.unitId && Object.hasOwn(unitActivities, state.unitId) ? unitActivities[state.unitId] : undefined
  return preset?.family === family ? preset.kind : family
}

export function initialRoomActivity(unitId?: string): RoomActivityState {
  return { sample: 0, setting: 0, ran: false, revision: 0, unitId }
}

export function updateRoomActivity(family: LessonRoomFamily, state: RoomActivityState, target: RoomTarget): RoomActivityState {
  const table = tables[activityKind(family, state)]
  const revision = state.revision + 1
  switch (target) {
    case 'sample': return { ...state, sample: (state.sample + 1) % table.samples.length, ran: false, revision }
    case 'setting': return { ...state, setting: (state.setting + 1) % table.settings.length, ran: false, revision }
    case 'run': return { ...state, ran: true, revision }
  }
}

function result(kind: RoomActivityKind, input: number[], setting: number): number[] {
  switch (kind) {
    case 'coding':
    case 'array': return input.map(value => value + setting)
    case 'algorithms':
    case 'table': return [...input].sort((a, b) => setting === 0 ? a - b : b - a)
    case 'stack-queue': return input.map((_, i) => Number(i === (setting === 0 ? 0 : input.length - 1)))
    case 'systems': return [gateOutput(setting === 0 ? 'AND' : 'OR', input[0] as Bit, input[1] as Bit)]
    case 'cpu': {
      const cpu = executeCpuInstruction({ accumulator: input[0], memory: [input[1]], pc: 0, halted: false },
        { op: setting === 0 ? 'ADD' : 'SUB', address: 0 })
      if ('issue' in cpu) throw new Error('Invalid CPU workbench sample')
      return [cpu.state.accumulator]
    }
    case 'electronics': return [componentReading('diode', [input[0] as Bit, setting as Bit]).output]
    case 'data':
    case 'statistics': {
      if (setting === 0) return [input.reduce((sum, value) => sum + value, 0) / input.length]
      const max = Math.max(...input)
      return [kind === 'statistics' ? max - Math.min(...input) : max]
    }
    case 'pixels': return input.map(value => Number(value > setting))
    case 'vision':
    case 'query': return input.map(value => Number(value >= setting))
    case 'ai': {
      const first = input.findIndex(value => value >= setting)
      return input.map((_, i) => Number(i === first))
    }
  }
}

export function roomActivityReading(family: LessonRoomFamily, state: RoomActivityState): RoomActivityReading {
  const kind = activityKind(family, state)
  const table = tables[kind]
  const input = [...table.samples[state.sample]]
  const setting = table.settings[state.setting]
  return { kind, input, setting, mode: table.mode, output: state.ran ? result(kind, input, setting) : null }
}

function controls(sampleLabel: string, sampleValue: string, settingLabel: string, settingValue: string, runLabel: string,
  runValue: string, status: string): RoomActivityDescription {
  return { controls: {
    sample: { label: sampleLabel, value: sampleValue },
    setting: { label: settingLabel, value: settingValue },
    run: { label: runLabel, value: runValue },
  }, status }
}

export function describeRoomActivity(family: LessonRoomFamily, state: RoomActivityState, locale: Locale): RoomActivityDescription {
  const { kind, input, setting, output } = roomActivityReading(family, state)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const cells = (n: number) => t(n + ' 格', n + (n === 1 ? ' bar' : ' bars'))
  const group = input.join(' · ')
  const pack = t('换一组电池', 'Change battery pack')
  const ready = t('待运行', 'Ready')
  const slotName = (i: number) => String.fromCharCode(65 + i)
  const namedGroup = input.map((n, i) => slotName(i) + '=' + n + (kind === 'vision' ? '%' : '')).join(' · ')
  const slots = output?.flatMap((flag, i) => flag ? [slotName(i)] : []).join(' · ')
  switch (kind) {
    case 'coding':
      return controls(t('换一块电池', 'Change battery'), cells(input[0]), t('调整补电量', 'Change charge amount'), '+' + cells(setting),
        t('给电池补电', 'Charge battery'), output ? cells(output[0]) : ready,
        output ? input[0] + ' + ' + setting + ' = ' + cells(output[0]) : t('按下补电键，看看电量会变成多少。', 'Press the charger to see the new charge.'))
    case 'algorithms':
    case 'table': {
      const rows = kind === 'table'
      const order = setting === 0 ? t('从小到大', 'Low to high') : t('从大到小', 'High to low')
      return controls(rows ? t('换一张表', 'Change table') : pack, group, t('改变顺序', 'Change order'), order,
        rows ? t('按电量排表', 'Sort rows') : t('排列电池', 'Sort batteries'), output ? output.join(' · ') : ready,
        output ? t('电量' + order + '排好了。', 'Charges sorted ' + order.toLowerCase() + ' · ') + output.join(' → ')
          : t('选好顺序，看看哪块电池会排在最前面。', 'Choose an order and see which battery comes first.'))
    }
    case 'stack-queue': {
      const queue = setting === 0
      const index = output?.indexOf(1) ?? -1
      const rule = queue ? t('队头先取', 'Queue front') : t('栈顶先取', 'Stack top')
      return controls(pack, namedGroup, t('改变取法', 'Change pickup rule'), rule, t('取出一块', 'Take one'),
        output ? slotName(index) + ' · ' + cells(input[index]) : ready, output
          ? t(queue ? '最先来的 ' : '最后来的 ', queue ? 'First in was ' : 'Last in was ') + slotName(index) + ' · ' + cells(input[index])
          : t('电池从左到右依次到站。这次会取出哪一块？', 'The batteries arrived from left to right. Which one comes out?'))
    }
    case 'systems': {
      const gate = setting === 0 ? 'AND' : 'OR'
      return controls(t('切换输入', 'Change inputs'), 'A=' + input[0] + ' · B=' + input[1], t('换逻辑门', 'Change gate'), gate,
        t('送入信号', 'Send signals'), output ? String(output[0]) : ready, output
          ? [input[0], gate, input[1]].join(' ') + ' → ' + output[0]
          : t('让两个信号经过逻辑门，看看输出灯。', 'Send both signals through the gate and watch the output lamp.'))
    }
    case 'cpu': {
      const op = setting === 0 ? 'ADD 0' : 'SUB 0'
      return controls(t('更换读数', 'Change values'), 'ACC=' + input[0] + ' · RAM[0]=' + input[1], t('更换指令', 'Change instruction'), op,
        t('执行指令', 'Clock CPU'), output ? 'ACC=' + output[0] : ready, output
          ? 'ACC ← ' + input[0] + (setting === 0 ? ' + ' : ' − ') + input[1] + ' = ' + output[0]
          : t('给 CPU 一个时钟，看它怎样用内存里的数更新 ACC。', 'Clock the CPU to update ACC using the number in memory.'))
    }
    case 'electronics': {
      const light = output?.[0] ? t('亮', 'On') : t('灭', 'Off')
      const explanation = !input[0] ? t('开关断开，电流走不成一圈。', 'The open switch breaks the current path.')
        : setting ? t('回路接通，电流正向经过 LED，灯亮了。', 'Current flows forward through the LED and lights it.')
          : t('开关已闭合，接反的 LED 挡住了电流。', 'The switch is closed, but the reversed LED blocks the current.')
      return controls(t('拨动开关', 'Toggle switch'), input[0] ? t('闭合', 'Closed') : t('断开', 'Open'),
        t('翻转 LED', 'Flip LED'), setting ? t('正接', 'Forward') : t('反接', 'Reversed'), t('试灯', 'Test lamp'),
        output ? light : ready, output ? explanation : t('接好开关和 LED，按试灯键通电。', 'Set the switch and LED, then test the lamp.'))
    }
    case 'array':
      return controls(t('换数组', 'Change array'), '[' + input.join(', ') + ']', t('改变加数', 'Change increment'), '+' + setting,
        t('逐个相加', 'Add to each'), output ? '[' + output.join(', ') + ']' : ready, output
          ? '[' + input.join(', ') + '] + ' + setting + ' → [' + output.join(', ') + ']'
          : t('把同一个数加到数组中的每个读数上。', 'Add the same number to every reading in the array.'))
    case 'data':
    case 'statistics': {
      const rule = setting === 0 ? t('平均值', 'Mean') : kind === 'statistics' ? t('极差', 'Range') : t('最大值', 'Maximum')
      const formula = setting === 0 ? '(' + input.join(' + ') + ') ÷ ' + input.length
        : kind === 'statistics' ? Math.max(...input) + ' − ' + Math.min(...input) : 'max(' + input.join(', ') + ')'
      return controls(t('换一组读数', 'Change readings'), group, t('换统计方法', 'Change statistic'), rule,
        t('汇总读数', 'Summarize'), output ? cells(output[0]) : ready, output ? formula + ' = ' + cells(output[0])
          : t('读数相同，换个统计方法，结果会怎样？', 'Try two statistics on these same readings.'))
    }
    case 'query':
      return controls(t('换数据表', 'Change records'), namedGroup,
        t('改查询条件', 'Change filter'), 'WHERE charge >= ' + setting,
        t('查询电池', 'Query batteries'), output ? slots || t('空表', 'No rows') : ready, output
          ? t('符合条件的行', 'Matching rows') + ' · ' + (input.flatMap((n, i) => output[i] ? [slotName(i) + '=' + n] : []).join(' · ') || '∅')
          : t('用 WHERE 只留下电量达到门槛的行。', 'Use WHERE to keep rows whose charge meets the threshold.'))
    case 'vision':
    case 'pixels': {
      const pixels = kind === 'pixels'
      const unit = pixels ? '' : '%'
      const result = slots || t('无', 'None')
      return controls(pixels ? t('换灰度样本', 'Change gray levels') : t('换候选框', 'Change boxes'),
        namedGroup,
        t('调节阈值', 'Change threshold'), (pixels ? '> ' : '≥ ') + setting + unit,
        pixels ? t('生成黑白图', 'Make a binary image') : t('筛选检测框', 'Filter boxes'), output ? result : ready,
        output ? (pixels ? t('变成白色的格子', 'White pixels') : t('保留的检测框', 'Boxes kept')) + ' · ' + result
          : pixels ? t('亮度超过阈值的像素会变白，其余会变黑。', 'Pixels brighter than the threshold turn white. The others turn black.')
            : t('试着提高门槛，看看哪些检测框会留下。', 'Raise the confidence threshold and see which boxes remain.'))
    }
    case 'ai': {
      const first = output?.indexOf(1) ?? -1
      const chosen = first === -1 ? t('没有符合的电池', 'No matching battery') : slotName(first) + ' · ' + cells(input[first])
      return controls(pack, namedGroup,
        t('改任务要求', 'Change request'), t('至少 ', 'At least ') + cells(setting),
        t('让 AI 取件', 'Ask AI to pick'), output ? chosen : ready,
        output ? t('芽芽收到的取件结果', 'Pick reported to Sprout') + ' · ' + chosen
          : t('让 AI 从左到右检查，只取第一块符合要求的电池。', 'Ask AI to check left to right and pick only the first match.'))
    }
  }
}
