import type { Locale, PythonFlowEvent } from '../shared/types'
import { pythonValue } from './pythonValue'
import { tr } from './text'

export function describeFlow(event: PythonFlowEvent, locale: Locale) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const value = event.value === undefined ? undefined : pythonValue(event.value)
  const round = event.iteration
  switch (event.kind) {
    case 'call':
    case 'return': {
      const call = event.kind === 'call'
      const label = call ? t('调用函数', 'Call function') : t('函数返回', 'Return from function')
      const depth = t(`第 ${event.depth} 层调用`, `Call depth ${event.depth}`)
      const args = call ? event.arguments?.map(arg => `${arg.name}=${pythonValue(arg.value)}`).join(', ') : undefined
      return { label, code: `${event.name}(${args ?? ''})`, symbol: call ? '↳' : '↰',
        detail: !call && value !== undefined ? t(`返回 ${value}`, `Returned ${value}`) + ' · ' + depth : depth }
    }
    case 'if': {
      const fallback = event.name === 'else'
      const detail = fallback ? t('走 else 分支', 'Take the else branch') : event.condition
        ? t('True · 进入这一段', 'True · Enter this branch') : t('False · 跳过这一段', 'False · Skip this branch')
      return { label: t('选择分支', 'Choose branch'), code: event.name ?? 'if', detail, symbol: event.condition ? '↗' : '↘' }
    }
    case 'break':
    case 'continue': {
      const stop = event.kind === 'break'
      const where = [event.loopKind, round === undefined ? undefined : t(`第 ${round} 轮`, `iteration ${round}`)].filter(Boolean).join(' ')
      const outcome = stop ? t('从这层循环后面继续', 'Resume after this loop')
        : t('跳过本轮剩下的步骤，回到循环开头', 'Skip the rest of this iteration and go back to the loop header')
      return { label: stop ? t('跳出循环', 'Break out') : t('跳到下一轮', 'Continue loop'), code: event.kind,
        detail: [where, outcome].filter(Boolean).join(' · '), symbol: stop ? '↗' : '↶' }
    }
    case 'for':
    case 'while': {
      const each = event.kind === 'for'
      const label = each ? t('遍历', 'For loop') : t('检查循环条件', 'Check loop condition')
      const count = round === undefined ? '' : t(`第 ${round} 轮`, `Iteration ${round}`)
      const finished = round === undefined ? t('结束循环', 'Exit loop') : t(`循环结束，共 ${round} 轮`, `Loop finished after ${round} ${round === 1 ? 'iteration' : 'iterations'}`)
      const detail = each
        ? event.condition ? [count, value === undefined ? undefined : `${event.name} = ${value}`].filter(Boolean).join(' · ') : finished
        : event.condition ? 'True · ' + count : 'False · ' + finished
      return { label, code: each && event.name ? `for ${event.name}` : event.kind, detail,
        symbol: !event.condition ? '⏹' : each ? '▸' : '↻' }
    }
  }
}
