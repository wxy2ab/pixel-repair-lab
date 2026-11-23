import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { isBuiltin } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const project = fileURLToPath(new URL('../../', import.meta.url))

async function writeServerLicenses(inputs, directory) {
  const packages = new Set()
  for (const filename of Object.keys(inputs)) {
    const match = /^(.*\bnode_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(filename)
    if (match) packages.add(match[1])
  }
  const notices = []
  for (const path of [...packages].sort()) {
    const absolute = resolve(project, path)
    const { name, version } = JSON.parse(await readFile(join(absolute, 'package.json'), 'utf8'))
    const files = (await readdir(absolute)).filter(filename => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(filename))
    if (!files.length) throw new Error(`No license text found for bundled dependency ${name}`)
    notices.push(`${name} ${version}`)
    for (const file of files.sort()) notices.push((await readFile(join(absolute, file), 'utf8')).trim())
  }
  await writeFile(join(directory, 'third-party-licenses.txt'), notices.join('\n\n') + '\n')
}

export async function buildPortableServer(destination) {
  const directory = resolve(destination, 'server')
  const result = await build({
    absWorkingDir: project,
    entryPoints: ['src/server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    define: { PORTABLE_BUILD: 'true' },
    metafile: true,
    write: false,
    outfile: join(directory, 'index.mjs'),
  })
  for (const output of Object.values(result.metafile.outputs)) {
    for (const dependency of output.imports) {
      if (!isBuiltin(dependency.path)) throw new Error(`Unexpected portable server import: ${dependency.path}`)
    }
  }
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, 'index.mjs'), result.outputFiles[0].contents)
  await writeServerLicenses(result.metafile.inputs, directory)
}
