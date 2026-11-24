import { useId, useRef, useState } from 'react'
import { runStructureLesson } from '../engine/programStructures'
import { structureKinds, structureLabels, type ProgramWalkthrough, type StructureKind } from '../shared/programWalkthrough'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { StructureRack } from './BatteryMemory'
import { StructureTrace } from './StructureTrace'
import { TaskProgress } from './TaskProgress'
import './charge-prediction.css'
import './for-prediction.css'
import './structures-prediction.css'

export function StructuresPrediction({ execution, locale, onComplete }: {
  execution: ProgramWalkthrough; locale: Locale; onComplete: () => void;
}) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const title = useId()
  const firstChoice = useRef<HTMLButtonElement>(null)
  const completed = useRef(false)
  const [active, setActive] = useState(0)
  const [structure, setStructure] = useState<StructureKind>()
  const [battery, setBattery] = useState<string>()
  const [verification, setVerification] = useState<ReturnType<typeof runStructureLesson> | null>()
  const [passed, setPassed] = useState<Set<number>>(() => new Set())
  const practice = execution.structures?.practice
  const task = practice?.tasks[active]
  if (!practice || !task) return null

  const rightStructure = structure === task.kind
  const rightBattery = verification ? verification.selected.name === battery : undefined
  const matched = rightBattery === undefined ? undefined : rightStructure && rightBattery
  const nextTask = practice.tasks.findIndex((_, index) => !passed.has(index))
  const usedCode = verification?.steps.find(step => step.kind === 'select')?.code

  function clearPrediction() {
    setStructure(undefined)
    setBattery(undefined)
    setVerification(undefined)
  }

  function openTask(index: number) {
    if (index === active) return
    setActive(index)
    clearPrediction()
  }

  function verify() {
    if (!practice || !structure || !battery || verification) return
    const result = runStructureLesson(execution, structure, practice)
    setVerification(result ?? null)
    if (!result || !rightStructure || result.selected.name !== battery) return

    const solved = new Set(passed).add(active)
    setPassed(solved)
    if (solved.size === practice.tasks.length && !completed.current) {
      completed.current = true
      onComplete()
    }
  }

  return <section className="panel structures-prediction" data-testid="structures-prediction" data-match={matched} aria-labelledby={title}>
    <div className="panel-heading"><h2 id={title}>{t('换一批电池，先预测', 'Predict with a new batch')}</h2></div>
    <div className="charge-prediction-body">
      <fieldset>
        <legend>{t('取件单', 'Pick-up requests')}</legend>
        <div className="charge-prediction-choices">
          {practice.tasks.map(({ kind }, index) => {
            const done = passed.has(index)
            return <button type="button" className="subtle-button" key={kind} data-structure-task={index}
              data-passed={done || undefined} aria-pressed={active === index} onClick={() => openTask(index)}
              aria-label={done ? t(`取件单 ${index + 1} 已完成`, `Request ${index + 1} complete`) : undefined}>
              {t(`取件单 ${index + 1}`, `Request ${index + 1}`)}{done && <span aria-hidden="true"> ✓</span>}
            </button>
          })}
        </div>
      </fieldset>
      <p className="structures-task-prompt">{task.prompt[locale]}</p>
      <StructureTrace frames={verification?.steps} locale={locale}>{step => {
        const cells = step?.remaining ?? practice.batteries
        return <StructureRack kind={structure ?? 'list'} locale={locale} names={cells.map(item => item.name)}
          active={step?.selected?.name ?? battery} capacity={practice.batteries.length}
          values={Object.fromEntries(cells.map(item => [item.name, item.charge]))}
          onPick={verification ? undefined : setBattery} />
      }}</StructureTrace>
      <div className="for-prediction-fields">
        <fieldset className="for-prediction-field" data-match={verification ? rightStructure : undefined}>
          <legend>{t('用哪一种数据结构？', 'Which data structure fits?')}</legend>
          <div className="charge-prediction-choices">
            {structureKinds.map((kind, index) => <button type="button" className="subtle-button" key={kind}
              ref={index === 0 ? firstChoice : undefined} data-structure-option={kind} aria-pressed={structure === kind} onClick={() => {
                if (structure === kind) return
                setStructure(kind)
                setVerification(undefined)
              }}>{structureLabels[kind][locale]}</button>)}
          </div>
        </fieldset>
        <fieldset className="for-prediction-field" data-match={rightBattery}>
          <legend>{t('会取到哪块电池？', 'Which battery will you get?')}</legend>
          <p className="structures-arrival">{t('这批电池按到达先后排列，位置从 0 开始。', 'The batteries are in arrival order. Positions start at 0.')}</p>
          <div className="charge-prediction-choices structures-prediction-batteries">
            {practice.batteries.map(({ name, charge }, index) => <button type="button" className="subtle-button" key={name}
              data-battery-option={name} data-position={index} aria-pressed={battery === name} onClick={() => {
                if (battery === name) return
                setBattery(name)
                setVerification(undefined)
              }}>
              <strong>{name}</strong>
              <small>{t(`位置 ${index} · ${charge} 格`, `Index ${index} · ${charge} units`)}</small>
            </button>)}
          </div>
        </fieldset>
      </div>
      <button type="button" className="primary-button charge-prediction-verify" onClick={verify}
        disabled={!structure || !battery || !!verification}>{t('运行验证', 'Run to check')}</button>
      {verification === null && <p role="alert" className="error-message">
        {t('程序这次没有取到电池。再运行一次试试。', 'The program did not pick a battery this time. Try running it again.')}
      </p>}
      {verification && <div className="charge-prediction-verification" data-match={matched}>
        <div role="status">
          <dl className="charge-prediction-comparison">
            <div><dt>{t('你猜的电池', 'Your prediction')}</dt><dd>{battery}</dd></div>
            <div><dt>{t('实际取到的电池', 'Battery picked')}</dt><dd data-testid="structures-actual-battery">{verification.selected.name}</dd></div>
          </dl>
          {usedCode && <p className="structures-run-code"><code>{usedCode}</code></p>}
          <p>{matched ? t(`第 ${active + 1} 张取件单完成！结构和电池都选对了。`, `Request ${active + 1} complete! You chose the right structure and battery.`)
            : !rightStructure ? t('这是你选的结构取到的电池。再读一遍取件单，看看它要求按什么规则取。',
              'That battery came from the structure you chose. Read the request again and look for its picking rule.')
              : t('结构选对了。对照取件规则和电池排列，再猜一次。', 'The structure fits. Check the picking rule and battery order, then try another prediction.')}</p>
        </div>
        {matched && <TaskProgress label={t('已完成取件单', 'Requests complete')} done={passed.size} total={practice.tasks.length} />}
        {!matched ? <button type="button" className="subtle-button" onClick={() => {
          clearPrediction()
          firstChoice.current?.focus()
        }}>{t('再猜一次', 'Predict again')}</button>
          : nextTask >= 0 && <button type="button" className="subtle-button" onClick={() => {
            openTask(nextTask)
            firstChoice.current?.focus()
          }}>{t('下一张取件单', 'Next request')}</button>}
      </div>}
    </div>
  </section>
}
