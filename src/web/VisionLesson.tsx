import { useClassroom, CommandDesk } from './Classroom'
import { ExperimentWindow } from './ExperimentWindow'
import { TeachingModel } from './station3d/TeachingModel'
import { ChallengeFailureReview, type ChallengeReviewData } from './ChallengeFailureReview'
import type { ChallengeRunHandlers } from './challengeScore'
import { useEffect, useId, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import { parseVisionRequest, visionFields, visionMeetsGoal, type RGB, type VisionBox, type VisionCase, type VisionField, type VisionFrame, type VisionLevel, type VisionMode, type VisionParameters, type VisionRequest, type VisionResult } from '../shared/vision'
import type { Locale } from '../shared/types'
import { tr } from './text'
import { TaskProgress } from './TaskProgress'
import { HintSteps } from './HintSteps'
import './vision-course.css'

const loadPixelBench = () => import('./station3d/pixel-instrument').then(module => module.buildPixelInstrument)

const words: Record<string, [string, string]> = {
  calibration: ['校准图', 'Calibration image'], labrador: ['拉布拉多犬', 'Labrador'], astronaut: ['宇航员', 'Astronaut'],
  channel: ['颜色通道', 'Color channel'], rgb: ['彩色 RGB', 'Color RGB'], red: ['红色 R', 'Red R'], green: ['绿色 G', 'Green G'], blue: ['蓝色 B', 'Blue B'], gray: ['灰度', 'Grayscale'],
  blur: ['平滑窗口', 'Blur window'], threshold: ['亮度阈值', 'Brightness threshold'], confidence: ['最低置信度', 'Minimum confidence'],
  target: ['显示类别', 'Show class'], all: ['所有类别', 'All classes'], dog: ['狗', 'Dog'], person: ['人', 'Person'],
  maxSide: ['最长边（像素）', 'Longest side (px)'], tone: ['画面处理', 'Image adjustment'], original: ['保留颜色', 'Keep colors'], brighten: ['提亮', 'Brighten'],
  x: ['横坐标 x', 'Horizontal position x'], y: ['纵坐标 y', 'Vertical position y'], w: ['框宽', 'Box width'], h: ['框高', 'Box height'],
}

function word(locale: Locale, key: string) {
  return Object.hasOwn(words, key) ? tr(locale, ...words[key]) : key.replaceAll('_', ' ')
}

function sameParams(left: VisionParameters, right: VisionParameters) {
  return Object.entries(left).every(([key, value]) => right[key] === value)
}

function colorValue(rgb: RGB) {
  return `rgb(${rgb.join(' ')})`
}

function VisionControls({ mode, params, locale, pending, update }: {
  mode: VisionMode; params: VisionParameters; locale: Locale; pending: boolean;
  update: (key: string, value: number | string) => void;
}) {
  const id = useId()
  const fields: [string, VisionField][] = Object.entries(visionFields[mode])
  const box = mode === 'boxes'
  return <fieldset className="vision-fields" data-testid="vision-controls" disabled={pending}>
    <legend>{tr(locale, '调整参数', 'Choose settings')}</legend>
    {fields.map(([key, field]) => {
      const name = id + key
      const caption = word(locale, key)
      const current = params[key]
      if ('min' in field) {
        const suffix = key === 'confidence' || box ? '%' : ''
        const value = Number(current)
        const otherEnd = box ? ({ x: 'w', y: 'h', w: 'x', h: 'y' } as Record<string, string>)[key] : undefined
        const max = otherEnd ? Math.min(field.max, 100 - Number(params[otherEnd])) : field.max
        return <div className="vision-field" key={key}>
          <label htmlFor={name}>{caption} <output htmlFor={name}>{value}{suffix}</output></label>
          <div className="vision-range">
            <button type="button" className="subtle-button" aria-label={tr(locale, `减小${caption}`, `Decrease ${caption}`)} disabled={value <= field.min} onClick={() => update(key, value - 1)}>−</button>
            <input id={name} data-parameter={key} type="range" min={field.min} max={max} value={value} onChange={event => update(key, event.target.valueAsNumber)} />
            <button type="button" className="subtle-button" aria-label={tr(locale, `增大${caption}`, `Increase ${caption}`)} disabled={value >= max} onClick={() => update(key, value + 1)}>+</button>
          </div>
        </div>
      }
      return <div className="vision-field" key={key}>
        <label htmlFor={name}>{caption}</label>
        <select id={name} data-parameter={key} value={current} onChange={event => {
          const chosen = field.find(entry => String(entry) === event.target.value)
          if (chosen !== undefined) update(key, chosen)
        }}>{field.map(value => <option key={value} value={value}>
          {typeof value === 'string' ? word(locale, value) : key === 'blur' ? value ? `${value} × ${value}` : tr(locale, '关闭', 'Off') : value}
        </option>)}</select>
      </div>
    })}
  </fieldset>
}

function PixelGrid({ result, params, locale, pending, select }: {
  result: VisionResult; params: VisionParameters; locale: Locale; pending: boolean; select: (x: number, y: number) => void;
}) {
  const x = Number(params.x)
  const y = Number(params.y)
  const rgb = result.palette?.[y]?.[x]
  if (!result.palette || !rgb) return null
  const sample = result.sample?.x === x && result.sample.y === y && result.channel === params.channel ? result.sample : undefined
  return <>
    <TeachingModel sceneKey="pixel-sampler" locale={locale} label={tr(locale, '像素取样台 · RGB 三个分量', 'Pixel sampler · RGB components')}
      state={{ palette: result.palette, x, y }} load={loadPixelBench}
      onPick={pending ? undefined : id => {
        const [column, row] = id.split(',').map(Number)
        select(column, row)
      }} />
    <div className="vision-pixels">
      <div className="vision-palette" role="group" aria-label={tr(locale, '像素校准板', 'Pixel calibration grid')}>
        {result.palette.map((row, rowIndex) => row.map((color, columnIndex) => <button type="button" key={`${columnIndex},${rowIndex}`}
          data-testid="vision-pixel" data-x={columnIndex} data-y={rowIndex} disabled={pending}
          aria-label={tr(locale, `像素 (${columnIndex}, ${rowIndex})`, `Pixel (${columnIndex}, ${rowIndex})`)} aria-pressed={columnIndex === x && rowIndex === y}
          style={{ '--pixel': colorValue(color) } as CSSProperties} onClick={() => select(columnIndex, rowIndex)} />))}
      </div>
      <dl className="vision-metrics">
        <div><dt>{tr(locale, '选中像素', 'Selected pixel')}</dt><dd>({x}, {y})</dd></div>
        {rgb.map((value, index) => <div key={index}><dt>{'RGB'[index]}</dt><dd>{value}</dd></div>)}
        {sample?.value !== undefined && <div><dt>{tr(locale, '通道读数', 'Channel value')}</dt><dd>{sample.value}</dd></div>}
      </dl>
    </div>
  </>
}

function squareStyle(box: VisionBox): CSSProperties {
  const [x, y, width, height] = box
  return { left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` }
}

function percentBox([x, y, width, height]: VisionBox, frame: VisionFrame): VisionBox {
  return [x / frame.width * 100, y / frame.height * 100, width / frame.width * 100, height / frame.height * 100]
}

type Point = { x: number; y: number }

function pointOnImage(event: PointerEvent<HTMLDivElement>): Point {
  const rect = event.currentTarget.getBoundingClientRect()
  const clamp = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 100)
  return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }
}

function drawnBox(start: Point, end: Point): VisionBox {
  return [Math.min(start.x, end.x, 99), Math.min(start.y, end.y, 99), Math.max(1, Math.abs(start.x - end.x)), Math.max(1, Math.abs(start.y - end.y))]
}

function DetectionPicture({ frame, locale, draw, pending, onDraw }: {
  frame: VisionFrame; locale: Locale; draw?: VisionBox; pending: boolean; onDraw: (box: VisionBox) => void;
}) {
  const start = useRef<Point | undefined>(undefined)
  const [draft, setDraft] = useState<VisionBox>()
  const canDraw = !!draw && !pending
  return <div className={'vision-image' + (draw ? ' vision-draw' : '')} style={{ aspectRatio: frame.width / frame.height }}
    data-testid="vision-processed"
    onPointerDown={event => {
      if (!canDraw || event.button !== 0) return
      event.currentTarget.setPointerCapture(event.pointerId)
      start.current = pointOnImage(event)
      setDraft(drawnBox(start.current, start.current))
    }} onPointerMove={event => {
      if (start.current) setDraft(drawnBox(start.current, pointOnImage(event)))
    }} onPointerUp={event => {
      if (!start.current) return
      const box = drawnBox(start.current, pointOnImage(event))
      start.current = undefined
      setDraft(undefined)
      if (box[2] > 1 && box[3] > 1) onDraw(box)
    }} onLostPointerCapture={() => { start.current = undefined; setDraft(undefined) }}>
    <img src={frame.processed} alt={word(locale, frame.id)} draggable={false} />
    {frame.detections.map(({ box, label, score }, index) => <div key={index} className="vision-detection-box" aria-hidden="true"
      style={squareStyle(percentBox(box, frame))}><span>{word(locale, label)} {(score * 100).toFixed(1)}%</span></div>)}
    {draw && <div className="vision-drawn-box" aria-hidden="true" style={squareStyle(draft ?? draw)} />}
  </div>
}

function Attribution({ frame, locale }: { frame: VisionFrame; locale: Locale }) {
  if (frame.id === 'calibration') return null
  return <small className="vision-credit">{frame.id === 'labrador'
    ? <><a href="https://commons.wikimedia.org/wiki/File:YellowLabradorLooking_new.jpg" target="_blank" rel="noreferrer">Elf, Djmirko, FT2</a> · <a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noreferrer">CC BY-SA 3.0</a></>
    : <a href="https://scikit-image.org/docs/0.25.x/api/skimage.data.html#skimage.data.astronaut" target="_blank" rel="noreferrer">{tr(locale, 'NASA · 公共领域', 'NASA · Public domain')}</a>}</small>
}

function VisionOutput({ result, selected, mode, params, locale, pending, preview, current, onDraw, selectPixel }: {
  result: VisionResult; selected: number; mode: VisionMode; params: VisionParameters; locale: Locale; pending: boolean; preview: boolean; current: boolean;
  onDraw: (box: VisionBox) => void; selectPixel: (x: number, y: number) => void;
}) {
  const frame = result.frames[selected] ?? result.frames[0]
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const annotated = mode === 'boxes' ? [Number(params.x), Number(params.y), Number(params.w), Number(params.h)] as VisionBox : undefined
  return <div className="vision-output">
    {(mode === 'pixels' || mode === 'color') && <PixelGrid result={result} params={params} locale={locale} pending={pending} select={selectPixel} />}
    {mode !== 'pixels' && <div data-testid="vision-frame" data-image={frame.id} data-mode={mode} className="vision-frame">
      <div className={'vision-image-grid' + (mode === 'project' || mode === 'filter' ? ' vision-compare' : '')}>
        {(mode === 'project' || mode === 'filter') && <figure className="vision-original">
          <figcaption>{t('原图', 'Original')}</figcaption>
          <img src={frame.original} alt={t('处理前的图像', 'Image before processing')} />
        </figure>}
        <figure>
          <figcaption>{mode === 'project' || mode === 'filter' || mode === 'color' ? t('处理结果', 'Processed image') : t('检测框', 'Detection boxes')} · {frame.width}×{frame.height}</figcaption>
          <DetectionPicture key={frame.id} frame={frame} locale={locale} draw={annotated} pending={pending} onDraw={onDraw} />
        </figure>
      </div>
      {frame.intermediate && <details className="vision-details"><summary>{t('查看阈值处理前的灰度图', 'View grayscale before thresholding')}</summary>
        <img className="vision-intermediate" src={frame.intermediate} alt={t('灰度与平滑的中间图', 'Grayscale and smoothing intermediate image')} />
      </details>}
      {mode === 'boxes' && <p className="vision-draw-note">{t('拖出黄色框，绿色框显示模型的参考位置。', 'Drag a yellow box. The green box is the model’s reference.')}</p>}
      {frame.iou !== undefined && current && <p className="vision-iou" data-testid="vision-iou">{t('框的重叠率 IoU', 'Box overlap IoU')} <strong>{Math.round(frame.iou * 100)}%</strong></p>}
      {(mode === 'detect' || mode === 'boxes' || (mode === 'project' && !preview)) && (frame.detections.length ? <div className="vision-detections" data-testid="vision-detection">
        <table><thead><tr><th scope="col">{t('类别', 'Class')}</th><th scope="col">{t('置信度', 'Confidence')}</th><th scope="col">x, y · w×h</th></tr></thead>
          <tbody>{frame.detections.map(({ label, score, box: [x, y, width, height] }, index) => <tr key={index}>
            <td>{word(locale, label)}</td><td>{(score * 100).toFixed(1)}%</td><td>{x}, {y} · {width}×{height}</td>
          </tr>)}</tbody>
        </table>
      </div> : <p className="vision-muted" data-testid="vision-detection">{t('当前设置下没有保留检测框。', 'No boxes remain with these settings.')}</p>)}
      <Attribution frame={frame} locale={locale} />
    </div>}
    {result.regions !== undefined && <dl className="vision-metrics">
      <div><dt>{t('亮区数', 'Bright regions')}</dt><dd data-testid="vision-regions">{result.regions}</dd></div>
      <div><dt>{t('白色像素', 'White pixels')}</dt><dd>{result.whitePixels}</dd></div>
    </dl>}
    {result.code && <details className="vision-details"><summary>{t('查看执行代码', 'View executed code')}</summary><pre>{result.code}</pre></details>}
  </div>
}

function VisionExperiment({ level, scenario, locale, scenarioPicker, onPass, onFail }: {
  level: VisionLevel; scenario: VisionCase; locale: Locale; scenarioPicker: ReactNode; onPass: () => void; onFail: (result: VisionResult) => void;
}) {
  const [params, setParams] = useState(scenario.initial)
  const [latest, setLatest] = useState<{ result: VisionResult; request: VisionRequest; graded: boolean }>()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string>()
  const requestRef = useRef<AbortController | null>(null)
  const t = (zh: string, en: string) => tr(locale, zh, en)
  const [selected, setSelected] = useState(0)
  const classroom = useClassroom()
  const project = level.mode === 'project'
  const preprocessed = latest && latest.request.params.maxSide === params.maxSide && latest.request.params.tone === params.tone
  const current = latest !== undefined && sameParams(latest.request.params, params)
  const stale = latest && (latest.request.action === 'prepare' ? !preprocessed : !current)
  const passed = current && latest.graded && (!scenario.goal || visionMeetsGoal(latest.result, scenario.goal))

  async function execute(settings: VisionParameters, action: VisionRequest['action'], graded: boolean) {
    if (requestRef.current) return
    const request = parseVisionRequest({ mode: level.mode, image: scenario.image, params: settings, action })
    if (!request) { setError('invalid-input'); return }
    const controller = new AbortController()
    requestRef.current = controller
    setPending(true)
    setError(undefined)
    try {
      const response = await fetch('/api/labs/vision', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: controller.signal })
      const payload = await response.json() as { result?: VisionResult; error?: string }
      if (controller.signal.aborted) return
      if (!response.ok || payload.result?.mode !== level.mode || !payload.result.frames.length) {
        setError(payload.error ?? 'lab-failed')
        return
      }
      setLatest({ result: payload.result, request, graded })
      if (graded) {
        if (!scenario.goal || visionMeetsGoal(payload.result, scenario.goal)) onPass()
        else onFail(payload.result)
      }
    } catch {
      if (!controller.signal.aborted) setError('lab-failed')
    } finally {
      if (requestRef.current === controller) requestRef.current = null
      if (!controller.signal.aborted) setPending(false)
    }
  }

  useEffect(() => {
    if (!project) void execute(scenario.initial, 'run', false)
    return () => requestRef.current?.abort()
    // This experiment remounts when the selected case changes.
  }, [scenario, project])

  function update(change: VisionParameters) {
    setParams(previous => ({ ...previous, ...change }))
    setError(undefined)
  }

  const settings = <>
    {latest && latest.result.frames.length > 1 && <div className="vision-switch" role="group" aria-label={t('切换照片', 'Choose a photo')}>
      {latest.result.frames.map((photo, index) => <button type="button" className="subtle-button" key={photo.id} data-image-choice={photo.id}
        aria-pressed={selected === index} onClick={() => setSelected(index)}>{word(locale, photo.id)}</button>)}
    </div>}
    <VisionControls mode={level.mode} params={params} locale={locale} pending={pending} update={(key, value) => update({ [key]: value })} />
    <div className="vision-actions">
      {project && <button type="button" className={!preprocessed ? 'primary-button' : 'subtle-button'} disabled={pending}
        onClick={() => void execute(params, 'prepare', false)}>{t('1. 预处理两张图片', '1. Preprocess both images')}</button>}
      <button type="button" className="primary-button" disabled={pending || (project && !preprocessed)} onClick={() => void execute(params, 'run', true)}>
        {project ? t('2. 运行 YOLOX', '2. Run YOLOX') : t('运行实验', 'Run experiment')}
      </button>
    </div>
  </>

  return <div className="vision-workspace classroom-split">
    <ExperimentWindow locale={locale} title={t('图像检查器', 'Image inspector')}>
      <section className="panel vision-panel" aria-busy={pending}>
        {classroom && <div className="experiment-inputs">{settings}</div>}
        <div className="vision-result-heading"><h2>{t('实验结果', 'Experiment results')}</h2>{latest && <span>{latest.result.engine}</span>}</div>
        {pending && <p role="status" className="vision-muted">{t('正在处理图像…', 'Processing the images…')}</p>}
        {error && <p role="alert" className="error-message">{error === 'lab-unavailable'
          ? t('本地视觉实验还没准备好。请运行 npm run labs:setup 后刷新。', 'Set up the local vision labs with npm run labs:setup, then reload.')
          : error === 'lab-busy' ? t('实验台正在忙，请稍后再试。', 'The workbench is busy. Try again in a moment.')
            : t('这次没有处理成功。请检查参数后再试。', 'The experiment did not finish. Check the settings and try again.')}</p>}
        {!latest && !pending && !error && <p className="vision-muted">{t('预处理后可以逐张对照原图和结果。', 'Compare each original with its processed image after preprocessing.')}</p>}
        {latest && <>
          {stale && <p className="vision-muted">{t('下方仍是上一次的结果。运行后会更新。', 'The last result stays visible until you run again.')}</p>}
          {classroom && level.mode === 'filter' && latest.result.regions !== undefined && <p className="experiment-receipt">
            {t(`这次用亮度阈值 ${latest.request.params.threshold} 处理图像，找到了 ${latest.result.regions} 个亮区。`,
              `With a brightness threshold of ${latest.request.params.threshold}, the filter found ${latest.result.regions} bright regions.`)}
          </p>}
          {classroom && level.mode === 'detect' && <p className="experiment-receipt">
            {t(`这次设置最低置信度为 ${latest.request.params.confidence}%，图上保留了 ${latest.result.frames[selected]?.detections.length ?? 0} 个框。`,
              `At a minimum confidence of ${latest.request.params.confidence}%, this image kept ${latest.result.frames[selected]?.detections.length ?? 0} boxes.`)}
          </p>}
          <VisionOutput result={latest.result} selected={selected} locale={locale} params={params} mode={level.mode} pending={pending}
            preview={latest.request.action === 'prepare'} current={current} selectPixel={(x, y) => update({ x, y })}
            onDraw={([x, y, w, h]) => update({ x, y, w, h })} />
          {current && latest.graded && <p role="status" data-testid="vision-feedback" data-task-success={passed || undefined} className={passed ? 'win-message' : 'error-message'}>
            {passed ? project ? t('视觉巡查报告已完成。', 'Vision inspection report complete.') : t('当前图像通过。', 'This image passed.')
              : project ? t('两张图的处理或检测结果还不符合任务。核对尺寸、画面处理和保留的类别。', 'Check the size, image adjustment, and detections for both photos.')
                : t('结果和目标还有差异。观察图像和读数，调整后再运行。', 'Compare the image and readings with the target, adjust the settings, and run again.')}
          </p>}
          {project && latest.request.action === 'prepare' && preprocessed && <p role="status" className="vision-muted" data-task-success="true">
            {t('两张图片已预处理，可以把处理结果交给 YOLOX。', 'Both images are ready for YOLOX.')}
          </p>}
          {project && passed && <ul className="vision-report" aria-label={t('两张图片的巡查结果', 'Inspection results for both photos')}>
            {latest.result.frames.map(frame => <li key={frame.id}><strong>{word(locale, frame.id)}</strong> {frame.width}×{frame.height} · {frame.detections.map(item => `${word(locale, item.label)} ${(item.score * 100).toFixed(1)}%`).join(' · ') || t('无检测框', 'No boxes')}</li>)}
          </ul>}
        </>}
      </section>
    </ExperimentWindow>
    <CommandDesk locale={locale}>
      <section className="panel vision-panel">
        {scenarioPicker}
        <h2>{scenario.label[locale]}</h2>
        <p>{scenario.prompt[locale]}</p>
        {!classroom && settings}
        {level.hints.length > 0 && <details className="vision-details"><summary>{t('提示', 'Hints')}</summary>
          <HintSteps hints={level.hints} locale={locale} />
        </details>}
      </section>
    </CommandDesk>
  </div>
}

function visionReview(scenario: VisionCase, result: VisionResult): ChallengeReviewData {
  const frame = result.frames[0]
  const reading = (locale: Locale) => {
    const t = (zh: string, en: string) => tr(locale, zh, en)
    if (result.regions !== undefined) return t(`本次有 ${result.regions} 个亮区，${result.whitePixels} 个白色像素。`, `This run produced ${result.regions} regions and ${result.whitePixels} white pixels.`)
    if (result.sample) {
      const { x, y, rgb } = result.sample
      const measurement = t(`本次在 (${x}, ${y}) 测得 RGB (${rgb.join(', ')})。`, `The sample at (${x}, ${y}) measured RGB (${rgb.join(', ')}).`)
      return result.channel && result.sample.value !== undefined
        ? measurement + ' ' + word(locale, result.channel) + ' = ' + result.sample.value : measurement
    }
    if (frame.iou !== undefined) return t(`当前框和参考框的重合度为 ${Math.round(frame.iou * 100)}%。`, `The current box has ${Math.round(frame.iou * 100)}% overlap with the reference.`)
    return result.frames.map(photo => {
      const detections = photo.detections.map(item => word(locale, item.label)).join(', ') || t('无检测框', 'No detections')
      return `${word(locale, photo.id)} (${photo.width}×${photo.height}) · ${detections}`
    }).join(' / ')
  }
  return { location: scenario.label, gaps: [{ zh: reading('zh'), en: reading('en') }, scenario.prompt] }
}

export default function VisionLesson({ level, locale, onComplete, onMistake, challenge }: {
  level: VisionLevel; locale: Locale; onComplete: () => void; onMistake?: () => void; challenge?: ChallengeRunHandlers;
}) {
  const [index, setIndex] = useState(0)
  const [passed, setPassed] = useState<number[]>([])
  const [attempt, setAttempt] = useState(0)
  const [review, setReview] = useState<ChallengeReviewData>()
  const checks = useRef(0)
  const firstMiss = useRef<ChallengeReviewData | undefined>(undefined)
  const checked = useRef(new Map<number, boolean>())
  function replay() {
    challenge?.onStart()
    setIndex(0)
    setPassed([])
    setReview(undefined)
    setAttempt(previous => previous + 1)
    checks.current = 0
    firstMiss.current = undefined
    checked.current.clear()
  }
  function record(failure?: VisionResult) {
    const total = level.cases.length
    if (challenge && passed.length === total) return
    const next = passed.filter(item => item !== index)
    if (!failure) next.push(index)
    setPassed(next)
    if (failure) onMistake?.()
    if (next.length === total && !passed.includes(index)) onComplete()
    if (challenge) {
      challenge.onStart()
      checks.current++
      checked.current.set(index, !failure)
      const current = failure && visionReview(level.cases[index], failure)
      setReview(current)
      firstMiss.current ??= current
      const score = { kind: 'vision' as const, passed: next.length, total, checks: checks.current }
      const evidence = { issue: firstMiss.current, cases: Array.from(checked.current, ([key, value]) => ({ index: key + 1, passed: value })) }
      if (failure) challenge.onFailure(score, { ...evidence, issue: current })
      else if (next.length === total) challenge.onWin(score, replay, evidence)
    }
  }
  const scenarioPicker = level.cases.length > 1 && <div className="vision-switch" role="group" aria-label={tr(locale, '选择实验场景', 'Choose a scenario')}>
    {level.cases.map((scenario, caseIndex) => <button type="button" className="subtle-button" key={caseIndex} data-case={caseIndex}
      aria-pressed={index === caseIndex} onClick={() => { setIndex(caseIndex); setReview(undefined) }}>{passed.includes(caseIndex) && '✓ '}{scenario.label[locale]}</button>)}
    <TaskProgress label={tr(locale, '已完成', 'Passed')} done={passed.length} total={level.cases.length} />
  </div>
  return <div className="vision-workbench">
    <VisionExperiment key={attempt + '/' + index} level={level} scenario={level.cases[index]} locale={locale} onPass={() => record()}
      scenarioPicker={scenarioPicker} onFail={record} />
    {challenge && review && <ChallengeFailureReview review={review} onRetry={replay} />}
  </div>
}
