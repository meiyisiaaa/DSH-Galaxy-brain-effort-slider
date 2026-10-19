import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { GalaxyEffortSliderProps } from '../ui-contract';
import bundledAvatar from '../assets/deepseek-whale-girl-atlas.webp';
import { createGalaxyMotion, type GalaxyMotion } from './galaxy-motion';
import './GalaxyEffortSlider.css';

const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const progressFor = (index: number, count: number) => count > 1 && index >= 0 ? index / (count - 1) : 0.5;
const isOff = (value: string | undefined) => value === 'off' || value === 'none';
// Motion Atlas positions/palette. Negative, varied phases make independent stars
// visibly twinkle from first paint; both seamless copies share those exact phases.
const referencePixels = Array.from({ length: 110 }, (_, index) => ({
  left: `${index * 37 % 100}%`, top: `${index * 19 % 100}%`,
  background: ['#bd86ff', '#79dcfc', '#fe9acf'][index % 3],
  animationDelay: `${-((index * 23) % 41) * .1}s`,
  animationDuration: `${1.5 + (index * 7 % 16) * .1}s`,
}));
const referencePixelGroups = [
  referencePixels.filter((_, index) => index % 5 === 0),
  referencePixels.filter((_, index) => index % 5 !== 0 && index % 3 === 0),
  referencePixels.filter((_, index) => index % 5 !== 0 && index % 3 !== 0),
];
const foregroundPixels = Array.from({ length: 12 }, (_, index) => ({
  left: `${(index * 29 + 8) % 100}%`, top: `${(index * 17 + 11) % 100}%`,
  background: ['#d4b2ff', '#b0ecff', '#ffc3e5'][index % 3],
  animationDelay: `${-((index * 13) % 29) * .1}s`,
  animationDuration: `${1.6 + (index * 3 % 12) * .1}s`,
}));
// Built once: a drag re-renders on every tier change, and a stable element keeps
// React from diffing the whole starfield subtree each time.
const backgroundPixels = (
  <span className="dsg-pixel-stream dsg-pixel-background">{[0, 1].map(copy =>
    <span key={copy} className="dsg-pixel-cell">{referencePixelGroups.map((group, depth) =>
      <span key={depth} className="dsg-pixel-group" data-depth={depth}>{group.map((style, index) => <i key={index} style={style}/>)}</span>
    )}</span>
  )}</span>
);
const foregroundStream = (
  <span className="dsg-pixel-stream dsg-pixel-foreground">{[0, 1].map(copy =>
    <span key={copy} className="dsg-pixel-cell">{foregroundPixels.map((style, index) => <i key={index} style={style}/>)}</span>
  )}</span>
);

/** A controlled capability picker. Only the host's advertised options can be committed. */
export function GalaxyEffortSlider(props: GalaxyEffortSliderProps) {
  const { options, value, disabled, pending, modelLabel, disabledReason } = props;
  const avatarSrc = props.avatarSrc ?? bundledAvatar;
  const id = useId();
  const [open, setOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const [announcement, setAnnouncement] = useState('');
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || !document.hidden);
  const [anchorVisible, setAnchorVisible] = useState(true);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [burst, setBurst] = useState(0);
  const [celebration, setCelebration] = useState<{ value: string; context: string } | null>(null);
  // Every viewport scroll event recomputes geometry; most produce the identical box.
  // Returning the previous object keeps React from re-rendering the whole panel.
  const [position, setPositionRaw] = useState<CSSProperties>({ visibility: 'hidden' });
  const setPosition = useCallback((next: CSSProperties) => {
    setPositionRaw(previous => {
      const keys = Object.keys(next) as (keyof CSSProperties)[];
      const sameLength = keys.length === Object.keys(previous).length;
      return sameLength && keys.every(key => previous[key] === next[key]) ? previous : next;
    });
  }, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const runwayRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<GalaxyMotion | null>(null);
  const railVisible = useRef(true);
  const visibility = useRef({ page: pageVisible, anchor: anchorVisible });
  visibility.current = { page: pageVisible, anchor: anchorVisible };
  const latest = useRef(props);
  latest.current = props;
  const alive = useRef(true);
  const commitSequence = useRef(0);
  const busyRef = useRef(false);
  const pendingChoice = useRef<{ value: string; previous: string | undefined; context: string } | null>(null);
  const drag = useRef<{ id: number; lastX: number; context: string } | null>(null);
  const draftIndex = useRef<number | null>(null);
  const committedIndex = useMemo(() => options.findIndex(option => option.value === value), [options, value]);
  // Cheap identity for "which capability set is this gesture about". A drag re-renders on
  // every tier change, so the string build stays out of that path once options settle.
  const capabilityKey = useMemo(
    () => JSON.stringify([modelLabel, options.map(option => [option.value, option.label])]),
    [modelLabel, options],
  );
  const capabilityRef = useRef(capabilityKey);
  capabilityRef.current = capabilityKey;
  const busy = pending || localBusy;
  const unavailable = (disabled && !busy) || options.length === 0;
  const canChange = !disabled && options.length > 0 && !busy;
  const displayedIndex = previewIndex ?? committedIndex;
  const selected = options[displayedIndex];
  const enabledOptions = useMemo(() => options.filter(option => !isOff(option.value)), [options]);
  const visualLevel = clamp(enabledOptions.findIndex(option => option.value === selected?.value) / Math.max(1, enabledOptions.length - 1));
  const density = displayedIndex < 0 ? 'unknown' : isOff(selected?.value) ? 'off'
    : visualLevel === 1 ? 'max' : visualLevel > 0 ? 'high' : 'low';
  const currentLabel = options[committedIndex]?.label
    ?? props.currentLabel
    ?? (value ? '当前档位不可用' : '跟随默认');
  const shownError = busy ? undefined : localError || props.error;
  const helpText = busy && selected ? `正在更新为 ${selected.label}`
    : unavailable ? disabledReason || '当前模型未提供可调整的思考力度。'
    : undefined;
  const expression = displayedIndex >= 0 && options.length > 1
    ? (displayedIndex === options.length - 1 ? 2 : displayedIndex / (options.length - 1) < 0.5 ? 0 : 1)
    : 0;
  const avatarIsAtlas = props.avatarLayout === 'triptych' || !props.avatarSrc;
  // Full-width CJK glyphs count double; per-render charCode scanning is not worth repeating.
  const denseLabels = useMemo(() => options.length > 4
    || options.some(option => [...option.label].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 2 : 1), 0) > 8), [options]);

  const paintProgress = useCallback((progress: number, animate: boolean) => {
    if (!trackRef.current) return;
    if (animate) motionRef.current?.settle(progress);
    else motionRef.current?.dragTo(progress);
  }, []);

  const resetVisual = useCallback(() => {
    const current = latest.current;
    const index = current.options.findIndex(option => option.value === current.value);
    const attempted = busyRef.current && pendingChoice.current?.context === capabilityRef.current
      ? current.options.findIndex(option => option.value === pendingChoice.current?.value) : -1;
    draftIndex.current = null;
    setPreviewIndex(attempted >= 0 ? attempted : null);
    paintProgress(progressFor(attempted >= 0 ? attempted : index, current.options.length), true);
    if (trackRef.current) trackRef.current.dataset.dragging = 'false';
  }, [paintProgress]);

  const cancelDrag = useCallback(() => {
    const active = drag.current;
    drag.current = null;
    if (active && trackRef.current?.hasPointerCapture?.(active.id)) {
      trackRef.current.releasePointerCapture(active.id);
    }
    resetVisual();
    if (active) {
      const current = latest.current;
      motionRef.current?.cancel(progressFor(current.options.findIndex(option => option.value === current.value), current.options.length));
    }
  }, [resetVisual]);

  const closePopover = useCallback((restoreFocus = false) => {
    cancelDrag();
    setBurst(0);
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  }, [cancelDrag]);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; commitSequence.current += 1; };
  }, []);

  useLayoutEffect(() => {
    if (!open || !trackRef.current || !runwayRef.current) return;
    const track = trackRef.current;
    const current = latest.current;
    const controller = createGalaxyMotion({
      track, runway: runwayRef.current,
      thumb: track.querySelector<HTMLElement>('.dsg-thumb')!,
      avatar: track.querySelector<HTMLElement>('.dsg-avatar')!,
      fill: track.querySelector<HTMLElement>('.dsg-galaxy-fill')!,
      starfield: track.querySelector<HTMLElement>('.dsg-starfield')!,
      wake: track.querySelector<HTMLElement>('.dsg-pixel-wake')!,
      halo: track.querySelector<HTMLElement>('.dsg-thumb-halo')!,
    }, progressFor(current.options.findIndex(option => option.value === current.value), current.options.length));
    motionRef.current = controller;
    railVisible.current = true;
    controller.setActive(visibility.current.page && visibility.current.anchor);
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotionPreference = () => controller.setReducedMotion(media?.matches ?? false);
    onMotionPreference();
    media?.addEventListener('change', onMotionPreference);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (motionRef.current !== controller) return;
      const previous = controller.bounds();
      const next = controller.refreshBounds();
      if (drag.current && (previous.left !== next.left || previous.width !== next.width)) cancelDrag();
    });
    observer?.observe(runwayRef.current);
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      if (motionRef.current !== controller) return;
      railVisible.current = entries[0]?.isIntersecting ?? true;
      if (!railVisible.current && drag.current) cancelDrag();
      controller.setActive(visibility.current.page && visibility.current.anchor && railVisible.current);
    }, { root: popoverRef.current });
    intersection?.observe(runwayRef.current);
    return () => {
      observer?.disconnect();
      intersection?.disconnect();
      media?.removeEventListener('change', onMotionPreference);
      controller.dispose();
      if (motionRef.current === controller) motionRef.current = null;
    };
  }, [open, options.length > 0, cancelDrag]);
  useLayoutEffect(() => { motionRef.current?.setActive(pageVisible && anchorVisible && railVisible.current); }, [open, pageVisible, anchorVisible, options.length > 0]);

  // A host model or value change is authoritative, even halfway through a gesture.
  useLayoutEffect(() => {
    const attempt = pendingChoice.current;
    if (attempt && (attempt.context !== capabilityKey || (value !== attempt.previous && value !== attempt.value))) pendingChoice.current = null;
    cancelDrag();
  }, [value, capabilityKey, cancelDrag]);
  useLayoutEffect(() => { if ((disabled || pending) && drag.current) cancelDrag(); }, [disabled, pending, cancelDrag]);
  useEffect(() => { setLocalError(undefined); }, [value, capabilityKey]);
  useEffect(() => { setAvatarFailed(false); }, [avatarSrc]);
  useEffect(() => {
    if (!celebration) return;
    if (celebration.context !== capabilityKey) { setCelebration(null); return; }
    if (celebration.value === value) {
      if (open) setBurst(number => number + 1);
      setCelebration(null);
    }
  }, [celebration, capabilityKey, value, open]);

  useEffect(() => {
    const onVisibility = () => {
      setPageVisible(!document.hidden);
      if (document.hidden) cancelDrag();
    };
    const onBlur = () => cancelDrag();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      const visible = entries[0]?.isIntersecting ?? true;
      setAnchorVisible(visible);
      if (!visible) closePopover();
    });
    if (triggerRef.current) observer?.observe(triggerRef.current);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      observer?.disconnect();
    };
  }, [cancelDrag, closePopover]);

  // Portalling prevents a composer with overflow:hidden from clipping the control.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trigger = triggerRef.current;
      const panel = popoverRef.current;
      if (!trigger || !panel) return;
      const rect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const offsetLeft = viewport?.offsetLeft ?? 0;
      const offsetTop = viewport?.offsetTop ?? 0;
      const panelWidth = Math.min(368, Math.max(0, width - 24));
      const panelHeight = Math.min(panel.scrollHeight, Math.max(0, height - 24));
      const left = clamp(rect.left, offsetLeft + 12, offsetLeft + width - panelWidth - 12);
      const above = rect.top - panelHeight - 10;
      const below = rect.bottom + 10;
      const top = above >= offsetTop + 12 ? above : clamp(below, offsetTop + 12, offsetTop + height - panelHeight - 12);
      // The portal is outside the host's theme subtree: carry its resolved palette.
      const theme = window.getComputedStyle(trigger);
      const palette = Object.fromEntries(['surface', 'surface-soft', 'text', 'muted', 'line', 'accent', 'accent-strong', 'error']
        .map(token => [`--dsg-${token}`, theme.getPropertyValue(`--dsg-${token}`).trim()])
        .filter(([, color]) => color));
      setPosition({ ...palette, position: 'fixed', left, top, width: panelWidth, maxHeight: height - 24, visibility: 'visible' });
    };
    reposition();
    // Viewport scroll and resize arrive in bursts: one recompute per frame is
    // enough, and it keeps getComputedStyle off the critical scroll path. The
    // gesture cancel stays synchronous because stale geometry is the hazard.
    let frame: number | null = null;
    const scheduleReposition = () => {
      if (frame !== null) return;
      if (typeof window.requestAnimationFrame !== 'function') { reposition(); return; }
      frame = window.requestAnimationFrame(() => { frame = null; reposition(); });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    if (popoverRef.current) observer?.observe(popoverRef.current);
    if (triggerRef.current) observer?.observe(triggerRef.current);
    const themeObserver = typeof window.MutationObserver === 'undefined' ? null : new window.MutationObserver(reposition);
    let ancestor: HTMLElement | null = triggerRef.current;
    while (ancestor) {
      themeObserver?.observe(ancestor, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme'] });
      ancestor = ancestor.parentElement;
    }
    const colorScheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    colorScheme?.addEventListener('change', reposition);
    const onViewportChange = () => { if (drag.current) cancelDrag(); scheduleReposition(); };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    return () => {
      if (frame !== null && typeof window.cancelAnimationFrame === 'function') window.cancelAnimationFrame(frame);
      observer?.disconnect();
      themeObserver?.disconnect();
      colorScheme?.removeEventListener('change', reposition);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
    };
  }, [open, cancelDrag]);
  useLayoutEffect(() => { motionRef.current?.refreshBounds(); }, [position.left, position.top, position.width]);

  useLayoutEffect(() => {
    if (!open) return;
    resetVisual();
    (unavailable ? popoverRef.current : trackRef.current)?.focus({ preventScroll: true });
  }, [open, resetVisual, unavailable]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) closePopover();
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closePopover(true);
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Node;
      if (!popoverRef.current?.contains(target) && !triggerRef.current?.contains(target)) closePopover();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('focusin', onFocus);
    };
  }, [open, closePopover]);

  const commit = useCallback(async (index: number) => {
    const current = latest.current;
    const option = current.options[index];
    if (!option || current.disabled || current.pending || busyRef.current) return;
    if (option.value === current.value) { resetVisual(); return; }
    const context = capabilityRef.current;
    const sequence = ++commitSequence.current;
    busyRef.current = true;
    pendingChoice.current = { value: option.value, previous: current.value, context };
    setLocalBusy(true);
    setLocalError(undefined);
    setCelebration(null);
    setAnnouncement(`正在更新为 ${option.label}`);
    draftIndex.current = index;
    setPreviewIndex(index);
    paintProgress(progressFor(index, current.options.length), true);
    try {
      await current.onCommit(option.value);
      if (!alive.current || sequence !== commitSequence.current) return;
      if (capabilityRef.current === context) {
        const authoritative = latest.current;
        const applied = authoritative.value === option.value;
        setAnnouncement(applied ? `已选择 ${option.label}` : '模型设置已刷新');
        if (index === current.options.length - 1 && current.options.length > 1) setCelebration({ value: option.value, context });
      }
    } catch (error) {
      if (!alive.current || sequence !== commitSequence.current) return;
      if (capabilityRef.current === context) {
        const message = error instanceof Error && error.message ? error.message : '档位更新失败，请重试。';
        setLocalError(message);
        setAnnouncement('更新失败，已恢复当前档位');
      }
    } finally {
      if (alive.current && sequence === commitSequence.current) {
        busyRef.current = false;
        pendingChoice.current = null;
        setLocalBusy(false);
        resetVisual();
      }
    }
  }, [paintProgress, resetVisual]);

  const movePointer = (clientX: number) => {
    const bounds = motionRef.current?.bounds();
    if (!bounds || bounds.width <= 0) return;
    const progress = clamp((clientX - bounds.left) / bounds.width);
    paintProgress(progress, false);
    const index = Math.round(progress * Math.max(options.length - 1, 0));
    if (draftIndex.current !== index) {
      draftIndex.current = index;
      setPreviewIndex(index);
    }
    if (drag.current) drag.current.lastX = clientX;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canChange || options.length < 2 || event.button !== 0 || drag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    drag.current = { id: event.pointerId, lastX: event.clientX, context: capabilityKey };
    event.currentTarget.dataset.dragging = 'true';
    event.currentTarget.setPointerCapture?.(event.pointerId);
    motionRef.current?.beginDrag();
    movePointer(event.clientX);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    movePointer(event.clientX);
    const index = draftIndex.current;
    drag.current = null;
    event.currentTarget.dataset.dragging = 'false';
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (active.context !== capabilityRef.current || index === null) resetVisual();
    else void commit(index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!canChange || options.length === 0 || event.altKey || event.ctrlKey || event.metaKey) return;
    let index = committedIndex;
    switch (event.key) {
      case 'ArrowRight': case 'ArrowUp': index = index < 0 ? 0 : Math.min(options.length - 1, index + 1); break;
      case 'ArrowLeft': case 'ArrowDown': index = index < 0 ? options.length - 1 : Math.max(0, index - 1); break;
      case 'Home': index = 0; break;
      case 'End': index = options.length - 1; break;
      default: return;
    }
    event.preventDefault();
    void commit(index);
  };

  const starIcon = <svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="m16 2 3.9 10.1L30 16l-10.1 3.9L16 30l-3.9-10.1L2 16l10.1-3.9L16 2Z" fill="currentColor"/><path d="m16 8 2.2 5.8L24 16l-5.8 2.2L16 24l-2.2-5.8L8 16l5.8-2.2L16 8Z" fill="#fff"/></svg>;

  return <>
    <span className="dsg dsg-anchor" data-paused={!pageVisible || !anchorVisible}>
      <button ref={triggerRef} type="button" className="dsg-chip" onClick={() => open ? closePopover() : setOpen(true)}
        aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-panel` : undefined}
        aria-label={`思考力度：${unavailable ? '不可用' : currentLabel}${busy ? '，更新中' : ''}`}
        title={unavailable ? disabledReason || '当前模型未提供可调整的思考力度' : '调整模型思考力度'} data-unavailable={unavailable} data-pending={busy}>
        <span className="dsg-chip-star">{starIcon}</span>
        <span className="dsg-chip-label">思考力度</span>
        <span className="dsg-chip-value">{unavailable ? '不可用' : currentLabel}</span>
        {busy ? <span className="dsg-spinner" aria-hidden="true"/> : <svg className="dsg-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>}
      </button>
      <span className="dsg-sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>
    </span>
    {open && typeof document !== 'undefined' && createPortal(
      <div ref={popoverRef} id={`${id}-panel`} className="dsg dsg-panel" role="dialog" tabIndex={-1}
        aria-label="思考力度" aria-describedby={helpText ? `${id}-help` : undefined} aria-busy={busy}
        data-paused={!pageVisible || !anchorVisible} style={position}>
        <header className="dsg-header">
          <p className="dsg-model" title={modelLabel}>{modelLabel || '当前模型'}</p>
          <button type="button" className="dsg-close" aria-label="关闭思考力度设置" onClick={() => closePopover(true)}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6 8 8M14 6l-8 8"/></svg></button>
        </header>
        {options.length > 0 && <div className="dsg-control" data-unavailable={unavailable}>
          <div ref={trackRef} className="dsg-track" role={displayedIndex >= 0 ? 'slider' : 'group'} tabIndex={canChange ? 0 : -1}
            aria-label={displayedIndex >= 0 ? '思考力度' : `思考力度：${currentLabel}`} aria-orientation={displayedIndex >= 0 ? 'horizontal' : undefined}
            aria-valuemin={displayedIndex >= 0 ? 0 : undefined} aria-valuemax={displayedIndex >= 0 ? Math.max(options.length - 1, 0) : undefined}
            aria-valuenow={displayedIndex >= 0 ? displayedIndex : undefined} aria-valuetext={displayedIndex >= 0 ? selected?.label : undefined}
            aria-disabled={!canChange} aria-describedby={helpText ? `${id}-help` : undefined} data-unknown={displayedIndex < 0} data-dragging="false"
            data-peak={density === 'max'}
            data-density={density}
            style={{ '--dsg-middle-alpha': clamp(visualLevel * 2) * .82, '--dsg-nebula-alpha': clamp((visualLevel - .5) * 2) * .92, '--dsg-foreground-alpha': visualLevel * .85 } as CSSProperties}
            onKeyDown={onKeyDown} onPointerDown={onPointerDown}
            onPointerMove={event => { if (drag.current?.id === event.pointerId) movePointer(event.clientX); }}
            onPointerUp={onPointerUp} onPointerCancel={event => { if (drag.current?.id === event.pointerId) cancelDrag(); }}
            onLostPointerCapture={event => { if (drag.current?.id === event.pointerId) cancelDrag(); }}>
            <div ref={runwayRef} className="dsg-runway">
              <div className="dsg-track-bed" aria-hidden="true"><div className="dsg-galaxy-fill"/>
              <div className="dsg-starfield">{backgroundPixels}{foregroundStream}</div>
                <div className="dsg-ticks">{options.map((option, index) => <i key={option.value} style={{ left: `${progressFor(index, options.length) * 100}%` }}>{index === displayedIndex ? '│' : '·'}</i>)}</div>
              </div>
              <div className="dsg-thumb" aria-hidden="true">
                <span className="dsg-pixel-wake">{foregroundPixels.map((style, index) => <i key={index} style={style}/>)}</span>
                <span className="dsg-thumb-halo"/>
                <span className="dsg-avatar">
                  {avatarSrc && !avatarFailed ? avatarIsAtlas ? <>
                    {[0, 1, 2].map(frame => <span key={frame} className="dsg-avatar-frame" data-show={expression === frame}>
                      <img className="dsg-atlas-image" src={avatarSrc} alt="" draggable={false}
                        style={{ transform: `translateX(-${frame * 100 / 3}%)` }} onError={() => setAvatarFailed(true)}/>
                    </span>)}
                  </> : <img className="dsg-avatar-image" src={avatarSrc} alt="" draggable={false} onError={() => setAvatarFailed(true)}/>
                    : <span className="dsg-star-avatar">{starIcon}</span>}
                </span>
                {burst > 0 && <span key={burst} className="dsg-burst">{Array.from({ length: 8 }, (_, index) => <i key={index} style={{ '--dsg-ray': `${index * 45}deg` } as CSSProperties}/>)}</span>}
              </div>
            </div>
          </div>
          <div className="dsg-label-rail" data-dense={denseLabels} aria-label="可用思考档位"
            style={denseLabels && options.length > 1 ? { height: 88 } : undefined}>
            {options.map((option, index) => <button key={option.value} type="button" className="dsg-option" disabled={!canChange}
              aria-pressed={committedIndex === index} data-preview={displayedIndex === index}
              title={denseLabels ? option.label : undefined}
              style={{ left: `${progressFor(index, options.length) * 100}%`, ...(denseLabels
                ? { maxWidth: options.length > 1 ? `calc(${200 / (options.length - 1)}% - 8px)` : '100%' }
                : {}) }} onClick={() => void commit(index)}><span className="dsg-option-label">{option.label}</span><span className="dsg-option-dot" aria-hidden="true"/></button>)}
          </div>
        </div>}
        {helpText && <p id={`${id}-help`} className="dsg-help" role="status">{helpText}</p>}
        {shownError && <p className="dsg-error" role="alert">{shownError}</p>}
      </div>, document.body)}
  </>;
}
