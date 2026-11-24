import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { parseDataRequest, type DataRequest } from '../shared/dataCourse'
import { parseVisionRequest, type VisionRequest } from '../shared/vision'
import { observedLabCount, parseDemoRequest } from './contracts'
import { getLabStatus, handleLabApi, runDataCourse, runDataCourseBatch, runLabDemo, runVisionCourse, runVisionCourseBatch } from './server'

test('demo parameters accept only exact recipe-specific values', () => {
  assert.deepEqual(parseDemoRequest({ recipe: 'analysis', parameters: { days: 5 } }), { recipe: 'analysis', parameters: { days: 5 } })
  for (const input of [
    { recipe: 'python', parameters: { script: 'print(1)' } },
    { recipe: 'sql', parameters: { minimum: 4, zone: 'all', query: 'SELECT 1' } },
    { recipe: 'sql', parameters: { minimum: 4, zone: 'unexpected' } },
    { recipe: 'numpy', parameters: { minimumCharge: -1 } },
    { recipe: 'pandas', parameters: { groupBy: 'quantity' } },
    { recipe: 'opencv', parameters: { threshold: 240.5 } },
    { recipe: 'yolox', parameters: { confidence: 99 } },
    { recipe: 'analysis', parameters: { days: 5 }, file: 'fixture' },
  ]) assert.equal(parseDemoRequest(input), null)
})

test('the prepared demo environment exposes all six recipes', async () => {
  assert.deepEqual(await getLabStatus(), { available: true, recipes: { numpy: true, pandas: true, analysis: true, sql: true, opencv: true, yolox: true } },
    'Run npm run labs:setup before testing the native classroom demos.')
})

test('NumPy applies the charge mask to entire battery rows', async () => {
  const initial = await runLabDemo({ recipe: 'numpy', parameters: { minimumCharge: 60 } })
  const raised = await runLabDemo({ recipe: 'numpy', parameters: { minimumCharge: 75 } })
  assert.equal(initial.recipe, 'numpy')
  assert.match(initial.engine, /NumPy/u)
  assert.equal(observedLabCount(initial), 4)
  assert.equal(raised.recipe, 'numpy')
  assert.deepEqual(raised.rows, [[4, 96], [6, 87], [8, 75]])
  assert.equal(observedLabCount(raised), 3)
})

test('pandas changes the grouping column while preserving the total delivered quantity', async () => {
  const byArea = await runLabDemo({ recipe: 'pandas', parameters: { groupBy: 'zone' } })
  const byItem = await runLabDemo({ recipe: 'pandas', parameters: { groupBy: 'item' } })
  assert.equal(byArea.recipe, 'pandas')
  assert.equal(byItem.recipe, 'pandas')
  assert.match(byItem.engine, /pandas/u)
  assert.deepEqual(byArea.rows, [['hangar', 9, 3], ['storage', 9, 3], ['workshop', 10, 2]])
  assert.deepEqual(byItem.rows, [['battery', 17, 3], ['cable', 2, 1], ['magnet', 5, 2], ['sensor', 4, 2]])
  assert.equal(observedLabCount(byArea), 3)
  assert.equal(observedLabCount(byItem), 4)
})

test('NumPy filters and pandas groups the selected temperature readings', async () => {
  const output = await runLabDemo({ recipe: 'analysis', parameters: { days: 5 } })
  assert.equal(output.recipe, 'analysis')
  assert.match(output.engine, /NumPy.*pandas/u)
  assert.deepEqual(output.rows, [['alpha', 22, 5], ['beta', 27, 5], ['gamma', 19.6, 5]])
  assert.deepEqual(output.summary, { median: 22, spread: 13 })
  assert.match(output.code, /np\.less_equal[\s\S]*\.groupby\(/u)
  const firstDay = await runLabDemo({ recipe: 'analysis', parameters: { days: 1 } })
  assert.equal(firstDay.recipe, 'analysis')
  assert.deepEqual(firstDay.rows, [['alpha', 17, 1], ['beta', 23, 1], ['gamma', 19, 1]])
  const fourDays = await runLabDemo({ recipe: 'analysis', parameters: { days: 4 } })
  assert.equal(observedLabCount(fourDays), 12)
})

test('SQLite and DuckDB execute the same parameterized stock and area filters', async () => {
  const output = await runLabDemo({ recipe: 'sql', parameters: { minimum: 4, zone: 'hangar' } })
  assert.equal(output.recipe, 'sql')
  assert.match(output.engine, /SQLite.*DuckDB/u)
  assert.deepEqual(output.rows, [['battery', 'hangar', 8], ['wheel', 'hangar', 5]])
  assert.deepEqual(output.duckRows, output.rows)
  assert.equal(output.comparisonMatches, true)
  assert.equal(observedLabCount(output), 2)
  assert.equal(observedLabCount({ ...output, comparisonMatches: false }), null)
})

test('OpenCV thresholds the calibration image at different brightness settings', async () => {
  const original = await runLabDemo({ recipe: 'opencv', parameters: { threshold: 115 } })
  const brighter = await runLabDemo({ recipe: 'opencv', parameters: { threshold: 180 } })
  assert.equal(original.recipe, 'opencv')
  assert.equal(brighter.recipe, 'opencv')
  assert.equal(original.regions, 3)
  assert.equal(brighter.regions, 1)
  assert.ok(original.pixels > brighter.pixels && brighter.pixels > 0)
  assert.match(original.image, /^data:image\/png;base64,iVBOR/u)
  assert.notEqual(original.image, brighter.image)
  const twoRegions = await runLabDemo({ recipe: 'opencv', parameters: { threshold: 150 } })
  assert.equal(observedLabCount(twoRegions), 2)
})

test('the CPU YOLOX model predicts a dog in the actual classroom photograph', async () => {
  const result = await runLabDemo({ recipe: 'yolox', parameters: { confidence: 50 } })
  assert.equal(result.recipe, 'yolox')
  assert.match(result.engine, /YOLOX-S/u)
  const dog = result.detections.find(({ label }) => label === 'dog')
  assert.ok(dog && dog.score >= 0.7 && dog.box[2] > 300 && dog.box[3] > 300)
  const strict = await runLabDemo({ recipe: 'yolox', parameters: { confidence: 95 } })
  assert.equal(strict.recipe, 'yolox')
  assert.ok(strict.detections.length < result.detections.length)
  assert.equal(observedLabCount(strict), 0)
})

const dataPipeline: DataRequest = { steps: [
  { operation: 'mask', input: 'raw', params: { column: 'day', comparison: 'gte', threshold: 2 } },
  { operation: 'clean', input: 'previous', params: { trim: true, dropMissing: true, deduplicate: true } },
  { operation: 'group', input: 'previous', params: { by: 'zone', statistic: 'mean' } },
  { operation: 'report', input: 'previous', params: { minimum: 25, sort: 'value-desc' } },
] }

test('the data-course pipeline passes real results between NumPy, pandas, and SQLite', async () => {
  const { steps: [masked, cleaned, grouped, report] } = await runDataCourse(dataPipeline)
  assert.equal(masked.input.rows.length, 14)
  assert.equal(masked.output.rows.length, 11)
  assert.match(masked.engine, /NumPy/u)
  assert.deepEqual(cleaned.input, masked.output)
  assert.deepEqual(masked.sourceRows, [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  assert.deepEqual(cleaned.sourceRows, [0, 1, 3, 4, 5, 7, 9, 10])
  assert.deepEqual(cleaned.removedRows, [
    { index: 2, reason: 'invalid-reading' }, { index: 8, reason: 'invalid-reading' },
    { index: 6, reason: 'repeated-id', keptRow: 5 },
  ])
  assert.deepEqual(cleaned.output.rows.map(row => row[0]), [4, 5, 7, 8, 9, 10, 12, 13])
  assert.deepEqual(cleaned.output.rows[3], [8, 3, 'workshop', 32])
  assert.match(cleaned.code, /to_numeric[\s\S]*str\.strip\(\)[\s\S]*dropna[\s\S]*drop_duplicates/u)
  assert.deepEqual(grouped.input, cleaned.output)
  assert.deepEqual(grouped.output, { columns: ['zone', 'mean'], rows: [['hangar', 26], ['storage', 20], ['workshop', 32]] })
  assert.deepEqual(report.input, grouped.output)
  assert.equal(report.output.rows.length, 2)
  assert.deepEqual(report.output.rows, [['workshop', 32], ['hangar', 26]])
  assert.deepEqual(report.sourceRows, [2, 0])
  assert.match(report.engine, /SQLite/u)
  assert.match(report.code, /WHERE mean >= \?[\s\S]*ORDER BY mean DESC/u)
})

test('data-course batch execution preserves raw values and reports an isolated invalid pipeline', async () => {
  const array: DataRequest = { steps: [{ operation: 'array', input: 'raw', params: { column: 'reading', start: 8, stop: 12 } }] }
  const reportWithoutInput: DataRequest = { steps: [dataPipeline.steps[3]] }
  const sqlGroup: DataRequest = { steps: [
    { operation: 'sql-group', input: 'clean', params: { by: 'zone', statistic: 'mean', minimum: 25, sort: 'value-desc' } },
  ] }
  assert.equal(parseDataRequest(reportWithoutInput), null)
  const results = await runDataCourseBatch([array, reportWithoutInput, sqlGroup])
  assert.deepEqual(results[0]?.steps[0].output, { columns: ['index', 'reading'], rows: [[8, 16], [9, 16], [10, 30], [11, 'bad']] })
  assert.equal(results[1], null)
  assert.deepEqual(results[2]?.steps[0].output.rows, [['workshop', 30]])
  assert.match(results[2]?.steps[0].code ?? '', /GROUP BY zone[\s\S]*HAVING AVG\(reading\) >= \?/u)
})

test('the vision workbench reports actual color channels and blurred threshold pixels', async () => {
  const channel: VisionRequest = { mode: 'color', image: 'calibration', action: 'run', params: { channel: 'green', x: 4, y: 0 } }
  const filter: VisionRequest = { mode: 'filter', image: 'calibration', action: 'run', params: { blur: 7, threshold: 150 } }
  const [color, mask] = await runVisionCourseBatch([channel, filter])
  assert.deepEqual(color?.sample, { x: 4, y: 0, rgb: [40, 190, 205], value: 190 })
  assert.match(color?.code ?? '', /extractChannel\(image, 1\)/u)
  assert.equal(mask?.regions, 2)
  assert.equal(mask?.whitePixels, 8798)
  assert.match(mask?.code ?? '', /GaussianBlur[\s\S]*cv\.threshold\(gray, 150/u)
})

test('the vision project detects both photos after preprocessing the same images', async () => {
  const project: VisionRequest = { mode: 'project', image: 'pair', action: 'run', params: { maxSide: 480, tone: 'brighten', confidence: 35 } }
  const reference = await runVisionCourse({ ...project, action: 'prepare' })
  const report = await runVisionCourse(project)
  assert.deepEqual(report.preprocessing, { maxSide: 480, tone: 'brighten' })
  assert.deepEqual(report.frames.map(({ id, width, height, detections }) => [id, width, height, detections.map(item => item.label)]), [
    ['labrador', 480, 395, ['dog']], ['astronaut', 480, 480, ['person']],
  ])
  assert.deepEqual(report.frames.map(item => item.processed), reference.frames.map(item => item.processed))
  assert.ok(reference.frames.every(item => item.detections.length === 0 && item.processed.startsWith('data:image/jpeg;base64,')
    && item.processed !== item.original))
  assert.match(report.code, /convertScaleAbs\(prepared[\s\S]*detect_yolox\(prepared/u)
  const [plain] = await runVisionCourseBatch([{ ...project, params: { ...project.params, tone: 'original' } }])
  assert.notEqual(report.frames[0].detections[0].score, plain?.frames[0].detections[0].score)
})

test('the vision workbench scores a drawn box against the inferred bounding box', async () => {
  const good: VisionRequest = { mode: 'boxes', image: 'labrador', action: 'run', params: { x: 7, y: 6, w: 84, h: 90 } }
  const poor: VisionRequest = { ...good, params: { x: 0, y: 0, w: 30, h: 30 } }
  const [aligned, corner] = await runVisionCourseBatch([good, poor])
  assert.equal(aligned?.frames[0].detections[0].label, 'dog')
  assert.ok((aligned?.frames[0].iou ?? 0) > 0.95)
  assert.ok((corner?.frames[0].iou ?? 1) < 0.15)
  assert.deepEqual(aligned?.frames[0].annotation, [45, 32, 537, 474])
  assert.equal(parseVisionRequest({ ...good, image: '../labrador.jpg' }), null)
  assert.equal(parseVisionRequest({ ...good, params: { x: 70, y: 6, w: 84, h: 90 } }), null)
})

test('HTTP routes run a trusted recipe and reject malformed input', async () => {
  const server = createServer((request, response) => void handleLabApi(request, response, request.url ?? ''))
  server.listen(0, '127.0.0.1')
  try {
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const origin = `http://127.0.0.1:${address.port}`
    const status = await fetch(`${origin}/api/labs/status`)
    assert.equal(status.status, 200)
    const url = `${origin}/api/labs/run`
    const headers = { 'Content-Type': 'application/json' }
    assert.equal((await fetch(url)).status, 405)
    assert.equal((await fetch(url, { method: 'POST', headers, body: '{invalid' })).status, 400)
    assert.equal((await fetch(url, { method: 'POST', headers, body: 'a'.repeat(2049) })).status, 400)
    const result = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ recipe: 'sql', parameters: { minimum: 10, zone: 'hangar' } }) })
    assert.equal(result.status, 200)
    assert.deepEqual((await result.json()).result.rows, [])

    const dataUrl = `${origin}/api/labs/data`
    const invalid = { steps: [{ ...dataPipeline.steps[0], params: { ...dataPipeline.steps[0].params, code: 'SELECT 1' } }] }
    const rejected = await fetch(dataUrl, { method: 'POST', headers, body: JSON.stringify(invalid) })
    assert.equal(rejected.status, 400)
    const data = await fetch(dataUrl, { method: 'POST', headers, body: JSON.stringify(dataPipeline) })
    assert.equal(data.status, 200)
    assert.deepEqual((await data.json()).result.steps[3].output.rows, [['workshop', 32], ['hangar', 26]])

    const visionUrl = `${origin}/api/labs/vision`
    const probe = { mode: 'pixels', image: 'calibration', action: 'run', params: { x: 2, y: 3 } }
    const notAProject = { ...probe, action: 'prepare' }
    assert.equal((await fetch(visionUrl, { method: 'POST', headers, body: JSON.stringify(notAProject) })).status, 400)
    const pixel = await fetch(visionUrl, { method: 'POST', headers, body: JSON.stringify(probe) })
    assert.equal(pixel.status, 200)
    assert.deepEqual((await pixel.json()).result.sample, { x: 2, y: 3, rgb: [195, 210, 230] })
  } finally {
    server.close()
  }
})
