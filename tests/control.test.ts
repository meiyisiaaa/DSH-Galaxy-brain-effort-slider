import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import React, { act } from 'react'
import type { Root } from 'react-dom/client'
import { JSDOM, VirtualConsole } from 'jsdom'
import type { ModelDirectory, ModelDirectoryState, ModelSelection, SessionSnapshot } from '../src/adapter/host-contract'

const plainRoute = { provider: 'deepseek', model: 'plain' }
const automaticRoute = { provider: 'deepseek', model: 'automatic', reasoningEffort: 'high' }
const idleSession: SessionSnapshot = {
  running: false, removed: false, openState: 'open', pendingSubmissions: [], awaitingFirstTurn: false, subagent: null,
}
const catalog = [
  { id: 'plain', name: 'Plain model' },
  { id: 'plain-next', name: 'Another plain model' },
  { id: 'reasoning', name: 'Reasoning model', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
  { id: 'automatic', name: 'Automatic model', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } },
]

let dom: JSDOM
let root: Root
let createRoot: typeof import('react-dom/client').createRoot
let GalaxyEffortControl: typeof import('../src/adapter/GalaxyEffortControl').GalaxyEffortControl
let container: HTMLDivElement
let state: ModelDirectoryState
let lifecycle: SessionSnapshot
let directory: ModelDirectory
let selections: ModelSelection[]
let locked: boolean
let jsdomErrors: Error[]
const directoryListeners = new Set<() => void>()
const sessionListeners = new Set<() => void>()
const originalGlobals = new Map<string, PropertyDescriptor | undefined>()

const selector = <T extends Element = HTMLElement>(query: string): T => {
  const element = dom.window.document.querySelector<T>(query)
  assert.ok(element, `Missing element: ${query}`)
  return element
}

function makeState(current: ModelSelection | null = plainRoute): ModelDirectoryState {
  return {
    current, routable: true, groups: [{ id: 'deepseek', name: 'DeepSeek', models: catalog }],
    failures: [], status: 'ready', pending: null, error: null,
  }
}

async function click(element: Element) {
  await act(async () => {
    element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function key(element: Element, name: string) {
  await act(async () => {
    element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: name, cancelable: true }))
    await Promise.resolve()
  })
}

async function renderControl(patch: { state?: ModelDirectoryState; session?: SessionSnapshot; locked?: boolean } = {}) {
  await act(async () => {
    if (patch.state) {
      state = patch.state
      for (const listener of directoryListeners) listener()
    }
    if (patch.session) {
      lifecycle = patch.session
      for (const listener of sessionListeners) listener()
    }
    if (patch.locked !== undefined) locked = patch.locked
    root.render(React.createElement(GalaxyEffortControl, {
      directory, session: {
        getSnapshot: () => lifecycle,
        subscribe: listener => { sessionListeners.add(listener); return () => { sessionListeners.delete(listener) } },
      }, available: () => true, locked,
    }))
    await Promise.resolve()
  })
}

async function openModelList() {
  await click(selector('.dsg-chip'))
  assert.ok(selector('.dsg-panel'))
  await click(selector('.dsg-model-picker-trigger'))
  return selector('[role="listbox"]')
}

beforeEach(async () => {
  for (const key of ['window', 'document', 'HTMLElement', 'Node', 'IS_REACT_ACT_ENVIRONMENT']) {
    originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
  }
  jsdomErrors = []
  const virtualConsole = new VirtualConsole()
  virtualConsole.on('jsdomError', error => { jsdomErrors.push(error) })
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true, virtualConsole })
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement,
    Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true,
  })
  ;({ createRoot } = await import('react-dom/client'))
  ;({ GalaxyEffortControl } = await import('../src/adapter/GalaxyEffortControl'))
  const canvasContext = { clearRect() {}, fillRect() {}, setTransform() {}, globalAlpha: 1, fillStyle: '#000' }
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { configurable: true, value: () => canvasContext })
  Object.defineProperty(dom.window.HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value() { return { left: 40, right: 400, top: 500, bottom: 544, width: 360, height: 44, x: 40, y: 500, toJSON() {} } },
  })
  const frames = new Set<number>()
  let nextFrame = 0
  dom.window.requestAnimationFrame = () => { const id = ++nextFrame; frames.add(id); return id }
  dom.window.cancelAnimationFrame = id => { frames.delete(id) }
  container = dom.window.document.getElementById('root') as HTMLDivElement
  root = createRoot(container)
  state = makeState()
  lifecycle = idleSession
  selections = []
  locked = false
  directoryListeners.clear()
  sessionListeners.clear()
  directory = {
    store: {
      getSnapshot: () => state,
      subscribe: listener => { directoryListeners.add(listener); return () => { directoryListeners.delete(listener) } },
    },
    load: async () => state,
    select: async selection => { selections.push({ ...selection }); return { ok: true, value: undefined } },
  }
  await renderControl()
})

afterEach(() => {
  act(() => root.unmount())
  dom.window.close()
  assert.deepEqual(jsdomErrors.map(error => error.message), [])
  for (const [key, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
  originalGlobals.clear()
})

test('one combined chip opens the native model list and selects from a model without reasoning', async () => {
  assert.equal(document.querySelectorAll('.dsg-chip').length, 1)
  await openModelList()
  await click(selector('.dsg-model-picker-option[title="Another plain model"]'))
  assert.deepEqual(selections, [{ provider: 'deepseek', model: 'plain-next' }])
})

test('following provider default from an explicit effort omits reasoningEffort', async () => {
  await renderControl({ state: makeState(automaticRoute) })
  await click(selector('.dsg-chip'))
  await click(selector('.dsg-model-picker-default'))
  assert.deepEqual(selections, [{ provider: 'deepseek', model: 'automatic' }])
})

test('locking disables the combined entry and closes an open panel', async () => {
  await click(selector('.dsg-chip'))
  assert.ok(selector('.dsg-panel'))
  await renderControl({ locked: true })
  assert.equal(selector<HTMLButtonElement>('.dsg-chip').disabled, true)
  assert.equal(selector('.dsg-chip').getAttribute('aria-expanded'), 'false')
  assert.equal(document.querySelector('.dsg-panel'), null)
  await click(selector('.dsg-chip'))
  assert.equal(document.querySelector('.dsg-panel'), null)
})

test('a busy session exposes disabled model options and does not submit', async () => {
  await renderControl({ state: makeState({ provider: 'deepseek', model: 'reasoning', reasoningEffort: 'low' }) })
  await openModelList()
  await renderControl({ session: { ...idleSession, running: true } })
  const target = selector('.dsg-model-picker-option[title="Another plain model"]')
  assert.equal(target.getAttribute('aria-disabled'), 'true')
  await click(target)
  assert.deepEqual(selections, [])
})

test('Escape backs out of model search before closing the combined panel', async () => {
  await openModelList()
  const search = selector('.dsg-model-picker-search')
  assert.equal(document.activeElement, search)
  await key(search, 'Escape')
  assert.ok(selector('.dsg-panel'))
  assert.equal(selector('.dsg-model-picker-trigger').getAttribute('aria-expanded'), 'false')
  assert.equal(document.activeElement, selector('.dsg-model-picker-trigger'))
  await key(selector('.dsg-model-picker-trigger'), 'Escape')
  assert.equal(document.querySelector('.dsg-panel'), null)
  assert.equal(document.activeElement, selector('.dsg-chip'))
})
