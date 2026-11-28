import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject, type TextareaHTMLAttributes } from 'react'
import type { Locale } from '../shared/types'
import { backspaceIndent, indentSelection, newlineWithIndent, outdentSelection, type CodeEdit } from './codeEditing'
import { tr } from './text'
import './code-field.css'

type FieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'wrap'>

/**
 * A plain textarea with the conveniences a longer program needs: line numbers, Tab indentation,
 * indentation carried to the next line, and a run shortcut. It stays a native textarea, so
 * labels, form filling and assistive technology keep working as before.
 */
export function CodeField({ value, onChange, locale, inputRef, onRun, python = true, className = 'python-input', ...field }: FieldProps & {
  value: string; onChange: (value: string) => void; locale: Locale
  inputRef?: RefObject<HTMLTextAreaElement | null>
  onRun?: () => void
  /** Python blocks open with a colon. Other languages only keep the current indentation. */
  python?: boolean
}) {
  const local = useRef<HTMLTextAreaElement>(null)
  const area = inputRef ?? local
  const numbers = useRef<HTMLDivElement>(null)
  const pendingSelection = useRef<[number, number] | undefined>(undefined)
  // Escape lets a keyboard user leave the editor with the next Tab press.
  const releaseTab = useRef(false)
  const [activeLine, setActiveLine] = useState<number>()
  const hintId = useId()
  const lineCount = value.split('\n').length

  useLayoutEffect(() => {
    const selection = pendingSelection.current
    if (!selection || !area.current) return
    pendingSelection.current = undefined
    area.current.setSelectionRange(selection[0], selection[1])
  }, [area, value])

  useEffect(() => {
    const input = area.current
    if (!input || !numbers.current) return
    numbers.current.style.transform = `translateY(${-input.scrollTop}px)`
  }, [area, lineCount])

  function apply(edit: CodeEdit) {
    const input = area.current
    if (!input || field.disabled || field.readOnly || edit.value === value
      || (input.maxLength >= 0 && edit.value.length > input.maxLength && edit.value.length > value.length)) return
    // Going through the browser's own editing command keeps native undo history intact.
    const from = commonPrefix(value, edit.value)
    const tail = commonSuffix(value, edit.value, from)
    input.setSelectionRange(from, value.length - tail)
    const inserted = edit.value.slice(from, edit.value.length - tail)
    const done = typeof document.execCommand === 'function'
      && (inserted ? document.execCommand('insertText', false, inserted) : document.execCommand('delete'))
    if (done && input.value === edit.value) {
      input.setSelectionRange(edit.selectionStart, edit.selectionEnd)
      return
    }
    pendingSelection.current = [edit.selectionStart, edit.selectionEnd]
    onChange(edit.value)
  }

  function shiftIndent(outdent: boolean) {
    const input = area.current
    if (!input) return
    const { selectionStart, selectionEnd } = input
    input.focus({ preventScroll: true })
    apply((outdent ? outdentSelection : indentSelection)(value, selectionStart, selectionEnd))
  }

  function trackLine() {
    const input = area.current
    if (!input || document.activeElement !== input) return setActiveLine(undefined)
    setActiveLine(input.value.slice(0, input.selectionStart).split('\n').length)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    field.onKeyDown?.(event)
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    const input = event.currentTarget
    const { selectionStart: start, selectionEnd: end } = input
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      if (!onRun) return
      event.preventDefault()
      onRun()
      return
    }
    if (event.altKey || event.metaKey || event.ctrlKey) return
    if (event.key === 'Escape') {
      releaseTab.current = true
      return
    }
    if (event.key === 'Tab') {
      if (releaseTab.current) {
        releaseTab.current = false
        return
      }
      event.preventDefault()
      shiftIndent(event.shiftKey)
      return
    }
    releaseTab.current = false
    if (event.key === 'Enter' && !event.shiftKey) {
      const edit = newlineWithIndent(value, start, end, python)
      // A plain newline needs no help. Leave it to the browser.
      if (edit.selectionStart === start + 1) return
      event.preventDefault()
      apply(edit)
    } else if (event.key === 'Backspace') {
      const edit = backspaceIndent(value, start, end)
      if (!edit) return
      event.preventDefault()
      apply(edit)
    }
  }

  const shortcuts = tr(locale, 'Tab 缩进 · Shift+Tab 回退', 'Tab indents · Shift+Tab outdents')
    + (onRun ? tr(locale, ' · Ctrl/⌘+Enter 运行', ' · Ctrl/⌘+Enter runs') : '')
  const leaving = tr(locale, '按 Esc 再按 Tab，可以离开编辑区。', 'Press Esc, then Tab, to leave the editor.')

  return <div className="code-field" data-disabled={field.disabled || undefined}>
    {!field.readOnly && <div className="code-field__touch-tools" role="group" aria-label={tr(locale, '代码缩进', 'Code indentation')}>
      <button type="button" className="subtle-button" disabled={field.disabled}
        onPointerDown={event => event.preventDefault()} onClick={() => shiftIndent(false)}>{tr(locale, '增加缩进', 'Indent')}</button>
      <button type="button" className="subtle-button" disabled={field.disabled}
        onPointerDown={event => event.preventDefault()} onClick={() => shiftIndent(true)}>{tr(locale, '减少缩进', 'Outdent')}</button>
    </div>}
    <div className="code-field__frame">
      <div className="code-field__gutter" aria-hidden="true">
        <div ref={numbers} className="code-field__numbers">
          {/* Numbers come from a CSS counter so they never read as page text. */}
          {Array.from({ length: lineCount }, (_, index) =>
            <span key={index} data-active={activeLine === index + 1 || undefined} />)}
        </div>
      </div>
      <textarea {...field} ref={area} className={className + ' code-field__input'} wrap="off" value={value}
        aria-describedby={[field['aria-describedby'], hintId].filter(Boolean).join(' ')}
        spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off"
        onChange={event => onChange(event.target.value)} onKeyDown={onKeyDown}
        onScroll={event => {
          field.onScroll?.(event)
          if (numbers.current) numbers.current.style.transform = `translateY(${-event.currentTarget.scrollTop}px)`
        }}
        onSelect={event => { field.onSelect?.(event); trackLine() }}
        onFocus={event => { field.onFocus?.(event); trackLine() }}
        onBlur={event => { field.onBlur?.(event); setActiveLine(undefined) }} />
    </div>
    <p className="code-field__hint" id={hintId}>{shortcuts}<span className="sr-only"> {leaving}</span></p>
  </div>
}

function commonPrefix(a: string, b: string) {
  const limit = Math.min(a.length, b.length)
  let index = 0
  while (index < limit && a[index] === b[index]) index++
  return index
}

function commonSuffix(a: string, b: string, prefix: number) {
  const limit = Math.min(a.length, b.length) - prefix
  let index = 0
  while (index < limit && a[a.length - 1 - index] === b[b.length - 1 - index]) index++
  return index
}
