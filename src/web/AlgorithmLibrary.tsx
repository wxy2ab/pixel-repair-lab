import type { PersonalAlgorithms } from '../shared/advanced'
import type { Locale } from '../shared/types'
import { tr } from './text'

const storageKey = 'pixel-repair-lab:algorithms'
const validName = /^[a-zA-Z][a-zA-Z0-9_]{0,47}$/

export function readAlgorithms(): PersonalAlgorithms {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {}
    return Object.fromEntries(Object.entries(stored).filter(([name, source]) =>
      validName.test(name) && typeof source === 'string' && source.length > 0 && source.length <= 12000))
  } catch {
    return {}
  }
}

export function persistAlgorithms(algorithms: PersonalAlgorithms): boolean {
  try {
    localStorage.setItem(storageKey, JSON.stringify(algorithms))
    return true
  } catch {
    return false
  }
}

export function AlgorithmLibrary({ locale, algorithms, remove, goToPractice, storageFailed }: {
  locale: Locale; algorithms: PersonalAlgorithms; remove: (name: string) => void; goToPractice?: () => void; storageFailed: boolean;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const names = Object.keys(algorithms).sort()
  return <>
    <div className="mission-heading"><div><h1>{t('我的算法', 'My algorithms')}</h1>
      <p>{t('在练习中通过验证的函数，可以保存到这里供后续任务调用。', 'Save functions that pass the exercises, then call them in later missions.')}</p>
    </div></div>
    <div className="lesson-layout">
      <section className="panel teaching-panel">
        <h2>{t('已保存的函数', 'Saved functions')}</h2>
        {storageFailed && <p role="status" className="error-message">{t('浏览器暂时无法保存，当前窗口里仍可使用。', 'The browser could not save these functions. They are available in this window.')}</p>}
        {!names.length && <p>{t('通过寻路练习后，点击保存来添加你的第一个函数。', 'Pass the pathfinding exercise, then save your first function.')}</p>}
        {names.map(name => <details className="algorithm-entry" key={name}>
          <summary><code>{name}</code></summary>
          <pre className="sample-code">{algorithms[name]}</pre>
          <button type="button" className="subtle-button" onClick={() => remove(name)}>{t('删除', 'Delete')} {name}</button>
        </details>)}
        {!names.length && goToPractice && <button type="button" className="primary-button" onClick={goToPractice}>{t('打开算法练习', 'Open algorithm exercise')}</button>}
      </section>
      <section className="panel teaching-panel">
        <h2>{t('在实践中调用', 'Use in a challenge')}</h2>
        <p>{t('使用课程版本', 'Import the course version')}</p>
        <pre className="sample-code">from algorithms import shortest_step</pre>
        {names.length > 0 && <>
          <p>{t('使用自己保存的版本', 'Import your saved version')}</p>
          {names.map(name => <pre className="sample-code" key={name}>{'from my_algorithms import ' + name}</pre>)}
        </>}
      </section>
    </div>
  </>
}
