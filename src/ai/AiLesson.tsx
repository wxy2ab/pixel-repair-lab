import { useClassroom, CommandDesk } from '../web/Classroom'
import { ExperimentWindow } from '../web/ExperimentWindow'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { challengeZoneId } from '../shared/coursePrerequisites'
import type { AiLevel, AiTurnInput, Candidate, Locale } from '../shared/types'
import { ChallengeFailureReview, type ChallengeReviewData } from '../web/ChallengeFailureReview'
import type { GoalReplayEvidence } from '../web/challengeGoalReview'
import type { ChallengeRunHandlers, ChallengeScore } from '../web/challengeScore'
import { checkAudit, gradeCandidate, maxPromptLength, parseCandidate, runPracticeTurn, simulateCandidate, type ItemCheck } from './core'
import { BriefBody } from '../web/ChallengeBrief'
import { HintSteps } from '../web/HintSteps'
import './ai.css'

const copy = {
  zh: {
    mission: '机器布置的任务', inventory: '可用物品', hints: '打开小提示',
    prompt: '给 AI 写提示词', placeholder: '你想让 AI 打包哪些物品？',
    send: '发送给 AI', resend: '发送修正', pending: '正在生成清单…',
    reset: '重新开始', example: '填入示例', correction: '填入修正示例',
    cards: '拼提示词', draft: '起始清单', submitted: '本轮发给 AI 的提示词',
    mode: 'AI 模式', offline: '练习模拟', online: '在线 AI', connect: '配置在线 AI',
    preview: '试玩时可使用练习模拟。',
    setup: '在服务器的 .env 中填写下面三项，然后重新启动游戏。',
    configured: '服务端已配置连接，可以选择在线 AI。',
    onlineNote: '在线模式会把这次的提示词和清单发送给已配置的 AI 服务。',
    goalMixed: '这个小目标需要用练习模拟和在线 AI 各完成至少一轮。',
    goalOnlineSetup: '要继续这个小目标，请先查看在线 AI 配置。',
    failure: '在线 AI 暂时没有返回可用的清单。提示词还在，可以重试或继续用练习模拟。',
    tryOffline: '用练习模拟继续',
    attempt: (number: number) => `第 ${number} 次清单`,
    expected: '任务要求', actual: 'AI 数量', item: '物品', result: '核对',
    match: '正确', mismatch: '待修改',
    fault: '这一轮模拟了一次 AI 出错。对照任务要求，告诉 AI 哪个数量需要修改。',
    revise: '对照任务要求，修改提示词再试一次。',
    correct: '清单符合任务要求。确认并完成任务。',
    confirm: '确认清单', accepted: '任务完成', history: '查看先前清单',
    audit: '提交核对', auditColumn: '标记差异',
    auditHint: '逐项比较任务要求和 AI 数量，勾出数量有差异的物品。全部相同就直接提交核对。',
    challengeAuditHint: '按工单核对 AI 的数量，勾出数量有差异的物品。清单正确时直接提交核对。',
    auditRetry: '还有行没有核对准确。别漏掉数量为 0 的项目，再对照一次。',
    auditHold: '先提交本轮核对，再发送修正。',
    projectAccepted: '结课项目已完成', rounds: (number: number) => `已核对 ${number} 轮清单`,
  },
  en: {
    mission: 'Machine assignment', inventory: 'Supplies on hand', hints: 'Show hints',
    prompt: 'Write a prompt for AI', placeholder: 'What should the AI pack?',
    send: 'Send to AI', resend: 'Send correction', pending: 'Preparing the list…',
    reset: 'Start over', example: 'Use an example', correction: 'Use an example correction',
    cards: 'Build a prompt', draft: 'Starting list', submitted: 'Prompt sent in this round',
    mode: 'AI mode', offline: 'Practice simulator', online: 'Online AI', connect: 'Configure online AI',
    preview: 'The practice simulator is available in preview.',
    setup: 'Set these three values in the server’s .env file and restart the game.',
    configured: 'The server has connection settings. You can select Online AI.',
    onlineNote: 'Online mode sends this prompt and packing list to the configured AI service.',
    goalMixed: 'For this goal, complete at least one round each with the simulator and Online AI.',
    goalOnlineSetup: 'Check the Online AI setup to continue this goal.',
    failure: 'Online AI could not return a usable list. Your prompt is still here. Try again or use the simulator.',
    tryOffline: 'Continue with the simulator',
    attempt: (number: number) => `Packing list ${number}`,
    expected: 'Required', actual: 'AI count', item: 'Item', result: 'Check',
    match: 'Matches', mismatch: 'Needs a change',
    fault: 'This round simulated an AI mistake. Compare the counts and tell the AI what to change.',
    revise: 'Compare the counts, revise your prompt and try again.',
    correct: 'The list matches the assignment. Confirm it to finish.',
    confirm: 'Confirm list', accepted: 'Assignment complete', history: 'See previous lists',
    audit: 'Submit review', auditColumn: 'Flag differences',
    auditHint: 'Compare each required count with the AI’s count. Flag every difference. If everything matches, submit the review with no flags.',
    challengeAuditHint: 'Check the AI’s counts against the order. Flag every difference. When the list matches, submit your review with no flags.',
    auditRetry: 'Some flags need another look. Check every row, including items with a count of zero.',
    auditHold: 'Submit your review before sending a correction.',
    projectAccepted: 'Final project complete', rounds: (number: number) => `${number} ${number === 1 ? 'list' : 'lists'} reviewed`,
  },
} satisfies Record<Locale, Record<string, string | ((number: number) => string)>>

type Mode = 'offline' | 'online'
type Attempt = { candidate: Candidate; prompt: string; mode: Mode; injected: boolean }
type AiLessonProps = { level: AiLevel; locale: Locale; preview: boolean; onWin: () => void; onMistake?: () => void; challenge?: ChallengeRunHandlers;
  replayMode?: Extract<ChallengeScore, { kind: 'ai' }>['mode'] }

function CandidateTable({ level, locale, candidate, showGrades = true }: {
  level: AiLevel; locale: Locale; candidate: Candidate; showGrades?: boolean
}) {
  const t = copy[locale]
  const checks = gradeCandidate(level, candidate)
  const showRequiredCounts = level.unit?.id !== challengeZoneId || level.workflow?.review !== 'manual'
  return (
    <table className="ai-table">
      <thead><tr><th scope="col">{t.item}</th>{showRequiredCounts && <th scope="col">{t.expected}</th>}
        <th scope="col">{t.actual}</th>{showGrades && <th scope="col">{t.result}</th>}</tr></thead>
      <tbody>
        {checks.map(({ id, expected, actual }, index) => {
          const correct = expected === actual
          return (
            <tr key={id}>
              <th scope="row">{level.inventory[index].label[locale]}</th>
              {showRequiredCounts && <td>{expected}</td>}
              <td>{actual}</td>
              {showGrades && <td className={correct ? 'ai-match' : 'ai-mismatch'}>{correct ? '✓' : '↻'} {correct ? t.match : t.mismatch}</td>}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function exampleRevision(level: AiLevel, locale: Locale, candidate: Candidate) {
  return gradeCandidate(level, candidate).flatMap(({ expected, actual }, index) => {
    if (expected === actual) return []
    const item = level.inventory[index].label[locale]
    if (locale === 'zh') return [expected ? `把${item}改为${expected}。` : `去掉${item}。`]
    return [expected ? `Set ${item} to ${expected}.` : `Remove ${item}.`]
  }).join('\n')
}

async function onlineCandidate(level: AiLevel, input: AiTurnInput, signal: AbortSignal): Promise<Candidate> {
  const response = await fetch('/api/ai/turn', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
    signal,
  })
  if (!response.ok) throw new Error('AI turn failed')
  const result: unknown = await response.json()
  const candidate = typeof result === 'object' && result !== null && 'candidate' in result
    ? parseCandidate(level, result.candidate)
    : null
  if (!candidate) throw new Error('Invalid packing list')
  return candidate
}

function packingReview(round: number, differences: ItemCheck[], marks?: string[]): ChallengeReviewData {
  const gaps: ChallengeReviewData['gaps'] = []
  if (marks) {
    const marked = new Set(marks)
    const missed = differences.filter(({ id }) => !marked.has(id)).length
    const extra = marked.size - (differences.length - missed)
    if (missed) gaps.push({ zh: `还有 ${missed} 行差异没有标记。`,
      en: `${missed} ${missed === 1 ? 'difference still needs' : 'differences still need'} a flag.` })
    if (extra) gaps.push({ zh: `有 ${extra} 行数量正确，却被标记了。`,
      en: `${extra} ${extra === 1 ? 'matching row was' : 'matching rows were'} flagged.` })
    return {
      location: { zh: `第 ${round} 轮 · 清单核对`, en: `Round ${round} · Packing-list audit` },
      gaps,
      topics: [{ unit: 'ai-review', topic: 'review' }],
    }
  }

  const shortages = differences.filter(({ actual, expected }) => actual < expected).length
  const surpluses = differences.filter(({ actual, expected }) => expected > 0 && actual > expected).length
  const excluded = differences.filter(({ expected }) => expected === 0).length
  const items = (count: number) => `${count} ${count === 1 ? 'item type' : 'item types'}`
  if (shortages) gaps.push({ zh: `有 ${shortages} 种物品还没装够。`, en: `Too few were packed for ${items(shortages)}.` })
  if (surpluses) gaps.push({ zh: `有 ${surpluses} 种物品装多了。`, en: `Too many were packed for ${items(surpluses)}.` })
  if (excluded) gaps.push({ zh: `有 ${excluded} 种应留在货架上的物品还在箱里。`, en: `The box still contains ${items(excluded)} that should stay on the shelf.` })
  return {
    location: { zh: `第 ${round} 轮 · 装箱清单`, en: `Round ${round} · Packing list` },
    gaps,
    topics: [{ unit: 'ai-review', topic: 'multi-turn' }, { unit: 'ai', topic: 'constraints' }],
  }
}

export default function AiLesson(props: AiLessonProps) {
  const { level, preview } = props
  return <AiLessonSession key={`${level.id}:${preview}`} {...props} />
}

function AiLessonSession({ level, locale, preview, onWin, onMistake, challenge, replayMode }: AiLessonProps) {
  const t = copy[locale]
  const classroom = useClassroom()
  const promptId = useId()
  const resultId = useId()
  const [mode, setMode] = useState<Mode>(replayMode === 'online' ? 'online' : 'offline')
  const [available, setAvailable] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [audited, setAudited] = useState(false)
  const [auditError, setAuditError] = useState(false)
  const currentRequest = useRef<AbortController | null>(null)
  const promptField = useRef<HTMLTextAreaElement>(null)
  const auditField = useRef<HTMLFieldSetElement>(null)
  const firstAuditIssue = useRef<GoalReplayEvidence['issue']>(undefined)
  const latest = attempts.at(-1)
  const replayScore = latest ? { kind: 'ai', rounds: attempts.length,
    mode: attempts.some(attempt => attempt.mode !== latest.mode) ? 'mixed' : latest.mode } as const : undefined
  const standaloneChallenge = level.unit?.id === challengeZoneId
  const needsReview = Boolean(latest && level.workflow?.review === 'manual' && !audited)
  const promptReady = Boolean(prompt.trim()) && (mode === 'online' || prompt.trim() !== latest?.prompt)
  const differences = latest ? gradeCandidate(level, latest.candidate).filter(({ actual, expected }) => actual !== expected) : []
  const latestPassed = Boolean(latest && !differences.length)
  const review = standaloneChallenge && latest && !pending && (needsReview ? auditError : differences.length > 0)
    ? packingReview(attempts.length, differences, needsReview ? selected : undefined) : undefined
  const examples = level.examplePrompts[locale]
  const offlineTurns = attempts.filter(attempt => attempt.mode === 'offline').length
  const exampleIndex = level.workflow ? mode === 'offline' ? offlineTurns : 0 : attempts.length
  const suggestion = !standaloneChallenge && latest && level.workflow && (mode === 'online' || exampleIndex >= examples.length)
    ? exampleRevision(level, locale, latest.candidate) : ''
  const example = suggestion && suggestion.length <= maxPromptLength ? suggestion : examples[Math.min(exampleIndex, examples.length - 1)]
  const cards = level.workflow?.cards ?? []
  const draft = level.workflow?.draft

  useEffect(() => {
    if (preview) return
    const controller = new AbortController()
    fetch('/api/ai/status', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return
        const status: unknown = await response.json()
        if (!controller.signal.aborted && typeof status === 'object' && status !== null && 'available' in status) {
          setAvailable(status.available === true)
        }
      })
      .catch(() => { /* The simulator remains available when status cannot be checked. */ })
    return () => {
      controller.abort()
      currentRequest.current?.abort()
    }
  }, [preview])

  function chooseMode(value: Mode) {
    setMode(value)
    setFailed(false)
  }

  async function run(selectedMode: Mode) {
    if (currentRequest.current || accepted || !promptReady || needsReview || (selectedMode === 'online' && !available)) return

    challenge?.onStart()
    const request = new AbortController()
    currentRequest.current = request
    setPending(true)
    setFailed(false)
    const submittedPrompt = prompt.trim()
    try {
      const previousCandidate = latest?.candidate
      const practice = selectedMode === 'offline'
        ? runPracticeTurn(level, submittedPrompt, previousCandidate, level.workflow ? offlineTurns : attempts.length)
        : undefined
      const candidate = practice?.candidate ?? await onlineCandidate(level, { levelId: level.id, locale, prompt: submittedPrompt, previousCandidate },
        AbortSignal.any([request.signal, AbortSignal.timeout(20000)]))

      if (request.signal.aborted) return
      setSelected([])
      setAudited(false)
      setAuditError(false)
      setAttempts((all) => [...all, { candidate, prompt: submittedPrompt, mode: selectedMode, injected: Boolean(practice?.fault) }])
      if (onMistake && practice && level.workflow?.review !== 'manual') {
        const intended = practice.fault ? simulateCandidate(level, submittedPrompt, previousCandidate ?? draft) : candidate
        if (!checkAudit(level, intended, [])) onMistake()
      }
    } catch {
      if (!request.signal.aborted) setFailed(true)
    } finally {
      if (currentRequest.current === request) {
        currentRequest.current = null
        if (!request.signal.aborted) setPending(false)
      }
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(mode)
  }

  function reset() {
    challenge?.onStart()
    setPrompt('')
    setAttempts([])
    setFailed(false)
    setAccepted(false)
    setSelected([])
    setAudited(false)
    setAuditError(false)
    firstAuditIssue.current = undefined
    window.requestAnimationFrame(() => promptField.current?.focus())
  }

  function restart() {
    if (challenge && !accepted && replayScore) {
      const currentIssue = review ?? (differences.length ? packingReview(attempts.length, differences) : undefined)
      const issue = currentIssue ? { location: currentIssue.location, gaps: currentIssue.gaps } : {
        location: { zh: `第 ${attempts.length} 轮 · 清单核对`, en: `Round ${attempts.length} · Packing-list audit` },
        gaps: [{ zh: '这次重玩停在确认清单之前。', en: 'This replay stopped before the packing list was confirmed.' }],
      }
      challenge.onFailure(replayScore, { issue })
    }
    reset()
  }

  function confirm() {
    if (accepted || pending || needsReview || !latest || !latestPassed) return
    setAccepted(true)
    onWin()
    if (challenge && replayScore) {
      let issue = firstAuditIssue.current
      if (!issue) {
        for (const [index, attempt] of attempts.entries()) {
          const previousDifferences = gradeCandidate(level, attempt.candidate).filter(({ actual, expected }) => actual !== expected)
          if (previousDifferences.length) {
            const { location, gaps } = packingReview(index + 1, previousDifferences)
            issue = { location, gaps }
            break
          }
        }
      }
      challenge.onWin(replayScore, reset, issue ? { issue } : undefined)
    }
  }

  function submitAudit() {
    if (!latest || !needsReview) return
    const correct = checkAudit(level, latest.candidate, selected)
    setAuditError(!correct)
    if (correct) setAudited(true)
    else {
      if (challenge && !firstAuditIssue.current) {
        const { location, gaps } = packingReview(attempts.length, differences, selected)
        firstAuditIssue.current = { location, gaps }
      }
      onMistake?.()
    }
  }

  function retry() {
    if (needsReview) auditField.current?.querySelector<HTMLInputElement>('[data-ai-audit]')?.focus()
    else promptField.current?.focus()
  }

  const mission = <aside className="ai-mission">
    <h2>{t.mission}</h2>
    <BriefBody text={level.brief[locale]} className="ai-brief" />
    <p>{level.concept[locale]}</p>
    <h3>{t.inventory}</h3>
    <ul className="ai-inventory">
      {level.inventory.map(({ id, label }) => <li key={id}>{label[locale]}</li>)}
    </ul>
    {draft && <><h3>{t.draft}</h3><ul className="ai-inventory" data-testid="ai-draft">
      {draft.items.map(({ id, quantity }) => <li key={id}>{level.inventory.find(item => item.id === id)?.label[locale]} ×{quantity}</li>)}
    </ul></>}
    {level.hints.length > 0 && <details className="ai-details">
      <summary>{t.hints}</summary>
      <HintSteps hints={level.hints} locale={locale} />
    </details>}
  </aside>
  const composer = <>
    <form className="ai-form" onSubmit={submit}>
      <div className="ai-form-heading">
        <label className="ai-form-title" htmlFor={promptId}>{t.prompt}</label>
        <div className="ai-mode" role="group" aria-label={t.mode}>
          <button type="button" aria-pressed={mode === 'offline'} disabled={pending} onClick={() => chooseMode('offline')}>{t.offline}</button>
          <button type="button" aria-pressed={mode === 'online'} disabled={!available || pending} onClick={() => chooseMode('online')}>{t.online}</button>
        </div>
      </div>
      <textarea ref={promptField} id={promptId} placeholder={t.placeholder} value={prompt}
        maxLength={maxPromptLength} disabled={pending || accepted || needsReview} onChange={(event) => setPrompt(event.currentTarget.value)} />
      {cards.length > 0 && <div role="group" className="ai-prompt-cards" aria-label={t.cards}>
        <span>{t.cards}</span>
        {cards.map((entry, index) => {
          const phrase = entry[locale]
          const next = [prompt.trimEnd(), phrase].filter(Boolean).join('\n')
          return <button type="button" key={index} data-ai-card={index} onClick={() => setPrompt(next)}
            disabled={pending || accepted || needsReview || next.length > maxPromptLength || prompt.split('\n').includes(phrase)}>{phrase}</button>
        })}
      </div>}
      {needsReview && <p className="ai-note">{t.auditHold}</p>}
      {replayMode === 'mixed' && <p className="ai-note">{t.goalMixed}</p>}
      {replayMode && replayMode !== 'offline' && !available && <p className="ai-note">{t.goalOnlineSetup}</p>}
      {mode === 'online' && available && <p className="ai-note">{t.onlineNote}</p>}
      <div className="ai-actions">
        <button type="submit" className="ai-primary" disabled={!promptReady || pending || accepted || needsReview || (mode === 'online' && !available)}>
          {pending ? t.pending : latest ? t.resend : t.send}
        </button>
        {!standaloneChallenge && example && <button type="button" disabled={pending || accepted || needsReview} onClick={() => {
          setPrompt(example)
          if (!level.workflow) promptField.current?.focus()
        }}>{latest ? t.correction : t.example}</button>}
        {(prompt || latest) && <button type="button" disabled={pending} onClick={restart}>{t.reset}</button>}
      </div>
      {needsReview && <fieldset className="ai-audit" ref={auditField} disabled={pending}>
        <legend>{t.auditColumn}</legend>
        <p className="ai-review-hint">{standaloneChallenge ? t.challengeAuditHint : t.auditHint}</p>
        <div className="ai-audit-items">
          {level.inventory.map(({ id, label }) => <label key={id}>
            <input type="checkbox" className="ai-flag" data-ai-audit={id} aria-label={t.auditColumn + ' · ' + label[locale]}
              checked={selected.includes(id)} onChange={() => {
                setSelected(previous => previous.includes(id) ? previous.filter(item => item !== id) : [...previous, id])
                setAuditError(false)
              }} />{label[locale]}
          </label>)}
        </div>
        <div className="ai-audit-actions">
          <button className="ai-primary" type="button" onClick={submitAudit}>{t.audit}</button>
          {auditError && <p role="status" className="ai-mismatch">{t.auditRetry}</p>}
        </div>
      </fieldset>}
      {latest && !needsReview && latestPassed && !accepted && <button className="ai-primary" type="button" disabled={pending} onClick={confirm}>{t.confirm}</button>}
      {review && <ChallengeFailureReview review={review} onRetry={retry} />}
      <details className="ai-details">
        <summary>{t.connect}</summary>
        {preview ? <p>{t.preview}</p> : available ? <p>{t.configured}</p> : (
          <>
            <p>{t.setup}</p>
            <ul className="ai-config-keys">
              <li><code>AI_API_BASE_URL</code></li>
              <li><code>AI_API_MODEL</code></li>
              <li><code>AI_API_KEY</code></li>
            </ul>
          </>
        )}
      </details>
    </form>

    {failed && <div className="ai-error" role="alert">
      <p>{t.failure}</p>
      <button type="button" onClick={() => {
        chooseMode('offline')
        void run('offline')
      }}>{t.tryOffline}</button>
    </div>}
  </>

  return (
    <section className="ai-lesson classroom-split" aria-label={level.title[locale]}>
      <ExperimentWindow locale={locale} title={locale === 'zh' ? '维修站 AI 对话' : 'Station AI chat'}>
        <div className="ai-workspace">
          {!classroom && mission}
          {classroom && latest && <div className="ai-sent-message">
            <strong>{locale === 'zh' ? '你发出的任务' : 'Your message'}</strong>
            <p>{latest.prompt}</p>
          </div>}
          {latest && <section className="ai-result" aria-labelledby={resultId}>
            <div className="ai-result-heading">
              <h3 id={resultId}>{t.attempt(attempts.length)}</h3>
              <span>{classroom && (locale === 'zh' ? 'AI 回复 · ' : 'AI reply · ')}{t[latest.mode]}</span>
            </div>
            <CandidateTable level={level} locale={locale} candidate={latest.candidate} showGrades={!needsReview} />
            {!needsReview && <>
              <p aria-live="polite" data-testid="ai-feedback" className={latestPassed ? 'ai-match' : 'ai-mismatch'}>
                {accepted ? level.courseFinal ? t.projectAccepted : t.accepted : latestPassed ? t.correct : latest.injected ? t.fault : t.revise}
              </p>
              {level.courseFinal && accepted && <p className="ai-note">{t.rounds(attempts.length)}</p>}
            </>}
            {!classroom && level.workflow && <details className="ai-details">
              <summary>{t.submitted}</summary>
              <p className="ai-submitted-prompt">{latest.prompt}</p>
            </details>}
            {attempts.length > 1 && <details className="ai-details">
              <summary>{t.history}</summary>
              <ol className="ai-history">
                {attempts.slice(0, -1).map((attempt, index) => <li key={index}>
                  <h4>{t.attempt(index + 1)}</h4>
                  <p className="ai-submitted-prompt">{attempt.prompt}</p>
                  <CandidateTable level={level} locale={locale} candidate={attempt.candidate} />
                </li>)}
              </ol>
            </details>}
          </section>}
          {classroom && composer}
        </div>
      </ExperimentWindow>
      <CommandDesk locale={locale}>
        <div className="ai-workspace">
          {classroom ? mission : composer}
        </div>
      </CommandDesk>
    </section>
  )
}
