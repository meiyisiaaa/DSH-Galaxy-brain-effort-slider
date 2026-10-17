/** Thumb physics only. The rail is the reference's CSS pixel nebula. */
export interface GalaxyMotion {
  beginDrag(): void;
  dragTo(progress: number): void;
  settle(progress: number, immediate?: boolean): void;
  cancel(progress: number): void;
  setActive(active: boolean): void;
  setReducedMotion(reduced: boolean): void;
  refreshBounds(): { left: number; width: number };
  bounds(): { left: number; width: number };
  snapshot(): { position: number; target: number; lean: number; energy: number; dragging: boolean; scheduled: boolean };
  dispose(): void;
}
interface MotionElements {
  track: HTMLElement; runway: HTMLElement; thumb: HTMLElement; avatar: HTMLElement; fill: HTMLElement;
}
interface MotionClock {
  raf?: (callback: FrameRequestCallback) => number;
  caf?: (id: number) => void;
  now?: () => number;
}
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));

export function createGalaxyMotion({ track, runway, thumb, avatar, fill }: MotionElements, initial: number, clock: MotionClock = {}): GalaxyMotion {
  const view = track.ownerDocument.defaultView!;
  const raf = clock.raf ?? view.requestAnimationFrame.bind(view);
  const caf = clock.caf ?? view.cancelAnimationFrame.bind(view);
  const now = clock.now ?? (() => view.performance.now());
  let width = 1, left = 0;
  let position = clamp(initial), target = position, velocity = 0;
  let inputVelocity = 0, lean = 0, leanVelocity = 0, press = 0, pressVelocity = 0, energy = 0;
  let dragging = false, active = true, reduced = false, disposed = false;
  let frame: number | null = null, epoch = 0, lastFrame = 0, lastInput = now();
  let paintedThumb = '', paintedFill = '', paintedReveal = '', paintedOpacity = '', paintedAvatar = '', paintedEnergy = '', paintedLean = '', paintedDrift = '';

  function write() {
    if (disposed) return;
    const thumbTransform = `translate3d(${(position * width).toFixed(3)}px,0,0)`;
    const fillWidth = `${(position * 100).toFixed(4)}%`;
    const pixelReveal = `${(position * width).toFixed(3)}px`;
    const fillOpacity = track.dataset.unknown === 'true' ? '0' : position.toFixed(4);
    const avatarTransform = reduced ? 'none' : `translate3d(0,${(-press * 3.8).toFixed(3)}px,0) rotate(${lean.toFixed(3)}deg) scale(${(1 + press * .025).toFixed(4)},${(1 - press * .035).toFixed(4)})`;
    if (thumbTransform !== paintedThumb) thumb.style.transform = paintedThumb = thumbTransform;
    // Only the gradient fill narrows. Pixel positions always use the full rail;
    // a separate clip reveals them, so low tiers never compress the constellation.
    if (fillWidth !== paintedFill) fill.style.width = paintedFill = fillWidth;
    if (pixelReveal !== paintedReveal) track.style.setProperty('--dsg-pixel-reveal', paintedReveal = pixelReveal);
    if (fillOpacity !== paintedOpacity) fill.style.opacity = paintedOpacity = fillOpacity;
    if (avatarTransform !== paintedAvatar) avatar.style.transform = paintedAvatar = avatarTransform;
    if (paintedEnergy !== energy.toFixed(3)) track.style.setProperty('--dsg-energy', paintedEnergy = energy.toFixed(3));
    if (paintedLean !== `${lean.toFixed(3)}deg`) track.style.setProperty('--dsg-lean', paintedLean = `${lean.toFixed(3)}deg`);
    if (paintedDrift !== `${(-lean * 1.4).toFixed(3)}px`) track.style.setProperty('--dsg-drift', paintedDrift = `${(-lean * 1.4).toFixed(3)}px`);
  }
  function requestFrame() {
    if (!disposed && active && !reduced && frame === null) {
      const generation = epoch;
      frame = raf(timestamp => { if (generation === epoch && !disposed) tick(timestamp); });
    }
  }
  function stopFrame() {
    if (frame !== null) caf(frame);
    epoch += 1; frame = null; lastFrame = 0;
  }
  function tick(timestamp: number) {
    frame = null;
    if (disposed || !active || reduced) return;
    const dt = Math.min(1 / 30, lastFrame ? Math.max(0, (timestamp - lastFrame) / 1000) : 1 / 60);
    lastFrame = timestamp;
    const steps = Math.max(1, Math.ceil(dt / (1 / 120))), step = dt / steps;
    if (now() - lastInput > 35) inputVelocity *= Math.exp(-dt * 9);
    const leanTarget = dragging ? clamp(inputVelocity * 2.4, -8, 8) : 0;
    const energyTarget = dragging ? clamp(Math.abs(inputVelocity) / 2.6) : 0;
    energy += (energyTarget - energy) * (1 - Math.exp(-dt * (dragging ? 15 : 7)));
    for (let i = 0; i < steps; i += 1) {
      if (!dragging) {
        velocity += ((target - position) * 440 - velocity * 38) * step;
        position += velocity * step;
        if (position < 0 || position > 1) { position = clamp(position); velocity = 0; }
        if (Math.abs(target - position) < .00003 && Math.abs(velocity) < .0004) { position = target; velocity = 0; }
      }
      leanVelocity += ((leanTarget - lean) * 280 - leanVelocity * 30) * step;
      lean += leanVelocity * step;
      pressVelocity += (((dragging ? 1 : 0) - press) * 420 - pressVelocity * 36) * step;
      press += pressVelocity * step;
    }
    write();
    const moving = Math.abs(target - position) > .00003 || Math.abs(velocity) > .0004
      || Math.abs(lean) > .001 || Math.abs(leanVelocity) > .001 || Math.abs(inputVelocity) > .001
      || Math.abs(press - (dragging ? 1 : 0)) > .0001 || Math.abs(pressVelocity) > .001 || energy > .001;
    if (moving) requestFrame(); else lastFrame = 0;
  }
  function refreshBounds() {
    if (disposed) return { left, width };
    const rect = runway.getBoundingClientRect();
    left = rect.left; width = Math.max(1, rect.width); write();
    return { left, width };
  }
  function settle(progress: number, immediate = false) {
    if (disposed) return;
    dragging = false; target = clamp(progress);
    velocity = clamp(inputVelocity, -.35, .35); inputVelocity = 0;
    track.dataset.settling = String(!immediate && !reduced);
    track.style.setProperty('--dsg-progress', String(target));
    if (immediate || reduced || !active) {
      position = target; velocity = lean = leanVelocity = press = pressVelocity = 0; write();
    }
    requestFrame();
  }
  const controller: GalaxyMotion = {
    beginDrag() {
      if (disposed) return;
      refreshBounds(); dragging = true; velocity = inputVelocity = 0; lastInput = now();
      track.dataset.settling = 'false'; requestFrame();
    },
    dragTo(progress) {
      if (disposed) return;
      const next = clamp(progress), time = now();
      const elapsed = Math.max(1 / 120, Math.min(.08, (time - lastInput) / 1000));
      const measured = clamp((next - position) / elapsed, -9, 9);
      inputVelocity += (measured - inputVelocity) * .38;
      position = target = next; lastInput = time;
      track.style.setProperty('--dsg-progress', String(next)); write(); requestFrame();
    },
    settle,
    cancel(progress) { inputVelocity = velocity = 0; settle(progress); },
    setActive(next) {
      if (disposed) return;
      active = next; track.dataset.motionActive = String(next);
      if (!active) { stopFrame(); dragging = false; position = target; velocity = inputVelocity = lean = leanVelocity = press = pressVelocity = energy = 0; write(); }
      else { lastFrame = 0; requestFrame(); }
    },
    setReducedMotion(next) {
      if (disposed || reduced === next) return;
      reduced = next;
      if (reduced) { stopFrame(); position = target; velocity = lean = leanVelocity = press = pressVelocity = energy = 0; write(); }
      else requestFrame();
    },
    refreshBounds,
    bounds: () => ({ left, width }),
    snapshot: () => ({ position, target, lean, energy, dragging, scheduled: frame !== null }),
    dispose() { if (disposed) return; disposed = true; stopFrame(); },
  };
  refreshBounds(); requestFrame();
  return controller;
}
