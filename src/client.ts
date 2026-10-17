import type { HostContext } from './adapter/host-contract'
import { GalaxyEffortControl, type GalaxyEffortInjected } from './adapter/GalaxyEffortControl'
import { mountStyles } from './styles-runtime'

/** Cordis service dependencies, distinct from package-level client graph dependencies. */
export const inject = ['slots', 'modelDirectories', 'sessions']

/** Additive slot contribution: the native model picker remains installed. */
export function apply(ctx: HostContext): void {
  mountStyles(ctx)
  // Wait for the slot declaration; registration and its teardown follow Cordis scope lifetime.
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left',
    id: 'galaxy-effort-slider',
    order: 40,
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
