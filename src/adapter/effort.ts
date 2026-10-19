import type { EffortOption } from '../ui-contract'
import type { ModelDirectory, ModelDirectoryState, ModelSelection, SessionSnapshot } from './host-contract'

export interface EffortView {
  readonly options: readonly EffortOption[]
  readonly value: string | undefined
  readonly currentLabel: string | undefined
  readonly modelLabel: string | undefined
  readonly disabledReason: string | undefined
  readonly pending: boolean
  readonly error: string | undefined
}

export function selectedModel(state: ModelDirectoryState) {
  const current = state.current
  if (!current) return undefined
  return state.groups.find(group => group.id === current.provider)?.models.find(model => model.id === current.model)
}

/** Reasons that prevent the native model selector from submitting a choice. */
export function selectionDisabledReason(state: ModelDirectoryState, session: SessionSnapshot, available = true): string | undefined {
  if (!available || session.subagent !== null) return '子代理会话不支持独立切换'
  if (session.removed) return '该会话已移除'
  if (session.openState === 'error') return '会话加载失败，请切换会话后重试'
  if (session.openState !== 'open') return '正在连接会话'
  if (session.running || session.awaitingFirstTurn || session.pendingSubmissions.length > 0) return '任务进行中，结束后可切换模型'
  if (state.status === 'selecting' || state.pending !== null) return '正在切换模型'
  if (state.status === 'idle' || state.status === 'loading') return '正在读取模型菜单'
  if (state.status === 'error' && state.groups.length === 0) return '读取模型菜单失败，请重试'
  return undefined
}

/** Match the exact provider/model pair; keep adapter-owned order and vocabulary. */
export function deriveEffortView(state: ModelDirectoryState, session: SessionSnapshot, available = true): EffortView {
  const model = selectedModel(state)
  const options = model?.reasoning?.efforts.map(effort => ({ value: effort.id, label: effort.name })) ?? []
  const value = state.current?.reasoningEffort ?? model?.reasoning?.defaultEffort
  const pending = state.status === 'selecting' || state.pending !== null
  let disabledReason: string | undefined
  if (!available || session.subagent !== null) disabledReason = '子代理会话不支持独立切换推理档位'
  else if (session.removed) disabledReason = '该会话已移除'
  // The host separates a failed open from an in-flight one: 'error' only clears
  // through a session switch or reconnect, so it must not read as "connecting".
  else if (session.openState === 'error') disabledReason = '会话加载失败，请切换会话后重试'
  else if (session.openState !== 'open') disabledReason = '正在连接会话'
  else if (session.running || session.awaitingFirstTurn || session.pendingSubmissions.length > 0) disabledReason = '任务进行中，结束后可切换档位'
  else if (pending) disabledReason = '正在保存推理档位'
  else if (state.status === 'error' && state.routable === null) disabledReason = '读取模型档位失败，请打开模型菜单重试'
  else if (state.status === 'loading' || state.status === 'idle' || state.routable === null) disabledReason = '正在读取模型档位'
  else if (!state.current || !model || !state.routable) disabledReason = '请先在模型菜单选择可用模型'
  else if (options.length === 0) disabledReason = '此模型未声明可调推理档位'
  return {
    options, value,
    currentLabel: options.find(option => option.value === value)?.label ?? state.retainedEffort,
    modelLabel: model?.name,
    disabledReason, pending, error: state.error ?? undefined,
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') return error.message
  return '推理档位未保存，请重试'
}

/**
 * Re-read every state at commit time. Never submit an old gesture to a newly
 * selected model, to a busy session, or as an arbitrary effort string.
 * native select also updates the host's future-session default.
 */
export async function commitEffort(
  directory: ModelDirectory,
  getSession: () => SessionSnapshot,
  expected: Pick<ModelSelection, 'provider' | 'model'>,
  effort: string | undefined,
  available: () => boolean = () => true,
): Promise<void> {
  const state = directory.store.getSnapshot()
  const session = getSession()
  const view = deriveEffortView(state, session, available())
  const model = selectedModel(state)
  const providerDefault = effort === undefined && model?.reasoning !== undefined && model.reasoning.defaultEffort === undefined
  if (view.disabledReason && !(providerDefault && view.disabledReason === '此模型未声明可调推理档位')) throw new Error(view.disabledReason)
  const current = state.current
  if (!current || current.provider !== expected.provider || current.model !== expected.model) {
    throw new Error('模型已改变，请重新选择推理档位')
  }
  if (effort === undefined) {
    if (!providerDefault) throw new Error('该模型不支持提供方默认推理档位')
  } else if (!view.options.some(option => option.value === effort)) throw new Error('该模型不支持此推理档位')
  if (view.value === effort) return
  const result = await directory.select({
    provider: current.provider, model: current.model,
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  })
  throwSelectionError(result)
}

/** Commit a native provider/model choice without replacing the shared directory state. */
export async function commitModel(
  directory: ModelDirectory,
  getSession: () => SessionSnapshot,
  expected: Pick<ModelSelection, 'provider' | 'model'> | null,
  target: Pick<ModelSelection, 'provider' | 'model'>,
  available: () => boolean = () => true,
): Promise<void> {
  const state = directory.store.getSnapshot()
  const session = getSession()
  const disabledReason = selectionDisabledReason(state, session, available())
  if (disabledReason) throw new Error(disabledReason)
  const model = state.groups.find(group => group.id === target.provider)?.models.find(candidate => candidate.id === target.model)
  if (!model) throw new Error('所选模型已不可用，请重新选择模型')
  const current = state.current
  if ((expected === null && current !== null)
    || (expected !== null && (current === null || current.provider !== expected.provider || current.model !== expected.model))) {
    throw new Error('模型已改变，请重新选择模型')
  }
  if (current?.provider === target.provider && current.model === target.model) return
  const result = await directory.select({
    provider: target.provider, model: target.model,
    ...(model.reasoning?.defaultEffort === undefined ? {} : { reasoningEffort: model.reasoning.defaultEffort }),
  })
  throwSelectionError(result)
}

function throwSelectionError(result: Awaited<ReturnType<ModelDirectory['select']>>): void {
  if (!result.ok) {
    if (result.error.code === 'session/writer-held') throw new Error('会话正由其他 DSH 实例使用，请退出其他实例后重试')
    throw new Error(`${result.error.code}: ${result.error.message}`)
  }
}
