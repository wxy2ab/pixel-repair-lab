import type { Locale } from '../shared/types'
import { tr } from './text'

export function SaveMovesToCode({ locale, disabled, draft, getCode, onSave }: {
  locale: Locale; disabled?: boolean; draft?: string; getCode: () => string; onSave: (source: string) => void
}) {
  function save() {
    const source = getCode()
    if (draft?.trim() && draft !== source && !window.confirm(tr(locale,
      '用这些步骤替换当前 Python 草稿？', 'Replace the current Python draft with these moves?'))) return
    onSave(source)
  }

  return <button type="button" className="subtle-button" disabled={disabled} onClick={save}>
    {tr(locale, '保存步骤到代码', 'Save moves to code')}
  </button>
}
