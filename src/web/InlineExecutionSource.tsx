import { useLayoutEffect, useRef } from 'react'
import type { Locale } from '../shared/types'
import { tr } from './text'
import './inline-execution-source.css'

export function InlineExecutionSource({ code, currentLine, nextLine, locale }: {
  code: string; currentLine?: number; nextLine?: number; locale: Locale
}) {
  const activeRow = useRef<HTMLSpanElement>(null)
  const nextRow = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const row = activeRow.current ?? nextRow.current
    const viewer = row?.closest('pre')
    if (!viewer || !row || viewer.scrollHeight <= viewer.clientHeight) return
    const viewportTop = viewer.getBoundingClientRect().top + viewer.clientTop
    const viewportBottom = viewportTop + viewer.clientHeight
    let { top, bottom } = row.getBoundingClientRect()
    if (activeRow.current && nextRow.current) {
      const upcoming = nextRow.current.getBoundingClientRect()
      const first = Math.min(top, upcoming.top), last = Math.max(bottom, upcoming.bottom)
      if (last - first <= viewer.clientHeight) { top = first; bottom = last }
    }
    // Move only the listing's scrollbar, leaving the board, editor focus and selection in place.
    if (top < viewportTop || bottom - top > viewer.clientHeight) viewer.scrollTop += top - viewportTop
    else if (bottom > viewportBottom) viewer.scrollTop += bottom - viewportBottom
  }, [code, currentLine, nextLine])

  const lines = code.split('\n')
  return lines.map((line, index) => {
    const number = index + 1
    const current = number === currentLine, next = number === nextLine
    const label = [current && tr(locale, '当前指令', 'Current instruction'), next && tr(locale, '下一条指令', 'Next instruction')].filter(Boolean).join(' · ')
    return <span ref={current ? activeRow : next ? nextRow : undefined} key={number} className="execution-listing-line execution-marked-line" data-line={number}
      aria-current={current ? 'step' : undefined} data-next={next || undefined} aria-description={label || undefined}>
      {line}{number < lines.length && '\n'}
    </span>
  })
}
