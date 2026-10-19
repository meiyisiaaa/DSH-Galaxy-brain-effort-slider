import test from 'node:test'
import assert from 'node:assert/strict'
import { commitEffort, commitModel, deriveEffortView, selectionDisabledReason } from '../src/adapter/effort'
import type { ModelDirectory, ModelDirectoryState, ModelSelection, SessionSnapshot } from '../src/adapter/host-contract'
const session: SessionSnapshot = { running: false, removed: false, openState: 'open', pendingSubmissions: [], awaitingFirstTurn: false, subagent: null }
const idle: ModelDirectoryState = {
  current: { provider: 'deepseek', model: 'v4', reasoningEffort: 'low' }, routable: true,
  groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'v4', name: 'DeepSeek V4', reasoning: { defaultEffort: 'high', efforts: [{ id: 'off', name: '关闭' }, { id: 'low', name: '低' }, { id: 'high', name: '高' }, { id: 'max', name: '最大' }] } }] }],
  failures: [], status: 'ready', pending: null, error: null,
}
const route = { provider: 'deepseek', model: 'v4' }
function directory(state: ModelDirectoryState = idle) {
  const calls: ModelSelection[] = []
  const dir: ModelDirectory = { store: { getSnapshot: () => state, subscribe: () => () => {} }, load: async () => state, select: async value => { calls.push(value); return { ok: true, value: undefined } } }
  return { dir, calls }
}
test('uses host-owned IDs, names and exact advertised order without invented effort', () => {
  const view = deriveEffortView(idle, session)
  assert.deepEqual(view.options, [{ value: 'off', label: '关闭' }, { value: 'low', label: '低' }, { value: 'high', label: '高' }, { value: 'max', label: '最大' }])
  assert.equal(view.value, 'low'); assert.equal(view.disabledReason, undefined)
})
test('matches provider AND model, not model ID alone', () => {
  const state = { ...idle, current: { provider: 'other', model: 'v4', reasoningEffort: 'ultra' }, groups: [...idle.groups, { id: 'other', name: 'Other', models: [{ id: 'v4', name: 'Other V4', reasoning: { efforts: [{ id: 'ultra', name: 'Provider Ultra' }] } }] }] }
  assert.deepEqual(deriveEffortView(state, session).options, [{ value: 'ultra', label: 'Provider Ultra' }])
})
test('falls back to exact model default when selection has no explicit effort', () => {
  assert.equal(deriveEffortView({ ...idle, current: route }, session).value, 'high')
})
test('does not invent a default when the model has none', () => {
  const state = { ...idle, current: route, groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'v4', name: 'V4', reasoning: { efforts: [{ id: 'custom', name: 'Custom' }] } }] }] }
  assert.equal(deriveEffortView(state, session).value, undefined)
})
test('commits provider-default without a sentinel when reasoning has no default', async () => {
  const state = { ...idle, current: { ...route, reasoningEffort: 'custom' }, groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'v4', name: 'V4', reasoning: { efforts: [] } }] }] }
  const { dir, calls } = directory(state)
  await commitEffort(dir, () => session, route, undefined)
  assert.deepEqual(calls, [route])
})
test('does not allow provider-default for a model without reasoning metadata', async () => {
  const state = { ...idle, groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'v4', name: 'V4' }] }] }
  const { dir, calls } = directory(state)
  await assert.rejects(commitEffort(dir, () => session, route, undefined), /未声明/)
  assert.equal(calls.length, 0)
})
test('does not use provider-default when the current model declares a default', async () => {
  const { dir, calls } = directory()
  await assert.rejects(commitEffort(dir, () => session, route, undefined), /不支持提供方默认/)
  assert.equal(calls.length, 0)
})
test('retains unknown saved effort without selecting a different option', () => {
  const view = deriveEffortView({ ...idle, current: { ...route, reasoningEffort: 'retired' }, retainedEffort: '旧档位' }, session)
  assert.equal(view.value, 'retired'); assert.equal(view.currentLabel, '旧档位')
})
test('unsupported model exposes no options and cannot commit', async () => {
  const state = { ...idle, groups: [{ id: 'deepseek', name: 'DeepSeek', models: [{ id: 'v4', name: 'Plain model' }] }] }
  assert.equal(deriveEffortView(state, session).options.length, 0)
  const { dir, calls } = directory(state)
  await assert.rejects(commitEffort(dir, () => session, route, 'high'), /未声明/)
  assert.equal(calls.length, 0)
})
test('successful commit submits full exact native selection', async () => {
  const { dir, calls } = directory()
  await commitEffort(dir, () => session, route, 'max')
  assert.deepEqual(calls, [{ ...route, reasoningEffort: 'max' }])
})
test('unchanged effective effort does not generate a request', async () => {
  const { dir, calls } = directory()
  await commitEffort(dir, () => session, route, 'low'); assert.equal(calls.length, 0)
})
test('rejects arbitrary and stale effort values before native select', async () => {
  const { dir, calls } = directory()
  await assert.rejects(commitEffort(dir, () => session, route, 'xhigh'), /不支持/)
  assert.equal(calls.length, 0)
})
test('rejects old gesture after the current model changes', async () => {
  const { dir, calls } = directory()
  await assert.rejects(commitEffort(dir, () => session, { ...route, model: 'old' }, 'high'), /模型已改变/)
  assert.equal(calls.length, 0)
})
for (const [label, patch] of Object.entries({ running: { running: true }, pending: { pendingSubmissions: [{}] }, firstTurn: { awaitingFirstTurn: true }, removed: { removed: true }, cold: { openState: 'cold' }, subagent: { subagent: { address: 'child' } } })) {
  test(`rechecks ${label} session state at commit time`, async () => {
    const { dir, calls } = directory()
    await assert.rejects(commitEffort(dir, () => ({ ...session, ...patch } as SessionSnapshot), route, 'high'))
    assert.equal(calls.length, 0)
  })
}
test('rechecks session availability at commit time', async () => {
  const { dir, calls } = directory()
  await assert.rejects(commitEffort(dir, () => session, route, 'high', () => false), /子代理/)
  assert.equal(calls.length, 0)
})
test('rejects while another native selection is pending', async () => {
  const { dir, calls } = directory({ ...idle, status: 'selecting', pending: { ...route, reasoningEffort: 'high' } })
  await assert.rejects(commitEffort(dir, () => session, route, 'max'), /保存/)
  assert.equal(calls.length, 0)
})
test('preserves native failure and allows retry with known live route', async () => {
  const { dir } = directory({ ...idle, status: 'error', error: 'previous failure' })
  dir.select = async () => ({ ok: false, error: { code: 'session/writer-held', message: 'busy writer' } })
  await assert.rejects(commitEffort(dir, () => session, route, 'high'), /其他 DSH 实例/)
})
test('failure does not optimistically mutate current host state', async () => {
  const { dir } = directory()
  dir.select = async () => ({ ok: false, error: { code: 'session/model-unavailable', message: 'invalid route' } })
  await assert.rejects(commitEffort(dir, () => session, route, 'high'), /invalid route/)
  assert.equal(dir.store.getSnapshot().current?.reasoningEffort, 'low')
})
test('catalog failure is distinct from loading and directs native retry', () => {
  const view = deriveEffortView({ ...idle, status: 'error', routable: null, error: 'network failure' }, session)
  assert.match(view.disabledReason!, /失败.*重试/)
  assert.equal(view.error, 'network failure')
})
test('failed session open is reported as a failure, not as "connecting"', () => {
  const failed = deriveEffortView(idle, { ...session, openState: 'error' })
  assert.match(failed.disabledReason!, /失败/)
  assert.doesNotMatch(failed.disabledReason!, /正在连接会话/)
})
test('in-flight session open still reads as connecting', () => {
  assert.match(deriveEffortView(idle, { ...session, openState: 'loading' }).disabledReason!, /正在连接会话/)
  assert.match(deriveEffortView(idle, { ...session, openState: 'cold' }).disabledReason!, /正在连接会话/)
})

const target = { provider: 'deepseek', model: 'v5' }
const withTarget: ModelDirectoryState = {
  ...idle,
  groups: [{ id: 'deepseek', name: 'DeepSeek', models: [
    idle.groups[0]!.models[0]!,
    { id: 'v5', name: 'DeepSeek V5', reasoning: { defaultEffort: 'high', efforts: [{ id: 'low', name: 'Low' }] } },
  ] }],
}
test('native model commit selects the catalog default effort', async () => {
  const { dir, calls } = directory(withTarget)
  await commitModel(dir, () => session, route, target)
  assert.deepEqual(calls, [{ ...target, reasoningEffort: 'high' }])
})
test('native model commit omits reasoningEffort when target has no default', async () => {
  const state = { ...withTarget, groups: [{ id: 'deepseek', name: 'DeepSeek', models: [
    ...withTarget.groups[0]!.models,
    { id: 'v6', name: 'DeepSeek V6', reasoning: { efforts: [{ id: 'low', name: 'Low' }] } },
  ] }] }
  const { dir, calls } = directory(state)
  await commitModel(dir, () => session, route, { provider: 'deepseek', model: 'v6' })
  assert.deepEqual(calls, [{ provider: 'deepseek', model: 'v6' }])
})
test('native model commit can select from no current route', async () => {
  const state = { ...withTarget, current: null, routable: false }
  const { dir, calls } = directory(state)
  assert.equal(selectionDisabledReason(state, session), undefined)
  await commitModel(dir, () => session, null, target)
  assert.deepEqual(calls, [{ ...target, reasoningEffort: 'high' }])
})
test('native model commit can replace a current route that is not routable', async () => {
  const state = { ...withTarget, routable: false }
  const { dir, calls } = directory(state)
  await commitModel(dir, () => session, route, target)
  assert.deepEqual(calls, [{ ...target, reasoningEffort: 'high' }])
})
test('rejects native model commit after an external selection change', async () => {
  const state = { ...withTarget, current: { provider: 'deepseek', model: 'v5' } }
  const { dir, calls } = directory(state)
  await assert.rejects(commitModel(dir, () => session, route, { provider: 'deepseek', model: 'v4' }), /模型已改变/)
  assert.equal(calls.length, 0)
})
test('rejects native model targets that are no longer in the current catalog', async () => {
  const { dir, calls } = directory(withTarget)
  await assert.rejects(commitModel(dir, () => session, route, { provider: 'deepseek', model: 'removed' }), /不可用/)
  assert.equal(calls.length, 0)
})
test('rechecks a busy session before native model selection', async () => {
  const { dir, calls } = directory(withTarget)
  await assert.rejects(commitModel(dir, () => ({ ...session, running: true }), route, target), /任务进行中/)
  assert.equal(calls.length, 0)
})
test('rechecks a pending native selection before model selection', async () => {
  const { dir, calls } = directory({ ...withTarget, status: 'selecting', pending: target })
  await assert.rejects(commitModel(dir, () => session, route, target), /切换模型/)
  assert.equal(calls.length, 0)
})
test('blocks native model selection until the catalog has loaded', async () => {
  const { dir, calls } = directory({ ...withTarget, status: 'loading' })
  await assert.rejects(commitModel(dir, () => session, route, target), /读取模型菜单/)
  assert.equal(calls.length, 0)
})
test('same model selection preserves the current effort without a request', async () => {
  const { dir, calls } = directory(withTarget)
  await commitModel(dir, () => session, route, route)
  assert.equal(calls.length, 0)
})
test('native selection failure reports host error without mutating current state', async () => {
  const { dir, calls } = directory(withTarget)
  dir.select = async value => {
    calls.push(value)
    return { ok: false, error: { code: 'session/model-unavailable', message: 'invalid route' } }
  }
  await assert.rejects(commitModel(dir, () => session, route, target), /invalid route/)
  assert.deepEqual(calls, [{ ...target, reasoningEffort: 'high' }])
  assert.deepEqual(dir.store.getSnapshot().current, idle.current)
})
