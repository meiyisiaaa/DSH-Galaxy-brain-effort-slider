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
const nativeModelPicker = function NativeModelPicker() {}
const nativeRegistration = {
  options: { name: 'conversation.input.model' },
  component: nativeModelPicker,
}
const registrations = [nativeRegistration]
const entriesOfSlot = name => {
  const entries = registrations
    .filter(entry => entry.options.name === name)
    .sort((left, right) => (left.options.priority ?? 0) - (right.options.priority ?? 0))
  return entries.length ? [entries[0]] : []
}
const context = {
  effect(fn) { cleanups.push(fn()) },
  modelDirectories: { directoryFor(id) { assert.equal(id, 'qa-session'); return directory } },
  sessions: { binding(id) { assert.equal(id, 'qa-session'); return { session } }, subagentAddress() { return undefined } },
  slots: {
    inject(name, ready) {
      assert.equal(name, 'conversation.input.model')
      declarationReady = true
      cleanups.push(ready())
    },
    register(options, component) {
      assert(declarationReady, 'register must wait for the slot declaration')
      assert.equal(options.name, 'conversation.input.model')
      assert.equal(options.priority, -1)
      assert.equal(typeof component, 'function')
      contribution = options
      const registration = { options, component }
      const priority = options.priority ?? 0
      assert(!registrations.some(entry => (entry.options.priority ?? 0) === priority), 'single-slot registrations must use distinct priorities')
      registrations.push(registration)
      registrations.sort((left, right) => (left.options.priority ?? 0) - (right.options.priority ?? 0))
      return () => {
        const index = registrations.indexOf(registration)
        if (index >= 0) registrations.splice(index, 1)
        if (contribution === options) contribution = undefined
      }
    },
    entriesOfSlot,
  },
}
plugin.apply(context)
assert(styles.length > 0, 'plugin must carry its stylesheet')
assert(styles.every(tag => tag.dataset.plugin === manifest.name))
assert.equal(entriesOfSlot('conversation.input.model')[0].options, contribution, 'the lower-priority contribution must own the native single slot')
const injected = contribution.inject('qa-session')
assert.equal(injected.directory, directory, 'same native directory instance must be passed through')
assert.equal(injected.session, session, 'same native session store must be passed through')
assert.equal(injected.available(), true)
assert(!source.includes('conversation.input.left'), 'the plugin must not add a second composer input entry')
assert.match(source, /name:\s*["']conversation\.input\.model["']/)
assert.match(source, /priority:\s*-1/)
assert.match(source, /data:image\/(png|webp);base64,/, 'approved avatar must be embedded, not an external filesystem URL')
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
const patch = await readFile('cordis.patch.yml', 'utf8')
assert(patch.includes(`name: ${manifest.name}`))
assert.equal(manifest.exports['./client'], './lib/client.js')
for (const cleanup of cleanups.reverse()) cleanup()
assert.equal(contribution, undefined)
assert.deepEqual(registrations, [nativeRegistration], 'disposing the plugin must restore the native model picker')
assert.equal(entriesOfSlot('conversation.input.model')[0].component, nativeModelPicker)
assert(styles.every(tag => tag.removed === true), 'all plugin-owned styles must be removed on unload')
console.log('Native bundle smoke passed: model-slot takeover and restoration, lazy registration, host externals, shared directory, embedded asset, unload cleanup.')
