/**
 * Minimal structural view of the public DeepSeek Harness client contract.
 * Source-verified against dsh-v0.2.0-rc.2 / 639ed015397290b3745d163aafe02ffee4aa3f84.
 * See docs/UPSTREAM-RC2.json for audited source hashes and COMPATIBILITY.md for the diff.
 * No host implementation or replacement services are bundled here.
 * This is intentionally a subset, not a claim to cover the full upstream API.
 */
import type { ComponentType } from 'react'

export interface ObservableSnapshot<T> {
  subscribe(listener: () => void): () => void
  getSnapshot(): T
}
export interface ModelSelection {
  readonly provider: string
  readonly model: string
  readonly reasoningEffort?: string
}
export interface ModelCatalogModel {
  readonly id: string
  readonly name: string
  readonly reasoning?: {
    readonly efforts: readonly { readonly id: string; readonly name: string; readonly description?: string }[]
    readonly defaultEffort?: string
  }
}
export interface ModelDirectoryState {
  readonly current: ModelSelection | null
  readonly retainedEffort?: string
  readonly routable: boolean | null
  readonly groups: readonly { readonly id: string; readonly name: string; readonly models: readonly ModelCatalogModel[] }[]
  readonly failures: readonly { readonly id: string; readonly name: string; readonly message: string }[]
  readonly status: 'idle' | 'loading' | 'ready' | 'selecting' | 'error'
  readonly pending: ModelSelection | null
  readonly error: string | null
}
export type RemoteResult = { readonly ok: true; readonly value: unknown } | {
  readonly ok: false; readonly error: { readonly code: string; readonly message: string }
}
export interface ModelDirectory {
  readonly store: ObservableSnapshot<ModelDirectoryState>
  load(): Promise<ModelDirectoryState>
  select(selection: ModelSelection): Promise<RemoteResult>
}
export interface SessionSnapshot {
  readonly running: boolean
  readonly removed: boolean
  readonly openState: 'cold' | 'loading' | 'open' | 'error'
  readonly pendingSubmissions: readonly unknown[]
  readonly awaitingFirstTurn: boolean
  readonly subagent: { readonly address: unknown } | null
}
export interface SessionBinding { readonly session: ObservableSnapshot<SessionSnapshot> }
export interface HostContext {
  readonly modelDirectories: { directoryFor(sessionId: string): ModelDirectory }
  readonly sessions: {
    binding(sessionId: string): SessionBinding | undefined
    subagentAddress(sessionId: string): unknown | undefined
  }
  readonly slots: {
    inject(name: string, callback: () => (() => void)): void
    register<P extends object>(options: {
      name: string; id?: string; order?: number; priority?: number; inject(sessionId: string): P
    }, component: ComponentType<P & { locked?: boolean }>): () => void
  }
  effect(callback: () => (() => void), label?: string): unknown
}
