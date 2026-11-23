import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { promisify } from 'node:util'

const execute = promisify(execFile)

export async function smokeTestServer(node, game, python) {
  const child = spawn(node, [join(game, 'server/index.mjs'), '--production', '--parent-stdin'], {
    cwd: game,
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, PORT: '0', PIXEL_REPAIR_PYTHON: python },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let log = ''
  let url
  let error
  child.on('error', value => { error = value })
  child.stdout.on('data', chunk => {
    log = (log + chunk).slice(-8000)
    const match = /Pixel Repair Lab is running at (http:\/\/127\.0\.0\.1:\d+)\r?\n/.exec(log)
    if (match) url = match[1]
  })
  child.stderr.on('data', chunk => { log = (log + chunk).slice(-8000) })
  const closed = once(child, 'close').catch(() => {})
  try {
    const deadline = Date.now() + 40_000
    while (!url) {
      if (error) throw error
      if (child.exitCode !== null || child.signalCode || Date.now() > deadline) throw new Error('Bundled Node failed to start: ' + log)
      await delay(100)
    }
    async function json(path, body) {
      const request = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}
      const response = await fetch(url + path, { ...request, signal: AbortSignal.timeout(45_000) })
      if (!response.ok) throw new Error(`${path} returned ${response.status}: ${await response.text()}`)
      return response.json()
    }
    // The signed runtime also needs its own working fetch for the optional AI service.
    const checkHome = `const page = await fetch(process.argv[1]);
      if (!page.ok || !(await page.text()).includes('id="root"')) throw new Error('Game home page missing');`
    await execute(node, ['--input-type=module', '--eval', checkHome, url], { timeout: 10_000 })
    const catalog = await json('/api/levels')
    if (!catalog.levels?.length || catalog.issues?.length !== 0) throw new Error('Course catalog failed validation')
    const labs = await json('/api/labs/status')
    if (!['numpy', 'pandas', 'analysis', 'sql', 'opencv', 'yolox'].every(recipe => labs.recipes?.[recipe])) {
      throw new Error('Bundled classroom labs unavailable: ' + JSON.stringify(labs))
    }
    const { result } = await json('/api/labs/run', { recipe: 'yolox', parameters: { confidence: 50 } })
    if (!result?.detections?.some(detection => detection.label === 'dog')) throw new Error('Bundled detector failed its sample image')
    console.log(`Signed game self-test: ${catalog.levels.length} levels, six labs and OK detection.`)
  } finally {
    child.kill()
    await closed
  }
}

export async function smokeTestApp(app) {
  const contents = join(app, 'Contents')
  const native = await execute(join(contents, 'MacOS/PixelRepairLab'), ['--smoke-test'], { timeout: 60_000 })
  if (native.stdout.trim()) console.log(native.stdout.trim())
  await smokeTestServer(join(contents, 'Helpers/node'), join(contents, 'Resources/game'),
    join(contents, 'Frameworks/ClassroomPython.framework/Versions/Current/bin/python3.12'))
}
