import { useRef, useState } from 'react'
import schemaUrl from '../../level.schema.json?url'
import type { Issue, Level, Locale } from '../shared/types'
import { mapScenarioAt } from '../shared/mapScenarios'
import { challengeZoneId } from '../shared/coursePrerequisites'
import { breadboardProgramIssues } from '../shared/breadboard'
import { ferryGrid, initialFerryLayout } from '../shared/ferry'
import type { parseLevel } from '../shared/validate'
import { Board, MapTiles } from './Board'
import { arenaGateCells } from './arenaGates'
import MapScenarioPicker from './MapScenarioPicker'
import { WorkshopForLesson } from './station3d/LessonWorkbench'
import { initialSnapshot } from '../engine/snapshot'
import { LessonView } from './LessonView'
import { groupLevels, stageLabel } from './lessonTools'
import { ChallengePrerequisites } from './ChallengeCatalog'
import { configMessage, tr } from './text'

export function IssueList({ issues, locale }: { issues: Issue[]; locale: Locale }) {
  return <ul className="issues">
    {issues.map((issue, index) => <li key={index}><code>{issue.path}</code> {configMessage(locale, issue)}</li>)}
  </ul>
}

export function LevelPreview({ locale, catalog }: { locale: Locale; catalog: Level[] }) {
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [imported, setImported] = useState<{ name: string; level?: Level; issues: Issue[] }>()
  const [playing, setPlaying] = useState(false)
  const [mapIndex, setMapIndex] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [importedWin, setImportedWin] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const request = useRef(0)

  async function open(file?: File) {
    if (!file) return
    const token = ++request.current
    setPlaying(false)
    setImportedWin(false)
    let parsed: ReturnType<typeof parseLevel>
    try {
      const { MAX_LEVEL_BYTES, parseLevel } = await import('../shared/validate')
      parsed = file.size > MAX_LEVEL_BYTES
        ? { issues: [{ path: '/', code: 'size', message: 'Level files must be at most 256 KiB.' }] }
        : parseLevel(await file.text())
      if (parsed.level) {
        const missingProgram = breadboardProgramIssues(parsed.level, catalog)
        if (missingProgram.length) parsed = { issues: missingProgram }
      }
    } catch {
      parsed = { issues: [{ path: '/', message: t('无法读取这个文件。', 'This file could not be read.') }] }
    }
    if (request.current === token) {
      setMapIndex(0)
      setImported({ name: file.name, ...parsed })
    }
  }

  const level = imported?.level
  const map = level?.kind === 'grid' && level.ferry?.kind === 'race'
    ? ferryGrid(level, initialFerryLayout(level))
    : level?.kind === 'grid' || level?.kind === 'arena' ? mapScenarioAt(level, mapIndex) : undefined
  const complete = () => setImportedWin(true)

  return <>
    <div className="mission-heading">
      <div><h1>{t('关卡预览', 'Level preview')}</h1><p>{t('导入 AI 编写的关卡 JSON，检查内容并试玩。', 'Import a level JSON from your AI author, inspect it, and play it.')}</p></div>
      <a href={schemaUrl} download="level.schema.json" className="subtle-button">{t('下载 JSON Schema', 'Download JSON Schema')}</a>
    </div>
    <section className={'panel import-panel' + (dragging ? ' dragging' : '')}
      onDragOver={event => { event.preventDefault(); setDragging(true) }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false) }}
      onDrop={event => { event.preventDefault(); setDragging(false); void open(event.dataTransfer.files[0]) }}>
      <input type="file" className="sr-only" tabIndex={-1} ref={input} accept=".json,application/json" aria-label={t('关卡 JSON 文件', 'Level JSON file')}
        onChange={event => { void open(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />
      <span className="import-symbol" aria-hidden="true">{'{ }'}</span>
      <div><h2>{imported?.name ?? t('拖入关卡 JSON', 'Drop a level JSON')}</h2>
        <p>{level ? t('配置校验通过', 'Configuration valid') : imported ? t('配置需要修改', 'Configuration needs changes') : t('支持 256 KiB 以内的关卡文件。', 'Level files up to 256 KiB.')}</p>
      </div>
      <button type="button" className="subtle-button" onClick={() => input.current?.click()}>{t('选择 JSON 文件', 'Choose JSON file')}</button>
    </section>
    {imported && imported.issues.length > 0 && <section className="panel preview-details"><IssueList issues={imported.issues} locale={locale} /></section>}
    {level && <>
      <div className="mission-heading preview-heading">
        <div><span className="concept-tag">{stageLabel(level, locale)}</span><h2>{level.title[locale]}</h2><p>{level.brief[locale]}</p></div>
        {importedWin && <span className="complete-tag">{t('试玩成功', 'Playtest complete')}</span>}
        <button type="button" className={playing ? 'subtle-button' : 'primary-button'} onClick={() => setPlaying(!playing)}>
          {playing ? t('返回预览', 'Back to preview') : t('一键试玩', 'Playtest level')}
        </button>
        {(!playing || level.unit?.id === challengeZoneId) && <WorkshopForLesson level={level} locale={locale} completed={Boolean(importedWin)} />}
      </div>
      {level.prerequisites && <ChallengePrerequisites level={level} groups={groupLevels(catalog)} locale={locale} />}
      {playing ? <LessonView level={level} locale={locale} preview catalog={catalog} completed={importedWin ? [level.id] : []} onComplete={complete} /> : <div className="lesson-layout">
          {map && <section className="panel board-panel">
            <div className="panel-heading"><h2>{t('初始棋盘', 'Initial board')}</h2></div>
            <MapScenarioPicker locale={locale} index={mapIndex} count={1 + (map.variants?.length ?? 0)} onChange={setMapIndex} />
            {map.kind === 'grid' ? <Board level={map} snapshot={initialSnapshot(map)} locale={locale} />
              : <MapTiles location="arena" tiles={map.tiles} arenaBuffs={map.combat?.buffs} exit={map.objective.kind === 'escape' ? map.objective.exit : undefined}
                arenaTargetIds={map.combat && 'itemIds' in map.objective ? map.objective.itemIds : undefined}
                gates={arenaGateCells(map)} arenaSwitches={map.combat?.switches}
                batteries={!map.combat && Boolean(map.shifts?.length)} playerPosition={map.start}
                opponents={map.opponents.map((bot, index) => ({ ...bot.start, id: bot.id, name: bot.title[locale], label: String(index + 1), index }))}
                items={map.items} locale={locale} />}
          </section>}
          <section className="panel preview-details">
            <h3>{level.concept[locale]}</h3>
            {level.hints.map((hint, index) => <p key={index}>{hint[locale]}</p>)}
            {level.kind === 'grid' ? <div className="api-list">{level.allowedApi.map(name => <code key={name}>{name}()</code>)}</div>
              : level.kind === 'ai' ? <ul>{level.inventory.map(item => <li key={item.id}>{item.label[locale]}</li>)}</ul> : null}
          </section>
        </div>}
    </>}
  </>
}
