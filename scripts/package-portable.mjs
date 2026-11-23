import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = fileURLToPath(new URL('../', import.meta.url))
const mac = ['macos-arm64', 'macos-x64']
const linux = ['linux-x64', 'linux-arm64']
const all = [...mac, ...linux]
const groups = { mac, linux, all }
const usage = `npm run package -- [--target mac|linux|all|macos-arm64|macos-x64|linux-x64|linux-arm64]
                   [--format portable] [--output DIRECTORY] [--cache DIRECTORY]

Default: create both Mac publisher kits in release/. Publish the signed, notarized DMG on a Mac.
Linux targets produce runnable offline archives. --format portable selects the shell-based archive.
The build machine needs Node, Python 3 and tar.`

function run(program, args) {
  return new Promise((accept, reject) => {
    const child = spawn(program, args, { cwd: root, stdio: 'inherit', windowsHide: true })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? accept() : reject(new Error(`${basename(program)} exited with ${signal ?? code}`)))
  })
}

function archivePython() {
  for (const [name, args] of [['python3', []], ['python', []], ['py', ['-3']]]) {
    const probe = spawnSync(name, [...args, '-c', 'import sys; sys.exit(sys.version_info < (3, 8))'], { windowsHide: true, stdio: 'ignore' })
    if (probe.status === 0) return [name, args]
  }
  throw new Error('打包机需要 Python 3.8+ 来生成保留执行权限的压缩包。 / Install Python 3.8+ on the build machine.')
}

async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function buildCommon(destination) {
  const { buildPortableServer } = await import('./portable/server-bundle.mjs')
  await run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit'])
  await run(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', join(destination, 'dist')])
  await mkdir(join(destination, 'levels'), { recursive: true })
  for (const file of await readdir(join(root, 'levels'), { withFileTypes: true })) {
    if (file.isFile() && file.name.toLowerCase().endsWith('.json')) {
      await copyFile(join(root, 'levels', file.name), join(destination, 'levels', file.name))
    }
  }
  for (const name of ['level.schema.json', '.env.example']) {
    await copyFile(join(root, name), join(destination, name))
  }
  await buildPortableServer(destination)
}

async function preparePublisherKit(directory, target, version) {
  const releaseTools = join(directory, 'release-tools')
  const macSources = join(root, 'scripts/macos')
  await mkdir(releaseTools, { recursive: true })
  for (const file of ['Info.plist', 'node-entitlements.plist', 'Launcher.swift', 'prepare-labs.py', 'publish.mjs', 'sign-release.mjs', 'smoke-app.mjs']) {
    await copyFile(join(macSources, file), join(releaseTools, file))
  }
  await copyFile(join(root, 'src/web/station3d/sprout-portrait.webp'), join(releaseTools, 'sprout.webp'))
  await copyFile(join(macSources, 'README-kit.txt'), join(directory, 'README.txt'))
  const publisher = await readFile(join(macSources, 'publish.sh'), 'utf8')
  await writeFile(join(directory, 'publish.sh'), publisher.replaceAll('\r\n', '\n'), { mode: 0o755 })
  await writeFile(join(directory, 'release.json'), JSON.stringify({ target, version }, null, 2) + '\n')
}

async function main() {
  const { values } = parseArgs({ options: {
    target: { type: 'string', default: 'mac' }, output: { type: 'string', default: 'release' },
    cache: { type: 'string' }, format: { type: 'string' }, help: { type: 'boolean', short: 'h' },
  } })
  if (values.help) return console.log(usage)
  if (values.format !== undefined && values.format !== 'portable') throw new Error(`Unknown format: ${values.format}\n${usage}`)
  const targets = all.includes(values.target) ? [values.target] : Object.hasOwn(groups, values.target) ? groups[values.target] : undefined
  if (!targets) throw new Error(`Unknown target: ${values.target}\n${usage}`)
  const [python, pythonArgs] = archivePython()
  const { prepareNodeRuntime, DEFAULT_NODE_CACHE } = await import('./portable/node-runtime.mjs')
  const { prepareLabs } = await import('./portable/labs.mjs')
  const version = JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version
  const launch = await readFile(join(root, 'scripts/portable/start.sh'), 'utf8')
  const instructions = await readFile(join(root, 'scripts/portable/START-HERE.txt'), 'utf8')
  const output = resolve(values.output)
  const cache = resolve(values.cache ?? join(root, '.portable-cache'))
  await mkdir(output, { recursive: true })
  const work = await mkdtemp(join(output, '.pack-'))
  try {
    const common = join(work, 'common')
    await buildCommon(common)
    for (const target of targets) {
      console.log(`\n打包 / Packaging ${target}…`)
      const isPublisherKit = target.startsWith('macos') && values.format !== 'portable'
      const name = `PixelRepairLab-${version}-${target}` + (isPublisherKit ? '-ReleaseKit' : '')
      const directory = join(work, name)
      const filename = name + '.tar.gz'
      const nodeCache = values.cache ? join(cache, 'node') : DEFAULT_NODE_CACHE
      const labCache = join(cache, 'labs')
      const payload = isPublisherKit ? join(directory, 'payload') : directory
      const game = isPublisherKit ? join(payload, 'game') : directory
      await cp(common, game, { recursive: true })
      if (isPublisherKit) {
        await preparePublisherKit(directory, target, version)
      } else {
        const launcher = target.startsWith('macos') ? 'Start.command' : 'start.sh'
        const script = launch.replaceAll('\r\n', '\n').replace('@TARGET@', target)
        await writeFile(join(directory, launcher), script, { mode: 0o755 })
        const verify = target.startsWith('macos') ? 'shasum -a 256' : 'sha256sum'
        await writeFile(join(directory, 'START-HERE.txt'), instructions
          .replaceAll('@LAUNCHER@', launcher).replaceAll('@TARGET@', target)
          .replaceAll('@VERIFY@', verify).replaceAll('@ARCHIVE@', filename))
      }
      await prepareNodeRuntime(target, payload, nodeCache)
      await prepareLabs(target, game, labCache)
      const archive = join(work, filename)
      await run(python, [...pythonArgs, join(root, 'scripts/portable/archive.py'), directory, archive])
      const checksum = await hashFile(archive)
      await writeFile(archive + '.sha256', `${checksum}  ${filename}\n`)
      await rename(archive, join(output, filename))
      await rename(archive + '.sha256', join(output, filename + '.sha256'))
      const sizeMiB = Math.round((await stat(join(output, filename))).size / 1048576)
      console.log(`OK ${join(output, filename)} (${sizeMiB} MiB)`)
      await rm(directory, { recursive: true })
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
