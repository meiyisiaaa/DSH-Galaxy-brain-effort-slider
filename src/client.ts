import type { HostContext } from './adapter/host-contract'
import { GalaxyEffortControl, type GalaxyEffortInjected } from './adapter/GalaxyEffortControl'
import { mountStyles } from './styles-runtime'

/** Cordis service dependencies, distinct from package-level client graph dependencies. */
export const inject = ['slots', 'modelDirectories', 'sessions']

/** Replace the native model picker while keeping the shared model directory. */
export function apply(ctx: HostContext): void {
  mountStyles(ctx)
  // Wait for the slot declaration; registration and its teardown follow Cordis scope lifetime.
  ctx.slots.inject('conversation.input.model', () => ctx.slots.register({
    name: 'conversation.input.model',
    priority: -1,
    inject(sessionId: string): GalaxyEffortInjected {
      const binding = ctx.sessions.binding(sessionId)
      if (!binding) throw new Error('galaxy-effort: 当前会话尚未绑定')
      return {
        directory: ctx.modelDirectories.directoryFor(sessionId),
        session: binding.session,
        available: () => ctx.sessions.subagentAddress(sessionId) === undefined,
      }
    },
  }, GalaxyEffortControl))
}
