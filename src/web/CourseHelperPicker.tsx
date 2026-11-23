import type { PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { tr } from './text'

export function setHelperImport(code: string, name: string, source: 'algorithms' | 'my_algorithms') {
  const courseImport = 'from algorithms import ' + name
  const personalImport = 'from my_algorithms import ' + name
  const body = code.split('\n').filter(line => line.trimEnd() !== courseImport && line.trimEnd() !== personalImport)
  return [source === 'algorithms' ? courseImport : personalImport, ...body].join('\n')
}

export function CourseHelperPicker({ names = [], personal, course, code, onChange, disabled, locale }: {
  names?: string[]; personal: PersonalAlgorithms; course: PersonalAlgorithms;
  code: string; onChange: (source: string) => void; disabled?: boolean; locale: Locale;
}) {
  if (!names.length) return null
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const sourceLines = code.split('\n').map(line => line.trimEnd())
  return <section className="course-helpers" aria-label={t('复用已学函数', 'Reuse earlier functions')}>
    <h3>{t('复用已学函数', 'Reuse earlier functions')}</h3>
    {names.map(name => {
      const saved = Object.hasOwn(personal, name) && typeof personal[name] === 'string'
      const supplied = Object.hasOwn(course, name) && typeof course[name] === 'string'
      return <div className="course-helper" key={name}>
        <code>{name}()</code>
        {saved && <button type="button" className="subtle-button" disabled={disabled}
          aria-pressed={sourceLines.includes('from my_algorithms import ' + name)}
          onClick={() => onChange(setHelperImport(code, name, 'my_algorithms'))}>
          {t('用我的函数', 'Use my function')} · {name}
        </button>}
        {supplied && <button type="button" className="subtle-button" disabled={disabled}
          aria-pressed={sourceLines.includes('from algorithms import ' + name)}
          onClick={() => onChange(setHelperImport(code, name, 'algorithms'))}>
          {t('用课程函数', 'Use course function')} · {name}
        </button>}
        {!saved && !supplied && <small>{t('这个函数暂未准备好。', 'This function is not available yet.')}</small>}
      </div>
    })}
  </section>
}
