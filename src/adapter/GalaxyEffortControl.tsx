import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { GalaxyEffortSlider } from '../ui/GalaxyEffortSlider'
import { commitEffort, deriveEffortView, errorMessage } from './effort'
import type { ModelDirectory, ObservableSnapshot, SessionSnapshot } from './host-contract'

export interface GalaxyEffortInjected {
  readonly directory: ModelDirectory
  readonly session: ObservableSnapshot<SessionSnapshot>
  readonly available: () => boolean
}

/** React boundary observes the SAME native directory used by the model picker. */
export function GalaxyEffortControl({ directory, session, available }: GalaxyEffortInjected) {
  const state = useSyncExternalStore(fn => directory.store.subscribe(fn), () => directory.store.getSnapshot())
  const lifecycle = useSyncExternalStore(fn => session.subscribe(fn), () => session.getSnapshot())
  const [localError, setLocalError] = useState<string>()
  const [saving, setSaving] = useState(false)
  const inFlight = useRef(false)
  const mounted = useRef(true)
  const view = deriveEffortView(state, lifecycle, available())
  const provider = state.current?.provider
  const model = state.current?.model
  useEffect(() => {
    mounted.current = true
    if (available()) void directory.load().catch(error => {
      if (mounted.current) setLocalError(errorMessage(error))
    })
    return () => { mounted.current = false }
  }, [directory, available])
  useEffect(() => { setLocalError(undefined) }, [provider, model, state.current?.reasoningEffort])
  const onCommit = useCallback(async (value: string) => {
    if (!mounted.current) throw new Error('会话已切换，请重新选择推理档位')
    if (inFlight.current) throw new Error('正在保存推理档位')
    if (!provider || !model) throw new Error('请先选择模型')
    inFlight.current = true
    setSaving(true)
    setLocalError(undefined)
    try {
      await commitEffort(directory, () => session.getSnapshot(), { provider, model }, value, available)
    } catch (error) {
      const latest = directory.store.getSnapshot().current
      if (mounted.current && latest?.provider === provider && latest.model === model) setLocalError(errorMessage(error))
      throw error
    } finally {
      inFlight.current = false
      if (mounted.current) setSaving(false)
    }
  }, [directory, session, available, provider, model])

  // Native model selection intentionally does not expose addressed subagents.
  if (!available() || lifecycle.subagent !== null) return null
  return <GalaxyEffortSlider
    key={`${provider ?? ''}/${model ?? ''}`}
    options={view.options}
    value={view.value}
    currentLabel={view.currentLabel}
    modelLabel={view.modelLabel}
    disabled={!!view.disabledReason || saving}
    disabledReason={view.disabledReason}
    pending={view.pending || saving}
    error={localError ?? view.error}
    onCommit={onCommit}
  />
}
