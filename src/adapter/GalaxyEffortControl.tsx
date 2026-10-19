import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GalaxyEffortSlider } from '../ui/GalaxyEffortSlider'
import { GalaxyModelPicker } from '../ui/GalaxyModelPicker'
import { commitEffort, commitModel, deriveEffortView, errorMessage, selectedModel, selectionDisabledReason } from './effort'
import type { ModelDirectory, ModelSelection, ObservableSnapshot, SessionSnapshot } from './host-contract'

export interface GalaxyEffortInjected {
  readonly directory: ModelDirectory
  readonly session: ObservableSnapshot<SessionSnapshot>
  readonly available: () => boolean
  readonly locked?: boolean
}

/** Both controls observe and submit through the native model directory. */
export function GalaxyEffortControl({ directory, session, available, locked = false }: GalaxyEffortInjected) {
  const state = useSyncExternalStore(fn => directory.store.subscribe(fn), () => directory.store.getSnapshot())
  const lifecycle = useSyncExternalStore(fn => session.subscribe(fn), () => session.getSnapshot())
  const [loadError, setLoadError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const ownerLocked = useRef(locked)
  ownerLocked.current = locked
  const lastAction = useRef<'model' | 'effort' | 'reload'>()
  const view = deriveEffortView(state, lifecycle, available())
  const model = selectedModel(state)
  const providerId = state.current?.provider
  const modelId = state.current?.model
  const disabledReason = locked ? '当前无法切换模型' : selectionDisabledReason(state, lifecycle, available())
  useEffect(() => {
    mounted.current = true
    if (available()) void directory.load().catch(error => {
      if (mounted.current) setLoadError(errorMessage(error))
    })
    return () => { mounted.current = false }
  }, [directory, available])
  useEffect(() => { setLoadError(undefined) }, [providerId, modelId, state.current?.reasoningEffort])
  useEffect(() => { if (state.status === 'ready') lastAction.current = undefined }, [state.status])
  const runSelection = useCallback(async (kind: 'model' | 'effort', action: () => Promise<void>) => {
    if (!mounted.current) throw new Error('会话已切换，请重新选择')
    if (ownerLocked.current) throw new Error('当前无法切换模型')
    if (inFlight.current) throw new Error('正在保存模型设置')
    inFlight.current = true
    lastAction.current = kind
    setSaving(true)
    setLoadError(undefined)
    try { await action() }
    finally {
      inFlight.current = false
      if (mounted.current) setSaving(false)
    }
  }, [])
  const onCommit = useCallback(async (value: string | undefined) => {
    if (!providerId || !modelId) throw new Error('请先选择模型')
    await runSelection('effort', () => commitEffort(directory, () => session.getSnapshot(), { provider: providerId, model: modelId }, value, available))
  }, [directory, session, available, providerId, modelId, runSelection])
  const onSelect = useCallback(async (target: Pick<ModelSelection, 'provider' | 'model'>) => {
    const expected = providerId && modelId ? { provider: providerId, model: modelId } : null
    await runSelection('model', () => commitModel(directory, () => session.getSnapshot(), expected, target, available))
  }, [directory, session, available, providerId, modelId, runSelection])
  const onReload = useCallback(async () => {
    lastAction.current = 'reload'
    setLoadError(undefined)
    await directory.load()
  }, [directory])

  // Native model selection does not expose addressed subagents.
  if (!available() || lifecycle.subagent !== null) return null
  return <GalaxyEffortSlider
    options={view.options}
    value={view.value}
    currentLabel={view.currentLabel}
    modelLabel={view.modelLabel}
    selectionKey={JSON.stringify([providerId, modelId])}
    triggerLabel={view.modelLabel ?? modelId ?? '选择模型'}
    triggerDisabled={locked}
    disabled={!!view.disabledReason || saving || locked}
    disabledReason={locked ? disabledReason : view.disabledReason}
    pending={view.pending || saving}
    error={loadError && !state.error ? loadError : undefined}
    onCommit={onCommit}
    modelPicker={<GalaxyModelPicker
      state={state}
      hideSelectionError={lastAction.current === 'effort'}
      disabled={!!disabledReason || saving}
      onSelect={onSelect}
      onReload={onReload}
      onDefault={model?.reasoning && model.reasoning.defaultEffort === undefined ? () => onCommit(undefined) : undefined}
    />}
  />
}
