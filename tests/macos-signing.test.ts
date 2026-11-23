import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import test from 'node:test'

const releaseTools = new URL('../scripts/macos/sign-release.mjs', import.meta.url).href

function macho(type: number) {
  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf)
  header.writeUInt32LE(type, 12)
  return header
}

test('the signing plan discovers embedded runtime code and signs each enclosing bundle last', async () => {
  const { macSigningPlan } = await import(releaseTools)
  const scratch = await mkdtemp(join(tmpdir(), 'pixel-signing-'))
  try {
    const app = join(await realpath(scratch), 'Pixel Repair Lab.app')
    const framework = join(app, 'Contents', 'Frameworks', 'ClassroomPython.framework')
    const version = join(framework, 'Versions', 'A')
    const launcher = join(app, 'Contents', 'MacOS', 'PixelRepairLab')
    const library = join(version, 'ClassroomPython')
    const plugin = join(version, 'lib', 'cv2.so')
    const node = join(app, 'Contents', 'Helpers', 'node')
    for (const dir of [join(app, 'Contents', 'MacOS'), join(app, 'Contents', 'Helpers'), join(version, 'lib')]) {
      await mkdir(dir, { recursive: true })
    }
    const fat = Buffer.alloc(32)
    fat.writeUInt32BE(0xcafebabe)
    fat.writeUInt32BE(1, 4)
    fat.writeUInt32BE(fat.length, 16)
    await writeFile(launcher, macho(2))
    await writeFile(node, macho(2))
    await writeFile(library, macho(6))
    await writeFile(plugin, Buffer.concat([fat, macho(8)]))
    await writeFile(join(version, 'lib', 'fixture.o'), macho(1))
    await writeFile(join(version, 'lib', 'settings.json'), '{}')
    const items: { path: string; isBundle: boolean; entitlements?: string }[] = await macSigningPlan(app, async (bundle: string) =>
      bundle === app ? launcher : library)
    assert.deepEqual(items.map(item => relative(app, item.path)).sort(),
      [node, plugin, framework, app].map(item => relative(app, item)).sort())
    assert.equal(items.at(-1)?.path, app)
    assert.ok(items.findIndex(item => item.path === plugin) < items.findIndex(item => item.path === framework))
    assert.equal(items.find(item => item.path === framework)?.isBundle, true)
    assert.deepEqual(items.filter(item => item.entitlements).map(item => item.path), [node])
    const plist = await readFile(items.find(item => item.path === node)!.entitlements!, 'utf8')
    assert.match(plist, /<dict>\s*<key>com\.apple\.security\.cs\.allow-jit<\/key>\s*<true\/>\s*<\/dict>/)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
})
