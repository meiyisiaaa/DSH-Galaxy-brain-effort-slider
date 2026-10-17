import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const audit = JSON.parse(readFileSync('docs/UPSTREAM-RC2.json', 'utf8'))

test('rc.2 uses an exact optional DSH peer gate as well as engines.dsh', () => {
  // rc.2 plugin-compatibility.ts reads every DSH peer and ignores engines and peer metadata.
  assert.equal(manifest.engines.dsh, '0.2.0-rc.2')
  assert.deepEqual(manifest.peerDependencies, { '@deepseek-ai/dsh': '0.2.0-rc.2' })
  assert.deepEqual(manifest.peerDependenciesMeta, { '@deepseek-ai/dsh': { optional: true } })
  assert.equal(manifest.dependencies, undefined, 'plugin must not pull in another Host runtime')
  assert.equal(manifest.optionalDependencies, undefined)
  assert.equal(manifest.scripts.install, undefined)
  assert.equal(manifest.scripts.postinstall, undefined)
})

test('rc.2 release identity and local lock agree with the package', () => {
  assert.equal(manifest.version, '0.1.4')
  assert.equal(audit.tag, 'dsh-v0.2.0-rc.2')
  assert.equal(audit.commit, '639ed015397290b3745d163aafe02ffee4aa3f84')
  assert.equal(audit.version, manifest.engines.dsh)
  assert.equal(audit.npm.name, '@deepseek-ai/dsh')
  assert.equal(audit.npm.version, audit.version)
  assert.equal(lock.version, manifest.version)
  for (const key of ['version', 'engines', 'peerDependencies', 'peerDependenciesMeta']) {
    assert.deepEqual(lock.packages[''][key], manifest[key])
  }
})

test('the audited rc.2 surfaces include loader, gate, model, session and install contracts', () => {
  const paths = audit.files.map((file: { path: string; sha256: string }) => {
    assert.match(file.sha256, /^[a-f0-9]{64}$/)
    return file.path
  })
  for (const required of [
    'packages/boot/app-boot/src/plugin-compatibility.ts',
    'packages/client/modules/src/client/manifest.ts',
    'packages/client/ui-conversation/src/client/contract/slots.ts',
    'packages/client/ui-model-selection/src/client/directory.ts',
    'packages/client/ui-model-selection/src/client/service.ts',
    'packages/api/session-controller/src/client/contract/snapshot.ts',
    'packages/api/session-controller/src/client/sessions/service.ts',
    'packages/api/session-controller/src/commands.ts',
    'apps/cli/src/plugin.ts',
  ]) assert(paths.includes(required), `Missing audit surface: ${required}`)
})
