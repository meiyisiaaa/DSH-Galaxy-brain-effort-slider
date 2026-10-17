import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const manifest = JSON.parse(await readFile('package.json', 'utf8'))
const source = await readFile('lib/client.js', 'utf8')
const nativeRequire = createRequire(import.meta.url)
let registration
let materialized = 0
const styles = []
const sandbox = {
  window: { __ModuleLoader__: { load(row) { assert.equal(registration, undefined); registration = row } } },
  document: {
    createElement(name) { assert.equal(name, 'style'); return { dataset: {}, textContent: '', remove() { this.removed = true } } },
    head: { appendChild(tag) { styles.push(tag) } },
  },
  console,
}
vm.runInNewContext(source, sandbox, { filename: 'lib/client.js' })
assert.equal(registration.id, manifest.name)
assert.equal(typeof registration.factory, 'function')
assert.equal(styles.length, 0, 'registration must be lazy, with no stylesheet side effect')
const allowed = new Set(['react', 'react-dom', 'react/jsx-runtime'])
const plugin = registration.factory(specifier => {
  materialized++
  assert(allowed.has(specifier), `unadvertised external: ${specifier}`)
  return nativeRequire(specifier)
})
assert(materialized > 0)
assert.deepEqual(Array.from(plugin.inject), ['slots', 'modelDirectories', 'sessions'])
assert.equal(styles.length, 0, 'factory materialization must not mount styles')
let declarationReady = false
let contribution
const cleanups = []
const directory = { store: {}, load() {}, select() {} }
const session = {}
const context = {
  effect(fn) { cleanups.push(fn()) },
  modelDirectories: { directoryFor(id) { assert.equal(id, 'qa-session'); return directory } },
  sessions: { binding(id) { assert.equal(id, 'qa-session'); return { session } }, subagentAddress() { return undefined } },
  slots: {
    inject(name, ready) {
      assert.equal(name, 'conversation.input.left')
      declarationReady = true
      cleanups.push(ready())
    },
    register(options, component) {
      assert(declarationReady, 'register must wait for the slot declaration')
      assert.equal(options.id, 'galaxy-effort-slider')
      assert.equal(options.name, 'conversation.input.left')
      assert.equal(typeof component, 'function')
      contribution = options
      return () => { contribution = undefined }
    },
  },
}
plugin.apply(context)
assert(styles.length > 0, 'plugin must carry its stylesheet')
assert(styles.every(tag => tag.dataset.plugin === manifest.name))
const injected = contribution.inject('qa-session')
assert.equal(injected.directory, directory, 'same native directory instance must be passed through')
assert.equal(injected.session, session, 'same native session store must be passed through')
assert.equal(injected.available(), true)
assert.match(source, /data:image\/png;base64,/, 'approved avatar must be embedded, not an external filesystem URL')
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
const patch = await readFile('cordis.patch.yml', 'utf8')
assert(patch.includes(`name: ${manifest.name}`))
assert.equal(manifest.exports['./client'], './lib/client.js')
for (const cleanup of cleanups.reverse()) cleanup()
assert.equal(contribution, undefined)
assert(styles.every(tag => tag.removed === true), 'all plugin-owned styles must be removed on unload')
console.log('Native bundle smoke passed: lazy registration, host externals, slot lifecycle, shared directory, embedded asset, unload cleanup.')
