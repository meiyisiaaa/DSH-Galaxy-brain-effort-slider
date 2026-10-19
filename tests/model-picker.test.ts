import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import type { Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { GalaxyModelPicker } from '../src/ui/GalaxyModelPicker';
import type { ModelDirectoryState, ModelSelection } from '../src/adapter/host-contract';

let dom: JSDOM;
let root: Root;
let createRoot: typeof import('react-dom/client').createRoot;
let container: HTMLDivElement;
let state: ModelDirectoryState;
let current: {
  state: ModelDirectoryState;
  disabled: boolean;
  onSelect: (target: Pick<ModelSelection, 'provider' | 'model'>) => Promise<void>;
  onReload: () => Promise<void>;
  onDefault?: () => Promise<void>;
};
let selections: Pick<ModelSelection, 'provider' | 'model'>[];

function makeState(overrides: Partial<ModelDirectoryState> = {}): ModelDirectoryState {
  return {
    current: { provider: 'deepseek', model: 'v4', reasoningEffort: 'low' },
    routable: true,
    groups: [
      { id: 'deepseek', name: 'DeepSeek', models: [{ id: 'v4', name: 'DeepSeek V4' }] },
      { id: 'other', name: 'Other', models: [{ id: 'v4', name: 'Other V4' }, { id: 'vision', name: 'Vision Model' }] },
    ],
    failures: [],
    status: 'ready',
    pending: null,
    error: null,
    ...overrides,
  };
}

function render(patch: Partial<typeof current> = {}) {
  current = { ...current, ...patch };
  act(() => root.render(React.createElement(GalaxyModelPicker, current)));
}

const selector = <T extends Element = HTMLElement>(query: string) => {
  const element = dom.window.document.querySelector<T>(query);
  assert.ok(element, `Missing element: ${query}`);
  return element;
};

function click(element: Element) {
  act(() => element.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })));
}

function key(element: Element, name: string) {
  act(() => element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { bubbles: true, key: name, cancelable: true })));
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
}

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(async () => {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true });
  ({ createRoot } = await import('react-dom/client'));
  container = dom.window.document.getElementById('root') as HTMLDivElement;
  root = createRoot(container);
  state = makeState();
  selections = [];
  current = {
    state,
    disabled: false,
    onSelect: async target => { selections.push(target); },
    onReload: async () => {},
    onDefault: async () => {},
  };
  render();
});

afterEach(() => { act(() => root.unmount()); dom.window.close(); });

test('collapsed control shows the current model and default action without exposing provider details', () => {
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'false');
  assert.equal(selector('.dsg-model-picker-trigger-name').textContent, 'DeepSeek V4');
  assert.equal(selector('.dsg-model-picker-default').textContent?.trim(), '跟随默认');
  assert.equal(selector('.dsg-model-picker-default').getAttribute('aria-pressed'), 'false');
  assert.equal(document.querySelector('.dsg-model-picker-list'), null);
  assert.equal(document.querySelector('.dsg-model-picker-provider-config'), null);
});

test('shows provider groups and checks the exact provider/model pair for duplicate model IDs', () => {
  click(selector('.dsg-model-picker-trigger'));
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  assert.equal(options.length, 3);
  assert.equal(document.querySelectorAll('.dsg-model-picker-provider-name').length, 2);
  assert.equal(options.find(option => option.textContent?.includes('DeepSeek V4'))?.getAttribute('aria-selected'), 'true');
  assert.equal(options.find(option => option.textContent?.includes('Other V4'))?.getAttribute('aria-selected'), 'false');
});

test('case-insensitive subsequence search and Arrow navigation select the exact provider', async () => {
  click(selector('.dsg-model-picker-trigger'));
  const search = selector<HTMLInputElement>('.dsg-model-picker-search');
  typeInto(search, 'v4');
  assert.equal(document.querySelectorAll('[role="option"]').length, 2);
  assert.ok(search.getAttribute('aria-activedescendant'));
  key(search, 'ArrowDown');
  const active = document.getElementById(search.getAttribute('aria-activedescendant')!);
  assert.match(active?.textContent || '', /Other V4/);
  await act(async () => { key(search, 'Enter'); await Promise.resolve(); });
  assert.deepEqual(selections, [{ provider: 'other', model: 'v4' }]);
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'false');
  assert.equal(document.activeElement, selector('.dsg-model-picker-trigger'));
});

test('Enter confirms IME composition without submitting the active model', () => {
  click(selector('.dsg-model-picker-trigger'));
  act(() => selector('.dsg-model-picker-search').dispatchEvent(new dom.window.KeyboardEvent('keydown', {
    bubbles: true, key: 'Enter', isComposing: true, cancelable: true,
  })));
  assert.deepEqual(selections, []);
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'true');
});

test('model option buttons move keyboard focus and keep the active option in view', () => {
  click(selector('.dsg-model-picker-trigger'));
  const options = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')];
  const scrolled: string[] = [];
  options.forEach(option => { option.scrollIntoView = () => { scrolled.push(option.textContent || ''); }; });
  act(() => options[0].focus());
  key(options[0], 'ArrowDown');
  assert.equal(document.activeElement, options[1]);
  assert.match(options[1].textContent || '', /Other V4/);
  assert.ok(scrolled.some(name => name.includes('Other V4')));
});

test('default pressed state requires an actual current model with undefined effort', async () => {
  const button = selector('.dsg-model-picker-default');
  render({ state: makeState({ current: { provider: 'deepseek', model: 'v4' } }) });
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  render({ state: makeState({ current: { provider: 'deepseek', model: 'v4', reasoningEffort: 'retired' } }) });
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  render({ state: makeState({ current: null }) });
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  render({ state: makeState() });
  click(selector('.dsg-model-picker-trigger'));
  await act(async () => { click(selector('.dsg-model-picker-default')); await Promise.resolve(); });
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'true');
});

test('a successful external effort update clears a stale default-action error', async () => {
  render({ onDefault: async () => { throw new Error('Could not follow default'); } });
  await act(async () => { click(selector('.dsg-model-picker-default')); await Promise.resolve(); });
  assert.match(selector('.dsg-model-picker-error').textContent || '', /Could not follow default/);
  render({ state: makeState({ current: { provider: 'deepseek', model: 'v4', reasoningEffort: 'high' } }) });
  assert.equal(document.querySelector('.dsg-model-picker-error'), null);
});

test('hideSelectionError suppresses host effort errors but keeps picker-local errors and provider failures', async () => {
  render({ state: makeState({ status: 'error', error: 'Effort write failed' }), hideSelectionError: true });
  assert.equal(document.querySelector('.dsg-model-picker-error'), null);
  render({ state: makeState({ status: 'error', error: 'Effort write failed', failures: [{ id: 'remote', name: 'Remote', message: 'Catalog partial failure' }] }), hideSelectionError: true });
  assert.match(selector('.dsg-model-picker-error').textContent || '', /Catalog partial failure/);
  render({ hideSelectionError: true, onDefault: async () => { throw new Error('Default update failed'); } });
  await act(async () => { click(selector('.dsg-model-picker-default')); await Promise.resolve(); });
  assert.match(selector('.dsg-model-picker-error').textContent || '', /Default update failed/);
});

test('disabled state keeps the catalog browseable and blocks model submissions', () => {
  render({ disabled: true });
  click(selector('.dsg-model-picker-trigger'));
  const other = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent?.includes('Other V4'))!;
  assert.equal(other.getAttribute('aria-disabled'), 'true');
  click(other);
  assert.deepEqual(selections, []);
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'true');
});

test('selection failure keeps the list open and its error remains visible when collapsed', async () => {
  const job = deferred();
  render({ onSelect: target => { selections.push(target); return job.promise; } });
  click(selector('.dsg-model-picker-trigger'));
  const other = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent?.includes('Other V4'))!;
  click(other);
  await act(async () => { job.reject(new Error('Route rejected')); await job.promise.catch(() => {}); });
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'true');
  assert.match(selector('.dsg-model-picker-error').textContent || '', /Route rejected/);
  click(selector('.dsg-model-picker-trigger'));
  assert.match(selector('.dsg-model-picker-error').textContent || '', /Route rejected/);
});

test('stale rejection after an external model change does not replace current state with an old error', async () => {
  const job = deferred();
  render({ onSelect: target => { selections.push(target); return job.promise; } });
  click(selector('.dsg-model-picker-trigger'));
  const other = [...document.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(option => option.textContent?.includes('Other V4'))!;
  click(other);
  render({ state: makeState({ current: { provider: 'other', model: 'vision' } }) });
  await act(async () => { job.reject(new Error('Stale route failure')); await job.promise.catch(() => {}); });
  assert.equal(document.querySelector('.dsg-model-picker-error'), null);
  assert.equal(selector('.dsg-model-picker-trigger-name').textContent, 'Vision Model');
  assert.equal(selector<HTMLInputElement>('.dsg-model-picker-search').value, '');
});

test('catalog failure is announced in collapsed state and exposes a retry action', async () => {
  let reloads = 0;
  render({ state: makeState({ status: 'error', error: 'Catalog unavailable' }), disabled: true, onReload: async () => { reloads += 1; } });
  assert.match(selector('.dsg-model-picker-error').textContent || '', /Catalog unavailable/);
  await act(async () => { click(selector('.dsg-model-picker-retry')); await Promise.resolve(); });
  assert.equal(reloads, 1);
  render({ state: makeState({ status: 'loading', error: 'Catalog unavailable' }), disabled: false });
  assert.equal(selector<HTMLButtonElement>('.dsg-model-picker-retry').disabled, true);
  click(selector('.dsg-model-picker-retry'));
  assert.equal(reloads, 1);
});

test('Escape closes only the inline picker and restores focus; Tab is left untouched', () => {
  click(selector('.dsg-model-picker-trigger'));
  const search = selector('.dsg-model-picker-search');
  let bubbled = 0;
  document.addEventListener('keydown', () => { bubbled += 1; }, { once: true });
  key(search, 'Escape');
  assert.equal(bubbled, 0);
  assert.equal(selector('.dsg-model-picker').getAttribute('data-expanded'), 'false');
  assert.equal(document.activeElement, selector('.dsg-model-picker-trigger'));
  click(selector('.dsg-model-picker-trigger'));
  const tab = new dom.window.KeyboardEvent('keydown', { bubbles: true, key: 'Tab', cancelable: true });
  act(() => selector('.dsg-model-picker-search').dispatchEvent(tab));
  assert.equal(tab.defaultPrevented, false);
});
