import React, { useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { GalaxyEffortControl } from '../src/adapter/GalaxyEffortControl'
import { mountStyles } from '../src/styles-runtime'
import type { ModelDirectory, ModelDirectoryState, ObservableSnapshot, SessionSnapshot, HostContext } from '../src/adapter/host-contract'
import './preview.css'
function store<T>(initial: T): ObservableSnapshot<T> & { set(next: T): void } {
  let state = initial
  const listeners = new Set<() => void>()
  return { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, set(next) { state = next; listeners.forEach(fn => fn()) } }
}
const initial: ModelDirectoryState = {
  current: { provider: 'deepseek', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
  groups: [
    { id: 'deepseek', name: 'DeepSeek', models: [
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', reasoning: { defaultEffort: 'high', efforts: [{ id: 'off', name: 'Off' }, { id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] } },
      { id: 'deepseek-flex', name: 'DeepSeek Flex', reasoning: { efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }, { id: 'max', name: 'Max' }] } },
      { id: 'deepseek-chat', name: 'DeepSeek Chat' },
    ] },
    { id: 'alternate', name: 'Alternate Provider', models: [{ id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } }] },
  ],
  routable: true, failures: [], status: 'ready', pending: null, error: null,
}
const directoryStore = store(initial)
const session = store<SessionSnapshot>({ running: false, removed: false, openState: 'open', pendingSubmissions: [], awaitingFirstTurn: false, subagent: null })
let failNext = false
let latency = 750
let calls: unknown[] = []
const directory: ModelDirectory = {
  store: directoryStore,
  load: async () => directoryStore.getSnapshot(),
  select: async selection => {
    calls.push(selection)
    directoryStore.set({ ...directoryStore.getSnapshot(), status: 'selecting', pending: selection, error: null })
    await new Promise(resolve => setTimeout(resolve, latency))
    if (failNext) {
      failNext = false
      directoryStore.set({ ...directoryStore.getSnapshot(), status: 'error', pending: null, error: '模拟保存失败：请重试' })
      return { ok: false, error: { code: 'preview/save-failed', message: '模拟保存失败：请重试' } }
    }
    directoryStore.set({ ...directoryStore.getSnapshot(), current: selection, routable: true, status: 'ready', pending: null, error: null })
    return { ok: true, value: undefined }
  },
}
const available = () => true
const cleanups: (() => void)[] = []
mountStyles({ effect(fn) { cleanups.push(fn()) } } as unknown as HostContext)
window.addEventListener('pagehide', () => cleanups.forEach(fn => fn()))
;(window as unknown as { __GALAXY_QA__: unknown }).__GALAXY_QA__ = {
  directory, session, directoryStore, initial, get calls() { return calls }, clearCalls() { calls = [] },
  setLatency(ms: number) { latency = ms }, failNext() { failNext = true },
}
function Preview() {
  const state = useSyncExternalStore(directoryStore.subscribe, directoryStore.getSnapshot)
  const currentSession = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const [dark, setDark] = useState(false)
  const [failureArmed, setFailureArmed] = useState(false)
  return <main className={dark ? 'qa dark' : 'qa'}>
    <header className="qa-header"><span>DEEPSEEK HARNESS</span><span>GALAXY EFFORT</span></header>
    <section className="qa-stage">
      <div className="qa-eyebrow">THINKING, WITH A LITTLE STARDUST</div>
      <h1>把思考交给星河。</h1>
      <p>在同一处选择模型，沿着银河调整思考力度。</p>
      <div className="qa-composer">
        <textarea aria-label="消息输入预览" placeholder="今天，想一起探索什么？" />
        <div className="qa-toolbar"><GalaxyEffortControl directory={directory} session={session} available={available} /><button className="qa-send" aria-label="预览发送，不发送请求">↑</button></div>
      </div>
      <div className="qa-caption">银河推理滑块 · 原生插件组件预览</div>
    </section>
    <section className="qa-panel" aria-label="验收控制台">
      <div className="qa-notice">本地验收：模拟 Host 数据，不连接真实 DeepSeek，不消耗额度。</div>
      <div className="qa-actions">
        <button onClick={() => setDark(!dark)}>切换{dark ? '浅色' : '深色'}</button>
        <button onClick={() => session.set({ ...session.getSnapshot(), running: !currentSession.running })}>任务{currentSession.running ? '结束' : '运行中'}</button>
        <button onClick={() => { failNext = true; setFailureArmed(true) }}>{failureArmed ? '下一次切换将失败' : '模拟下一次失败'}</button>
        <button onClick={() => { directoryStore.set({ ...initial, current: { ...initial.current!, reasoningEffort: 'low' } }); setFailureArmed(false) }}>原生菜单同步 Low</button>
        <button onClick={() => directoryStore.set({ ...initial, current: { provider: 'deepseek', model: 'deepseek-chat' } })}>无推理能力</button>
        <button onClick={() => directoryStore.set({ ...initial, current: { ...initial.current!, reasoningEffort: 'retired' }, retainedEffort: '旧档位' })}>未知旧档位</button>
        <button onClick={() => { directoryStore.set(initial); session.set({ ...session.getSnapshot(), running: false }); failNext = false; setFailureArmed(false) }}>重置</button>
      </div>
      <output data-testid="host-selection">Host 当前值：{state.current?.reasoningEffort ?? 'default'} · 状态：{state.status} · 任务：{currentSession.running ? 'running' : 'idle'}</output>
    </section>
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
