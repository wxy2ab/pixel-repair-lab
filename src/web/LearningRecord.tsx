import { useId, type KeyboardEvent } from 'react'
import type { Level, Locale } from '../shared/types'
import type { RecordTab, ReviewGroup, ReviewMaterial, ReviewRecord } from './learningRecordModel'
import { levelStage, stageLabel } from './lessonTools'
import { tr } from './text'
import './learning-record.css'

type OpenReview = (id: string, sourceId: string) => void

function ReviewTime({ at, locale }: { at?: number; locale: Locale }) {
  if (at === undefined) return null
  const instant = new Date(at)
  if (Number.isNaN(instant.getTime())) return null
  return <time dateTime={instant.toISOString()}>
    {new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(instant)}
  </time>
}

function mistakeCount(locale: Locale, count: number) {
  return tr(locale, `做错 ${count} 次`, `${count} ${count === 1 ? 'mistake' : 'mistakes'}`)
}

function reviewStatus(locale: Locale, pending: boolean) {
  return pending ? tr(locale, '待复习', 'To review') : tr(locale, '已订正', 'Corrected')
}

function MaterialButtons({ material, current, sourceId, locale, onReview }: {
  material: ReviewMaterial; current?: string; sourceId: string; locale: Locale; onReview: OpenReview;
}) {
  const { animation, demo } = material
  return <div className="study-actions">
    {animation && <button type="button" className="subtle-button" disabled={animation.id === current}
      onClick={() => onReview(animation.id, sourceId)}>{tr(locale, '看动画', 'Watch animation')}</button>}
    {demo && <button type="button" className="subtle-button" disabled={demo.id === current}
      onClick={() => onReview(demo.id, sourceId)}>{tr(locale, '看演示', 'View demo')}</button>}
  </div>
}

function ReviewMaterials({ materials, current, sourceId, locale, onReview }: {
  materials: ReviewMaterial[]; current?: string; sourceId: string; locale: Locale; onReview: OpenReview;
}) {
  if (materials.length === 0) return null
  if (materials.length === 1) return <MaterialButtons material={materials[0]} current={current} sourceId={sourceId} locale={locale} onReview={onReview} />
  return <details className="study-materials">
    <summary>{tr(locale, '相关动画和演示', 'Related animations and demos')}</summary>
    <ul>
      {materials.map(material => <li key={material.animation?.id ?? material.demo?.id ?? material.title.en}>
        <span>{material.title[locale]}</span>
        <MaterialButtons material={material} current={current} sourceId={sourceId} locale={locale} onReview={onReview} />
      </li>)}
    </ul>
  </details>
}

function MistakeTopic({ group, locale, onReview }: { group: ReviewGroup; locale: Locale; onReview: OpenReview }) {
  const title = useId()
  return <section className="panel study-topic" data-testid="mistake-topic" aria-labelledby={title}>
    <div className="study-topic-head">
      {group.unit && <p>{group.unit.title[locale]}</p>}
      <h2 id={title}>{group.title[locale]}</h2>
    </div>
    <ul className="study-list">
      {group.items.map(item => <li className="study-row" key={item.level.id} data-mistake-level={item.level.id}>
        <div className="study-row-head">
          <h3>{item.level.title[locale]}</h3>
          <div className="study-meta">
            <span className="study-state" data-pending={item.pending}>{reviewStatus(locale, item.pending)}</span>
            <span>{mistakeCount(locale, item.count)}</span>
            <ReviewTime at={item.lastAt} locale={locale} />
          </div>
        </div>
        <div className="study-actions">
          <ReviewMaterials materials={group.materials} sourceId={item.level.id} locale={locale} onReview={onReview} />
          <button type="button" className="primary-button" onClick={() => onReview(item.level.id, item.level.id)}>
            {tr(locale, '重做练习', 'Retry exercise')}
          </button>
        </div>
      </li>)}
    </ul>
  </section>
}

export function LearningRecord({ record, locale, tab, onTab, onReview }: {
  record: ReviewRecord; locale: Locale; tab: RecordTab; onTab: (tab: RecordTab) => void; onReview: OpenReview;
}) {
  const id = useId()
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const history = tab === 'history'
  const tabs: [RecordTab, string][] = [['history', t('学习记录', 'Study history')], ['mistakes', t('错题本', 'Mistake notebook')]]

  function switchTab(event: KeyboardEvent<HTMLDivElement>) {
    const next = event.key === 'Home' ? 'history' : event.key === 'End' ? 'mistakes'
      : event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? history ? 'mistakes' : 'history' : undefined
    if (!next) return
    event.preventDefault()
    onTab(next)
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-study-tab="${next}"]`)?.focus()
  }

  return <section className="study-record" aria-labelledby={id + '-title'}>
    <div className="mission-heading"><h1 id={id + '-title'}>{t('学习记录', 'Study history')}</h1></div>
    <div className="segmented study-tabs" role="tablist" aria-label={t('学习记录分类', 'Study records')} onKeyDown={switchTab}>
      {tabs.map(([key, label]) => <button type="button" role="tab" key={key} data-study-tab={key} id={id + key}
        aria-selected={tab === key} aria-controls={id + '-panel'} tabIndex={tab === key ? 0 : -1} onClick={() => onTab(key)}>{label}</button>)}
    </div>
    <div className="study-panels" role="tabpanel" id={id + '-panel'} aria-labelledby={id + tab} tabIndex={0}>
      {history ? record.activities.length === 0
        ? <p className="panel study-empty">{t('完成课程或提交练习后，这里会显示学习活动。', 'Your activity appears here after you complete a lesson or submit an exercise.')}</p>
        : <section className="panel study-topic" aria-labelledby={id + '-activity'}>
          <div className="study-topic-head"><h2 id={id + '-activity'}>{t('最近学习活动', 'Recent activity')}</h2></div>
          <ul className="study-list">
            {record.activities.map(activity => <li className="study-row" key={activity.level.id} data-study-level={activity.level.id}>
              <div className="study-row-head">
                <p className="study-caption">{[activity.level.unit?.title[locale], stageLabel(activity.level, locale)].filter(Boolean).join(' · ')}</p>
                <h3>{activity.level.title[locale]}</h3>
                <div className="study-meta">
                  <span className="study-state" data-pending={activity.result === 'needs-review'}>
                    {activity.result === 'completed' ? t('已完成', 'Complete') : reviewStatus(locale, activity.result === 'needs-review')}
                  </span>
                  {activity.mistakes > 0 && <span>{mistakeCount(locale, activity.mistakes)}</span>}
                  <ReviewTime at={activity.at} locale={locale} />
                </div>
              </div>
              <button type="button" className="subtle-button" onClick={() => onReview(activity.level.id, activity.level.id)}>
                {t('打开关卡', 'Open lesson')}
              </button>
            </li>)}
          </ul>
        </section>
        : record.groups.length === 0
          ? <p className="panel study-empty">{t('还没有错题。做错的练习会按知识点收录在这里。', 'No mistakes recorded yet. Missed exercises will appear here by topic.')}</p>
          : record.groups.map(group => <MistakeTopic key={group.id} group={group} locale={locale} onReview={onReview} />)}
    </div>
  </section>
}

export function ReviewSuggestions({ record, locale, onNotebook, onReview }: {
  record: ReviewRecord; locale: Locale; onNotebook: () => void; onReview: OpenReview;
}) {
  const title = useId()
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <section className="panel study-suggestions" data-testid="review-recommendations" aria-labelledby={title}>
    <div className="study-suggestions-head">
      <div>
        <h2 id={title}>{t('建议复习', 'Review suggestions')}</h2>
        {record.pendingCount > 0 && <p>{t(`${record.pendingCount} 道练习待复习`, `${record.pendingCount} ${record.pendingCount === 1 ? 'exercise' : 'exercises'} to review`)}</p>}
      </div>
      <button type="button" className="subtle-button" onClick={onNotebook}>{t('查看错题本', 'Open mistake notebook')}</button>
    </div>
    {record.recommendations.length === 0
      ? <p>{t('目前没有待复习的练习。', 'No exercises to review right now.')}</p>
      : <ul className="study-suggestion-list">
        {record.recommendations.map(({ group, item }) => <li key={group.id}>
          <span className="study-caption">{group.title[locale]}</span>
          <h3>{item.level.title[locale]}</h3>
          <div className="study-actions">
            <ReviewMaterials materials={group.materials} sourceId={item.level.id} locale={locale} onReview={onReview} />
            <button type="button" className="subtle-button" onClick={() => onReview(item.level.id, item.level.id)}>
              {t('重做练习', 'Retry exercise')}
            </button>
          </div>
        </li>)}
      </ul>}
  </section>
}

export function LessonReviewNav({ source, current, materials, locale, onBack, onReview }: {
  source: Level; current: Level; materials: ReviewMaterial[]; locale: Locale; onBack: () => void; onReview: OpenReview;
}) {
  const stage = levelStage(source)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  return <nav className="panel study-review-nav" aria-label={t('复习任务', 'Review session')}>
    <div>
      <span className="study-caption">{t('正在复习', 'In review')}</span>
      <strong>{source.title[locale]}</strong>
    </div>
    <div className="study-actions">
      <ReviewMaterials materials={materials} current={current.id} sourceId={source.id} locale={locale} onReview={onReview} />
      {(stage === 'exercise' || stage === 'challenge') && <button type="button" className="primary-button"
        onClick={() => onReview(source.id, source.id)}>{t('重做练习', 'Retry exercise')}</button>}
      <button type="button" className="subtle-button" onClick={onBack}>{t('返回学习记录', 'Back to study history')}</button>
    </div>
  </nav>
}
