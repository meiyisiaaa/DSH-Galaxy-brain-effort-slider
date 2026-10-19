import { afterEach, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { GalaxyEffortSlider } from '../src/ui/GalaxyEffortSlider';
import type { GalaxyEffortSliderProps } from '../src/ui-contract';

let dom: JSDOM;
let root: Root;
let container: HTMLDivElement;
let current: GalaxyEffortSliderProps;
let calls: string[];
const options = [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }, { value: 'max', label: 'Max' }];
const sliderCSS = readFileSync('src/ui/GalaxyEffortSlider.css', 'utf8');
function loadStyles() {
  const style = document.createElement('style');
  style.textContent = sliderCSS;
  document.head.append(style);
}
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const selector = <T extends Element = HTMLElement>(query: string) => {
  const element = dom.window.document.querySelector<T>(query);
  assert.ok(element, `Missing element: ${query}`);
  return element;
};
function render(patch: Partial<GalaxyEffortSliderProps> = {}) {
  current = { ...current, ...patch };
  act(() => root.render(React.createElement(GalaxyEffortSlider, current)));
}
function click(element: Element) { act(() => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); }
function open() { click(selector('.dsg-chip')); return selector('.dsg-track'); }
function pointer(element: Element, type: string, x: number, id = 1) {
  const event = new dom.window.MouseEvent(type, { bubbles: true, clientX: x, button: 0, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: id });
  act(() => element.dispatchEvent(event));
}
function key(element: Element, name: string) {
  act(() => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: name, cancelable: true })));
}

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  const captured = new WeakMap<Element, number>();
  const canvasContext = {
    clearRect() {}, fillRect() {}, setTransform() {}, globalAlpha: 1, fillStyle: '#000',
  } as unknown as CanvasRenderingContext2D;
  Object.assign(dom.window.HTMLElement.prototype, {
    setPointerCapture(this: Element, id: number) { captured.set(this, id); },
    hasPointerCapture(this: Element, id: number) { return captured.get(this) === id; },
    releasePointerCapture(this: Element) { captured.delete(this); },
    getBoundingClientRect(this: Element) {
      return this.classList.contains('dsg-runway')
        ? { left: 100, right: 400, top: 100, bottom: 188, width: 300, height: 88, x: 100, y: 100, toJSON() {} }
        : { left: 30, right: 398, top: 500, bottom: 544, width: 368, height: 44, x: 30, y: 500, toJSON() {} };
    },
  });
  Object.assign(dom.window.HTMLCanvasElement.prototype, { getContext: () => canvasContext });
  container = dom.window.document.getElementById('root') as HTMLDivElement;
  root = createRoot(container);
  calls = [];
  // A small URL keeps jsdom's CSS parser from expanding the bundled 1.7 MB atlas repeatedly.
  current = { options, value: 'low', disabled: false, pending: false, modelLabel: 'DeepSeek V4', avatarSrc: '/test-avatar.png', avatarLayout: 'triptych', onCommit: async value => { calls.push(value); } };
  render();
});
afterEach(() => { act(() => root.unmount()); dom.window.close(); });

test('renders only host-provided options and approved three-frame avatar', () => {
  open();
  assert.deepEqual([...document.querySelectorAll('.dsg-option')].map(button => button.textContent), ['Low', 'High', 'Max']);
  assert.equal(document.querySelectorAll('.dsg-avatar-frame').length, 3);
  assert.equal(selector('.dsg-option[aria-pressed="true"]').textContent, 'Low');
  assert.equal(selector('.dsg-track').getAttribute('aria-valuenow'), '0');
  assert.equal(selector('.dsg-track').getAttribute('aria-valuetext'), 'Low');
});

test('two pixel flow streams retain three depth layers and canvas surfaces', () => {
  open();
  assert.equal(document.querySelectorAll('.dsg-pixel-stream').length, 2);
  assert.equal(document.querySelectorAll('.dsg-pixels').length, 5);
  const depths = [...document.querySelectorAll('.dsg-pixel-background > .dsg-pixel-group')];
  assert.deepEqual(depths.map(group => group.dataset.depth), ['0', '1', '2']);
  assert.deepEqual(depths.map(group => group.querySelector('canvas')?.dataset.pixels), ['0', '1', '2']);
  assert.equal(selector('.dsg-pixel-foreground canvas')?.getAttribute('data-pixels'), '3');
  assert.equal(document.querySelector('.dsg-pixel-wake canvas')?.getAttribute('data-pixels'), '4');
  assert.match(sliderCSS, /\.dsg-pixel-stream\s*\{[^}]*width: 200%;/);
  assert.match(sliderCSS, /@keyframes dsg-pixel-flow[^\n]*translate3d\(-50%, 0, 0\)/);
});

test('idle visible pixels and CSS flows share one animation frame loop', () => {
  loadStyles();
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  render({ value: 'max' });
  const track = open();
  for (let i = 0; i < 10; i += 1) {
    const queued = [...frames.values()]; frames.clear();
    act(() => { for (const callback of queued) callback(100 + i * 16.67); });
    assert.equal(frames.size, 1);
  }
  assert.equal(track.dataset.peak, 'true');
  assert.equal(track.dataset.motionActive, 'true');
  assert.equal(selector('.dsg-panel').dataset.paused, 'false');
  assert.equal(parseFloat(selector('.dsg-galaxy-fill').style.width), 100);
  for (const stream of document.querySelectorAll('.dsg-pixel-stream')) {
    assert.equal(window.getComputedStyle(stream).animationPlayState, 'running');
    assert.match(window.getComputedStyle(stream).animation, /dsg-pixel-flow.*linear.*infinite/);
    assert.ok(stream.querySelector('canvas.dsg-pixels'));
  }
  key(track, 'Escape');
  assert.equal(document.querySelector('.dsg-pixel-stream'), null);
  assert.equal(frames.size, 0);
});

test('hidden page stops the shared frame loop and pauses CSS flows, then resumes', () => {
  loadStyles();
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  render({ value: 'max' });
  const track = open();
  for (const hidden of [true, false]) {
    Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
    act(() => document.dispatchEvent(new dom.window.Event('visibilitychange')));
    assert.equal(track.dataset.motionActive, String(!hidden));
    assert.equal(frames.size, hidden ? 0 : 1);
    for (const stream of document.querySelectorAll('.dsg-pixel-stream')) {
      assert.equal(window.getComputedStyle(stream).animationPlayState, hidden ? 'paused' : 'running');
      assert.ok(stream.querySelector('canvas.dsg-pixels'));
    }
  }
});

test('reduced motion stops canvas animation and retains the static CSS field', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0, matches = false;
  const queryListeners = new Map<string, Set<() => void>>();
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => {
    const listeners = queryListeners.get(query) ?? new Set<() => void>();
    queryListeners.set(query, listeners);
    return {
      get matches() { return query === '(prefers-reduced-motion: reduce)' && matches; },
      addEventListener: (_type: string, listener: () => void) => { listeners.add(listener); },
      removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
    } as unknown as MediaQueryList;
  } });
  const notifyMotion = () => { for (const listener of queryListeners.get('(prefers-reduced-motion: reduce)') ?? []) listener(); };
  const track = open();
  assert.equal(frames.size, 1);
  matches = true;
  notifyMotion();
  assert.equal(frames.size, 0);
  assert.ok(document.querySelector('.dsg-pixel-stream canvas'));
  matches = false;
  notifyMotion();
  assert.equal(frames.size, 1);
  assert.match(sliderCSS, /@media \(prefers-reduced-motion: reduce\)[^\n]*animation: none !important/);
  assert.match(sliderCSS, /\.dsg-track\[data-motion-active="false"\] \*\s*\{ animation-play-state: paused !important;/);
  assert.doesNotMatch(sliderCSS, /data-dragging[^\n]*animation-play-state/);
  key(track, 'Escape');
  assert.equal(frames.size, 0);
});

test('pixel geometry belongs to the full rail and remains unchanged across effort reveals', () => {
  const track = open();
  const field = selector('.dsg-starfield');
  assert.equal(field.parentElement, selector('.dsg-track-bed'));
  assert.equal(field.closest('.dsg-galaxy-fill'), null);
  assert.equal(selector('.dsg-galaxy-fill').childElementCount, 0);
  const original = [...field.querySelectorAll('canvas')];
  pointer(track, 'pointerdown', 130);
  assert.equal(field.style.getPropertyValue('--dsg-pixel-reveal'), '30.000px');
  pointer(track, 'pointermove', 370);
  assert.equal(field.style.getPropertyValue('--dsg-pixel-reveal'), '270.000px');
  assert.deepEqual([...field.querySelectorAll('canvas')], original);
  // The reveal clips the starfield; the canvas surfaces retain their rail-sized layout.
  assert.equal(track.style.getPropertyValue('--dsg-pixel-reveal'), '');
  assert.match(sliderCSS, /\.dsg-starfield\s*\{[^}]*inset: 0;[^}]*clip-path: inset/);
  assert.match(sliderCSS, /max\(24px, var\(--dsg-pixel-reveal, 0px\)\)/);
  pointer(track, 'pointercancel', 370);
});

test('actual Off is clean, enabled Low sparse, and High/Max add graduated star layers', () => {
  loadStyles();
  render({ options: [{ value: 'off', label: '关闭' }, ...options], value: 'off' });
  const track = open();
  assert.equal(track.dataset.density, 'off');
  assert.equal(window.getComputedStyle(selector('.dsg-starfield')).opacity, '0');
  assert.equal(window.getComputedStyle(selector('.dsg-galaxy-fill')).visibility, 'hidden');
  assert.equal(window.getComputedStyle(selector('.dsg-pixel-stream')).animationPlayState, 'paused');
  render({ value: 'low' });
  assert.equal(track.dataset.density, 'low');
  assert.equal(track.style.getPropertyValue('--dsg-middle-alpha'), '0');
  assert.equal(track.style.getPropertyValue('--dsg-nebula-alpha'), '0');
  assert.equal(document.querySelectorAll('.dsg-pixel-background > [data-depth="0"] canvas').length, 1);
  assert.equal(window.getComputedStyle(selector('.dsg-pixel-stream')).animationPlayState, 'running');
  render({ value: 'high' });
  assert.equal(track.dataset.density, 'high');
  assert.equal(track.style.getPropertyValue('--dsg-middle-alpha'), '0.82');
  assert.equal(track.style.getPropertyValue('--dsg-nebula-alpha'), '0');
  render({ value: 'max' });
  assert.equal(track.dataset.density, 'max');
  assert.equal(track.style.getPropertyValue('--dsg-nebula-alpha'), '0.92');
  assert.equal(track.dataset.peak, 'true');
});

test('first enabled and generic options are never inferred as Off', () => {
  render({ options: [{ value: 'custom', label: 'Off' }, { value: 'larger', label: 'Larger' }], value: 'custom' });
  const track = open();
  assert.equal(track.dataset.density, 'low');
  render({ options: [{ value: 'none', label: 'None' }, ...options], value: 'none' });
  assert.equal(track.dataset.density, 'off');
  render({ options, value: 'low' });
  assert.equal(track.dataset.density, 'low');
  render({ value: undefined });
  assert.equal(track.dataset.density, 'unknown');
});

test('drag is continuous, commits only on release, and pending rejects duplicate inputs', async () => {
  const job = deferred();
  render({ onCommit: value => { calls.push(value); return job.promise; } });
  const track = open();
  pointer(track, 'pointerdown', 140);
  assert.equal(calls.length, 0);
  pointer(track, 'pointermove', 274);
  assert.equal(Number(track.style.getPropertyValue('--dsg-progress')).toFixed(2), '0.58');
  assert.equal(track.dataset.dragging, 'true');
  assert.match(selector('.dsg-avatar-frame[data-show="true"] .dsg-atlas-image').getAttribute('style') || '', /translateX\(-33\.333/);
  assert.equal(calls.length, 0);
  pointer(track, 'pointerup', 390);
  assert.deepEqual(calls, ['max']);
  render({ pending: true, disabled: true });
  assert.equal(selector('.dsg-help').textContent, '正在更新为 Max');
  assert.doesNotMatch(selector('.dsg-chip').textContent || '', /不可用/);
  assert.equal(track.dataset.dragging, 'false');
  assert.equal(track.getAttribute('aria-disabled'), 'true');
  pointer(track, 'pointerdown', 110);
  key(track, 'Home');
  assert.deepEqual(calls, ['max']);
  render({ value: 'max', pending: false, disabled: false });
  await act(async () => job.resolve());
  assert.equal(selector('.dsg-option[aria-pressed="true"]').textContent, 'Max');
  assert.equal(selector('.dsg-burst').children.length, 8);
});

test('pointercancel rolls back without committing', () => {
  const track = open();
  pointer(track, 'pointerdown', 100);
  pointer(track, 'pointermove', 400);
  pointer(track, 'pointercancel', 400);
  assert.deepEqual(calls, []);
  assert.equal(track.style.getPropertyValue('--dsg-progress'), '0');
  assert.equal(track.getAttribute('aria-valuetext'), 'Low');
});

test('lost capture, blur, and hidden page cancel gestures', () => {
  const track = open();
  for (const reason of ['lostpointercapture', 'blur', 'hidden']) {
    pointer(track, 'pointerdown', 380);
    if (reason === 'lostpointercapture') pointer(track, reason, 380);
    else if (reason === 'blur') act(() => window.dispatchEvent(new dom.window.Event('blur')));
    else {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      act(() => document.dispatchEvent(new dom.window.Event('visibilitychange')));
    }
    pointer(track, 'pointerup', 380);
  }
  assert.deepEqual(calls, []);
  assert.equal(track.style.getPropertyValue('--dsg-progress'), '0');
  assert.equal(selector('.dsg-panel').getAttribute('data-paused'), 'true');
});

test('asynchronous rejection restores authoritative tier and surfaces error', async () => {
  const job = deferred();
  render({ onCommit: value => { calls.push(value); return job.promise; } });
  const track = open();
  key(track, 'End');
  assert.deepEqual(calls, ['max']);
  await act(async () => job.reject(new Error('Host rejected update')));
  assert.equal(selector('.dsg-error').textContent, 'Host rejected update');
  assert.equal(track.getAttribute('aria-valuetext'), 'Low');
  assert.equal(track.getAttribute('aria-disabled'), 'false');
});

test('external model/value changes cancel an in-flight gesture', () => {
  const track = open();
  pointer(track, 'pointerdown', 390);
  render({ value: 'high', modelLabel: 'Other model' });
  pointer(track, 'pointerup', 390);
  assert.deepEqual(calls, []);
  assert.equal(track.getAttribute('aria-valuetext'), 'High');
  assert.equal(track.style.getPropertyValue('--dsg-progress'), '0.5');
});

test('different provider/model routes cancel gestures even with identical names and tiers', () => {
  render({ selectionKey: '["provider-a","model"]' });
  const track = open();
  pointer(track, 'pointerdown', 100);
  pointer(track, 'pointermove', 400);
  render({ selectionKey: '["provider-b","model"]' });
  assert.equal(selector('.dsg-track'), track, 'the combined panel stays mounted');
  pointer(track, 'pointerup', 400);
  assert.deepEqual(calls, []);
  assert.equal(track.getAttribute('aria-valuetext'), 'Low');
});

test('a stale rejection does not overwrite a newer model or expose its old error', async () => {
  const job = deferred();
  render({ onCommit: value => { calls.push(value); return job.promise; } });
  const track = open();
  key(track, 'End');
  render({ value: 'high', modelLabel: 'Another model' });
  await act(async () => job.reject(new Error('Stale failure')));
  assert.equal(document.querySelector('.dsg-error'), null);
  assert.equal(track.getAttribute('aria-valuetext'), 'High');
  assert.equal(track.getAttribute('aria-disabled'), 'false');
});

test('default and unsupported current values do not falsely select first option', () => {
  render({ value: undefined });
  const track = open();
  assert.equal(document.querySelector('.dsg-option[aria-pressed="true"]'), null);
  assert.equal(track.getAttribute('role'), 'group');
  assert.equal(track.hasAttribute('aria-valuenow'), false);
  assert.equal(track.hasAttribute('aria-valuetext'), false);
  assert.match(selector('.dsg-chip').textContent || '', /跟随默认/);
  render({ value: 'provider-special' });
  assert.match(selector('.dsg-chip').textContent || '', /当前档位不可用/);
  assert.equal(document.querySelector('.dsg-option[data-preview="true"]'), null);
});

test('keyboard Home/End and arrows use exact option values', async () => {
  const received: string[] = [];
  render({ onCommit: async value => { received.push(value); } });
  const track = open();
  key(track, 'ArrowRight');
  await act(async () => {});
  assert.deepEqual(received, ['high']);
  render({ value: 'high' });
  key(track, 'End');
  await act(async () => {});
  render({ value: 'max' });
  key(track, 'Home');
  await act(async () => {});
  assert.deepEqual(received, ['high', 'max', 'low']);
});

test('Escape, outside click, and focus leaving dismiss; escape restores trigger focus', () => {
  let track = open();
  pointer(track, 'pointerdown', 400);
  key(track, 'Escape');
  assert.equal(document.querySelector('.dsg-panel'), null);
  assert.equal(document.activeElement, selector('.dsg-chip'));
  track = open();
  pointer(document.body, 'pointerdown', 500);
  assert.equal(document.querySelector('.dsg-panel'), null);
  open();
  const external = document.createElement('button');
  document.body.append(external);
  act(() => external.focus());
  assert.equal(document.querySelector('.dsg-panel'), null);
  assert.deepEqual(calls, []);
});

test('disabled/no-capability model remains readable but cannot commit', () => {
  render({ disabled: true, disabledReason: '该模型不支持推理档位。' });
  const track = open();
  pointer(track, 'pointerdown', 400);
  pointer(track, 'pointerup', 400);
  key(track, 'End');
  assert.deepEqual(calls, []);
  assert.equal(selector('.dsg-help').textContent, '该模型不支持推理档位。');
  assert.equal(selector<HTMLButtonElement>('.dsg-option').disabled, true);
  render({ options: [], value: undefined });
  assert.equal(document.querySelector('.dsg-track'), null);
});

test('static instructions and footer are gone while the capability stays in the dialog name', () => {
  open();
  assert.equal(document.querySelector('.dsg-footer'), null);
  assert.equal(selector('.dsg-panel').hasAttribute('aria-describedby'), false);
  assert.equal(document.querySelector('.dsg-selection'), null);
  assert.equal(selector('.dsg-panel').getAttribute('aria-label'), '思考力度');
  assert.equal(document.querySelector('.dsg-title'), null);
  assert.equal(selector('.dsg-model').textContent, 'DeepSeek V4');
  assert.equal(document.querySelector('.dsg-help'), null);
});

test('many or long capability names use the nonoverlapping wrapping layout', () => {
  const many = Array.from({ length: 9 }, (_, index) => ({ value: `tier-${index}`, label: `Tier ${index}` }));
  render({ options: many, value: 'tier-0' });
  open();
  assert.equal(selector('.dsg-label-rail').getAttribute('data-dense'), 'true');
  assert.equal(document.querySelectorAll('.dsg-option').length, 9);
  render({ options: [{ value: 'long', label: 'Provider-specific deep reasoning' }], value: 'long' });
  assert.equal(selector('.dsg-label-rail').getAttribute('data-dense'), 'true');
});

test('a dense rail staggers tiers instead of reflowing them off their positions', () => {
  loadStyles();
  const many = Array.from({ length: 5 }, (_, index) => ({ value: `tier-${index}`, label: `Tier ${index}` }));
  render({ options: many, value: 'tier-0' });
  open();
  const rail = selector('.dsg-label-rail');
  assert.equal(rail.getAttribute('data-dense'), 'true');
  // Two 44px rows, so neighbours sit 44px apart vertically and never overlap.
  assert.equal(rail.style.height, '88px');
  assert.equal(window.getComputedStyle(rail).height, '88px');
  const buttons = [...document.querySelectorAll<HTMLElement>('.dsg-option')];
  // Every tier keeps its proportional left offset; only the row alternates.
  assert.deepEqual(buttons.map(button => button.style.left), ['0%', '25%', '50%', '75%', '100%']);
  assert.deepEqual(buttons.map(button => window.getComputedStyle(button).top), ['0px', '44px', '0px', '44px', '0px']);
  // The label owns the ellipsis, so a truncated name cannot grow the button.
  assert.equal(selector('.dsg-option-label').textContent, 'Tier 0');
  assert.match(sliderCSS, /\.dsg-option-label\s*\{[^}]*text-overflow: ellipsis/);
  assert.doesNotMatch(sliderCSS, /data-dense="true"\]\s*\{[^}]*grid-template-columns/);
  // A single long name is dense for width only; it needs no second row.
  render({ options: [{ value: 'long', label: 'Provider-specific deep reasoning' }], value: 'long' });
  assert.equal(selector('.dsg-label-rail').getAttribute('data-dense'), 'true');
  assert.equal(selector('.dsg-label-rail').style.height, '');
  assert.equal(window.getComputedStyle(selector('.dsg-option-label')).textOverflow, 'ellipsis');
});

test('failed custom image uses the neutral star fallback', () => {
  render({ avatarSrc: 'https://invalid.example/avatar.png', avatarLayout: 'single' });
  open();
  act(() => selector('.dsg-avatar-image').dispatchEvent(new dom.window.Event('error')));
  assert.ok(document.querySelector('.dsg-star-avatar'));
});

test('closing and unmounting during a pending commit is safe', async () => {
  const job = deferred();
  render({ onCommit: () => job.promise });
  key(open(), 'End');
  key(selector('.dsg-track'), 'Escape');
  assert.equal(document.querySelector('.dsg-panel'), null);
  act(() => root.unmount());
  await act(async () => job.reject(new Error('Late failure')));
  root = createRoot(container);
  assert.equal(document.querySelector('.dsg-error'), null);
});

test('max celebration waits for the authoritative value and does not replay on reopen', async () => {
  const job = deferred();
  render({ onCommit: () => job.promise });
  key(open(), 'End');
  await act(async () => job.resolve());
  assert.equal(document.querySelector('.dsg-burst'), null);
  render({ value: 'max' });
  assert.ok(document.querySelector('.dsg-burst'));
  key(selector('.dsg-track'), 'Escape');
  open();
  assert.equal(document.querySelector('.dsg-burst'), null);
});

test('pending prop cancels active drag and foreign pointer events are ignored', () => {
  const track = open();
  pointer(track, 'pointerdown', 100, 1);
  pointer(track, 'pointermove', 400, 2);
  pointer(track, 'pointerup', 400, 2);
  assert.equal(track.style.getPropertyValue('--dsg-progress'), '0');
  render({ pending: true });
  pointer(track, 'pointerup', 400, 1);
  assert.deepEqual(calls, []);
  assert.equal(track.dataset.dragging, 'false');
});

test('default state keyboard and single-option capabilities remain usable', async () => {
  render({ value: undefined });
  key(open(), 'ArrowRight');
  await act(async () => {});
  assert.deepEqual(calls, ['low']);
  render({ options: [{ value: 'provider-only', label: 'Automatic' }], value: undefined });
  key(selector('.dsg-track'), 'Home');
  await act(async () => {});
  assert.deepEqual(calls, ['low', 'provider-only']);
  render({ value: 'provider-only' });
  assert.equal(selector('.dsg-track').getAttribute('aria-valuemax'), '0');
  assert.equal(selector('.dsg-track').getAttribute('aria-valuenow'), '0');
});

test('portalled panel preserves the trigger palette from a nested theme scope', () => {
  selector('.dsg-chip').style.setProperty('--dsg-surface', '#010203');
  selector('.dsg-chip').style.setProperty('--dsg-text', '#eeeeff');
  open();
  assert.equal(selector('.dsg-panel').style.getPropertyValue('--dsg-surface'), '#010203');
  assert.equal(selector('.dsg-panel').style.getPropertyValue('--dsg-text'), '#eeeeff');
});

test('pending target remains truthful across blur and close/reopen', async () => {
  const job = deferred();
  render({ onCommit: () => job.promise });
  key(open(), 'End');
  render({ pending: true, disabled: true });
  act(() => window.dispatchEvent(new dom.window.Event('blur')));
  assert.equal(selector('.dsg-help').textContent, '正在更新为 Max');
  key(selector('.dsg-track'), 'Escape');
  open();
  assert.equal(selector('.dsg-help').textContent, '正在更新为 Max');
  render({ value: 'max', pending: false, disabled: false });
  await act(async () => job.resolve());
  assert.equal(selector('.dsg-option[aria-pressed="true"]').textContent, 'Max');
});

test('viewport scroll cancels a captured gesture instead of using stale geometry', () => {
  const track = open();
  pointer(track, 'pointerdown', 100);
  pointer(track, 'pointermove', 380);
  act(() => window.dispatchEvent(new dom.window.Event('scroll')));
  pointer(track, 'pointerup', 380);
  assert.deepEqual(calls, []);
  assert.equal(track.getAttribute('aria-valuetext'), 'Low');
});

test('pointer moves render only when the preview tier changes and commit on release', async () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0, renders = 0;
  const job = deferred();
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  current = { ...current, onCommit: value => { calls.push(value); return job.promise; } };
  act(() => root.render(React.createElement(React.Profiler, { id: 'slider', onRender: () => { renders += 1; } }, React.createElement(GalaxyEffortSlider, current))));
  const track = open();
  pointer(track, 'pointerdown', 110);
  let count = renders;
  pointer(track, 'pointermove', 120);
  pointer(track, 'pointermove', 174);
  assert.equal(renders, count);
  assert.deepEqual(calls, []);

  pointer(track, 'pointermove', 176);
  assert.equal(renders, count + 1);
  assert.equal(track.getAttribute('aria-valuenow'), '1');
  assert.equal(track.getAttribute('aria-valuetext'), 'High');
  count = renders;
  pointer(track, 'pointermove', 324);
  assert.equal(renders, count);
  pointer(track, 'pointermove', 326);
  assert.equal(renders, count + 1);
  assert.equal(track.getAttribute('aria-valuenow'), '2');
  assert.equal(track.getAttribute('aria-valuetext'), 'Max');
  assert.deepEqual(calls, []);
  assert.equal(frames.size, 1);

  pointer(track, 'pointerup', 326);
  assert.deepEqual(calls, ['max']);
  await act(async () => job.resolve());
  key(track, 'Escape');
  assert.equal(frames.size, 0);
});

test('capabilities arriving in an open hidden panel never start a frame loop', () => {
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  Object.defineProperty(document, 'hidden', { configurable: true, value: true });
  act(() => document.dispatchEvent(new dom.window.Event('visibilitychange')));
  render({ options: [], value: undefined, disabled: true });
  click(selector('.dsg-chip'));
  render({ options, value: 'low', disabled: false });
  assert.ok(document.querySelector('.dsg-galaxy-fill'));
  assert.equal(frames.size, 0);
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  act(() => document.dispatchEvent(new dom.window.Event('visibilitychange')));
  assert.equal(frames.size, 1);
});

test('rail visibility stops and restarts exactly one animation loop', () => {
  loadStyles();
  const frames = new Map<number, FrameRequestCallback>();
  let nextId = 0;
  window.requestAnimationFrame = callback => { frames.set(++nextId, callback); return nextId; };
  window.cancelAnimationFrame = id => { frames.delete(id); };
  const observers: { callback: IntersectionObserverCallback; root: Element | null }[] = [];
  const previous = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) { observers.push({ callback, root: options?.root as Element ?? null }); }
    observe() {} disconnect() {}
  } as unknown as typeof IntersectionObserver;
  try {
    open();
    const observer = observers.find(item => item.root === selector('.dsg-panel'))!;
    assert.ok(observer);
    assert.equal(frames.size, 1);
    act(() => observer.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(frames.size, 0);
    assert.equal(window.getComputedStyle(selector('.dsg-pixel-stream')).animationPlayState, 'paused');
    assert.ok(selector('.dsg-pixel-stream canvas.dsg-pixels'));
    act(() => observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(frames.size, 1);
    assert.equal(window.getComputedStyle(selector('.dsg-pixel-stream')).animationPlayState, 'running');
    assert.ok(selector('.dsg-pixel-stream canvas.dsg-pixels'));
    act(() => observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(frames.size, 1);
    key(selector('.dsg-track'), 'Escape');
    assert.equal(frames.size, 0);
    act(() => observer.callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(frames.size, 0);
    const reopened = open();
    pointer(reopened, 'pointerdown', 290);
    assert.equal(reopened.dataset.dragging, 'true');
    act(() => observer.callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver));
    assert.equal(reopened.dataset.dragging, 'true');
    assert.equal(frames.size, 1);
    pointer(reopened, 'pointercancel', 290);
  } finally { globalThis.IntersectionObserver = previous; }
});
