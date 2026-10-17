import type { HostContext } from './adapter/host-contract'
const styles = new Map<string, string>()
/** Build-generated stylesheet modules register text; evaluating the factory does not touch the DOM. */
export function registerStyle(id: string, css: string): void { styles.set(id, css) }
/** Cordis owns style lifetime, including plugin unload/reload. */
export function mountStyles(ctx: HostContext): void {
  ctx.effect(() => {
    const tags: HTMLStyleElement[] = []
    for (const [id, css] of styles) {
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-galaxy-effort-slider'
      tag.dataset.pluginCss = `dsh-galaxy-effort-slider/${id}`
      tag.textContent = css
      document.head.appendChild(tag)
      tags.push(tag)
    }
    return () => { for (const tag of tags) tag.remove() }
  }, 'galaxy-effort: styles')
}
