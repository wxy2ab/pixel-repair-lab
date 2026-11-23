import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchVerifiedFile } from './verified-download.mjs'

const source = fileURLToPath(new URL('../../labs/', import.meta.url))
const lock = JSON.parse(await readFile(new URL('./labs-lock.json', import.meta.url), 'utf8'))
const model = JSON.parse(await readFile(join(source, 'yolox-model.json'), 'utf8'))

async function modelSource(cacheDir) {
  const installed = join(source, '.cache', model.name)
  if ((await stat(installed).catch(() => null))?.size === model.size) {
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(installed)) hash.update(chunk)
    if (hash.digest('hex') === model.sha256) return installed
  }
  return fetchVerifiedFile(model.url, join(cacheDir, model.name), model.sha256)
}

// Keep the Unix interpreter archive intact until it is opened on the target filesystem.
// Extracting it on a Windows build host can lose symlinks and executable permissions.
export async function prepareLabs(target, destination, cacheDir) {
  const selected = lock.targets[target]
  if (!selected) throw new Error('Unsupported Python laboratory target: ' + target)
  const wheels = [...lock.common, ...selected.wheels]
  const requirements = (await readFile(join(source, 'requirements.txt'), 'utf8')).split(/\r?\n/)
    .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  if (JSON.stringify(requirements) !== JSON.stringify(lock.requirements)) {
    throw new Error('labs/requirements.txt changed. Update the target wheels and digests in scripts/portable/labs-lock.json.')
  }

  const labs = join(destination, 'labs')
  const inputs = join(labs, 'portable')
  const wheelhouse = join(inputs, 'wheels')
  await Promise.all([wheelhouse, join(labs, 'fixtures'), join(labs, '.cache')].map(dir => mkdir(dir, { recursive: true })))
  const files = ['README.md', 'YOLOX-LICENSE.txt', 'runner.py', 'data_course.py', 'vision_course.py', 'requirements.txt', 'setup.py',
    'yolox-model.json', 'fixtures/astronaut.png', 'fixtures/labrador.jpg', 'fixtures/station-readings.json']
  await Promise.all(files.map(file => copyFile(join(source, file), join(labs, file))))
  const launcher = await readFile(new URL('./labs-prepare.sh', import.meta.url), 'utf8')
  await writeFile(join(labs, 'prepare.sh'), launcher.replaceAll('\r\n', '\n'))
  await chmod(join(labs, 'prepare.sh'), 0o755)

  const hashedRequirements = []
  for (const asset of [selected.python, ...wheels]) {
    const name = decodeURIComponent(basename(new URL(asset.url).pathname))
    const path = await fetchVerifiedFile(asset.url, join(cacheDir, name), asset.sha256)
    if (asset === selected.python) {
      await copyFile(path, join(inputs, 'python.tar.gz'))
    } else {
      await copyFile(path, join(wheelhouse, name))
      const [namePart, version] = name.split('-')
      hashedRequirements.push(`${namePart}==${version} --hash=sha256:${asset.sha256}`)
    }
  }
  await copyFile(await modelSource(cacheDir), join(labs, '.cache', model.name))
  await writeFile(join(inputs, 'requirements.lock'), hashedRequirements.join('\n') + '\n')
  const revision = createHash('sha256').update([selected.python, ...wheels].map(asset => asset.sha256).join('\n')).digest('hex')
  await writeFile(join(inputs, 'revision'), revision + '\n')
}
