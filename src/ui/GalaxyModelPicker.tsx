import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ModelDirectoryState, ModelSelection } from '../adapter/host-contract';
import './GalaxyModelPicker.css';

type ModelTarget = Pick<ModelSelection, 'provider' | 'model'>;
type Action = 'select' | 'default' | 'reload';
type LocalError = { message: string; action: Action };
type PickerProps = {
  state: ModelDirectoryState;
  disabled: boolean;
  onSelect: (target: ModelTarget) => Promise<void>;
  onReload: () => Promise<void>;
  onDefault?: () => Promise<void>;
  hideSelectionError?: boolean;
};

const modelKey = (target: ModelTarget | null) => target ? JSON.stringify([target.provider, target.model]) : '';
const hostBusy = (state: ModelDirectoryState) => state.status === 'selecting' || state.pending !== null;

function isSubsequence(query: string, value: string) {
  let cursor = 0;
  const needle = query.trim().toLowerCase();
  const haystack = value.toLowerCase();
  for (const character of needle) {
    cursor = haystack.indexOf(character, cursor);
    if (cursor < 0) return false;
    cursor += character.length;
  }
  return true;
}

function errorText(error: unknown, action: Action) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' && error.message) return error.message;
  return action === 'select' ? '模型切换失败，请重试。'
    : action === 'default' ? '切换为跟随默认失败，请重试。'
    : '模型目录加载失败，请重试。';
}

/** Inline model chooser for the effort slider header. */
export function GalaxyModelPicker({ state, disabled, onSelect, onReload, onDefault, hideSelectionError = false }: PickerProps) {
  const baseId = useId().replaceAll(':', '');
  const searchId = `${baseId}-search`;
  const listId = `${baseId}-list`;
  const errorId = `${baseId}-error`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef(new Map<string, HTMLButtonElement>());
  const latest = useRef({ state, disabled });
  latest.current = { state, disabled };

  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [localAction, setLocalAction] = useState<Action | null>(null);
  const localActionRef = useRef<Action | null>(null);
  const [localError, setLocalError] = useState<LocalError | null>(null);
  const sequence = useRef(0);
  const actionRef = useRef<{ id: number; action: Action; source: string; target: string } | null>(null);
  const alive = useRef(true);
  const currentKey = modelKey(state.current);
  const previousModelKey = useRef(currentKey);
  const previousEffort = useRef(state.current?.reasoningEffort);

  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current += 1;
      actionRef.current = null;
    };
  }, []);

  // A different route owns its own query/error state. A pending selection may
  // legitimately move current to its requested target before its promise settles.
  useLayoutEffect(() => {
    if (previousModelKey.current === currentKey) return;
    previousModelKey.current = currentKey;
    setQuery('');
    setActiveKey('');
    setLocalError(null);
    const action = actionRef.current;
    if (action?.action === 'select' && action.target === currentKey) return;
    sequence.current += 1;
    actionRef.current = null;
    localActionRef.current = null;
    setLocalAction(null);
  }, [currentKey]);

  useLayoutEffect(() => {
    if (previousEffort.current === state.current?.reasoningEffort) return;
    previousEffort.current = state.current?.reasoningEffort;
    setLocalError(error => error?.action === 'default' ? null : error);
  }, [state.current?.reasoningEffort]);

  const groups = useMemo(() => state.groups.map((group, groupIndex) => ({
    group,
    groupIndex,
    models: group.models.filter(model => isSubsequence(query, `${group.name} ${model.name} ${model.id}`)),
  })).filter(group => group.models.length > 0), [state.groups, query]);
  const items = useMemo(() => groups.flatMap(({ group, groupIndex, models }) => models.map(model => ({
    key: JSON.stringify([group.id, groupIndex, model.id]),
    provider: group.id,
    providerName: group.name,
    model,
  }))), [groups]);
  const currentModel = state.current
    ? state.groups.find(group => group.id === state.current?.provider)?.models.find(model => model.id === state.current?.model)
    : undefined;
  const currentName = currentModel?.name ?? (state.current ? '当前模型' : '选择模型');
  const activeItem = items.find(item => item.key === activeKey)
    ?? items.find(item => item.provider === state.current?.provider && item.model.id === state.current?.model)
    ?? items[0];
  const activeIndex = activeItem ? items.findIndex(item => item.key === activeItem.key) : -1;
  const busy = localAction !== null || hostBusy(state);
  const reloadBusy = localAction !== null || state.status === 'loading' || hostBusy(state);
  const loading = localAction === 'reload' || state.status === 'loading'
    || (state.status === 'idle' && state.groups.length === 0);
  const hostError = (!hideSelectionError ? state.error || (state.status === 'error' ? '模型目录加载失败，请重试。' : '') : '')
    || (state.failures.length ? state.failures.map(failure => `${failure.name}：${failure.message}`).join('；') : '');
  const shownError = localError?.message || hostError || '';
  const canRetry = localError?.action === 'reload' || (!hideSelectionError && (Boolean(state.error) || state.status === 'error')) || state.failures.length > 0
    || (!loading && state.groups.length === 0);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useLayoutEffect(() => {
    if (!expanded) return;
    searchRef.current?.focus({ preventScroll: true });
    activeItem && optionRefs.current.get(activeItem.key)?.scrollIntoView?.({ block: 'nearest' });
  }, [expanded]);

  const close = () => {
    setExpanded(false);
    setQuery('');
    setActiveKey('');
    triggerRef.current?.focus({ preventScroll: true });
  };

  const moveActive = (delta: number, moveFocus: boolean) => {
    if (items.length === 0) return;
    const index = activeIndex < 0 ? (delta > 0 ? -1 : 0) : activeIndex;
    const next = items[(index + delta + items.length) % items.length];
    setActiveKey(next.key);
    const option = optionRefs.current.get(next.key);
    option?.scrollIntoView?.({ block: 'nearest' });
    if (moveFocus) option?.focus({ preventScroll: true });
  };

  const run = async (action: Action, operation: () => Promise<void>, target = '') => {
    const current = latest.current;
    if (localActionRef.current || hostBusy(current.state)) return;
    if (action !== 'reload' && current.disabled) return;
    const id = ++sequence.current;
    const source = modelKey(current.state.current);
    actionRef.current = { id, action, source, target };
    localActionRef.current = action;
    setLocalAction(action);
    setLocalError(null);
    const isCurrent = () => {
      const pending = actionRef.current;
      const liveKey = modelKey(latest.current.state.current);
      return alive.current && sequence.current === id && pending?.id === id
        && (liveKey === source || (action === 'select' && liveKey === target));
    };
    try {
      await operation();
      if (action === 'select' && isCurrent()) close();
    } catch (error) {
      if (isCurrent()) setLocalError({ message: errorText(error, action), action });
    } finally {
      if (alive.current && sequence.current === id) {
        actionRef.current = null;
        localActionRef.current = null;
        setLocalAction(null);
      }
    }
  };

  const choose = (provider: string, model: string) => {
    const target = { provider, model };
    if (modelKey(state.current) === modelKey(target)) { close(); return; }
    void run('select', () => onSelect(target), modelKey(target));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !expanded) return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };

  const searchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(event.key === 'ArrowDown' ? 1 : -1, false);
    } else if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      choose(activeItem.provider, activeItem.model.id);
    }
  };

  const triggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (expanded || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    const start = event.key === 'ArrowDown' ? 0 : items.length - 1;
    setActiveKey(items[start]?.key ?? '');
    setExpanded(true);
  };

  return <div className="dsg-model-picker" data-expanded={String(expanded)} role="group" aria-label="模型选择" onKeyDown={handleKeyDown}>
    <div className="dsg-model-picker-controls">
      <button
        ref={triggerRef}
        type="button"
        className="dsg-model-picker-trigger"
        aria-label={`${expanded ? '收起' : '展开'}模型列表，当前${currentName}`}
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-describedby={shownError ? errorId : undefined}
        title={currentName}
        onClick={() => expanded ? close() : setExpanded(true)}
        onKeyDown={triggerKeyDown}
      >
        <span className="dsg-model-picker-trigger-name">{currentName}</span>
        {(loading || localAction === 'select') && <span className="dsg-model-picker-spinner" aria-hidden="true"/>}
        <svg className="dsg-model-picker-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>
      </button>
      {onDefault && <button
        type="button"
        className="dsg-model-picker-default"
        aria-label="切换为跟随默认推理力度"
        aria-pressed={Boolean(state.current && state.current.reasoningEffort === undefined)}
        disabled={disabled || busy || !state.current}
        onClick={() => { if (onDefault) void run('default', onDefault); }}
      >
        {localAction === 'default' && <span className="dsg-model-picker-spinner" aria-hidden="true"/>}
        跟随默认
      </button>}
    </div>

    {expanded && <div className="dsg-model-picker-body">
      <label className="dsg-model-picker-sr-only" htmlFor={searchId}>搜索模型</label>
      <input
        ref={searchRef}
        id={searchId}
        className="dsg-model-picker-search"
        type="search"
        autoComplete="off"
        placeholder="搜索模型"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
        value={query}
        onChange={event => { setQuery(event.currentTarget.value); setActiveKey(''); }}
        onKeyDown={searchKeyDown}
      />
      <div className="dsg-model-picker-list" id={listId} role="listbox" aria-label="可用模型" aria-busy={loading}>
        {groups.map(({ group, groupIndex, models }) => <section
          className="dsg-model-picker-provider"
          role="group"
          aria-label={group.name}
          key={`${group.id}-${groupIndex}`}
        >
          <h3 className="dsg-model-picker-provider-name">{group.name}</h3>
          {models.map(model => {
            const key = JSON.stringify([group.id, groupIndex, model.id]);
            const index = items.findIndex(item => item.key === key);
            const selected = state.current?.provider === group.id && state.current.model === model.id;
            const active = activeItem?.key === key;
            return <button
              ref={element => { if (element) optionRefs.current.set(key, element); else optionRefs.current.delete(key); }}
              id={optionId(index)}
              key={key}
              type="button"
              role="option"
              className="dsg-model-picker-option"
              aria-selected={selected}
              aria-disabled={disabled || busy}
              data-active={active}
              tabIndex={active ? 0 : -1}
              title={model.name}
              onClick={() => choose(group.id, model.id)}
              onFocus={() => setActiveKey(key)}
              onKeyDown={event => {
                if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
                event.preventDefault();
                event.stopPropagation();
                moveActive(event.key === 'ArrowDown' ? 1 : -1, true);
              }}
            >
              <span className="dsg-model-picker-option-name">{model.name}</span>
              {selected && <svg className="dsg-model-picker-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3.2 3.2L13 4.8"/></svg>}
            </button>;
          })}
        </section>)}
        {loading && <div className="dsg-model-picker-status" role="status" aria-live="polite"><span className="dsg-model-picker-spinner" aria-hidden="true"/>正在加载模型列表</div>}
        {!loading && !shownError && items.length === 0 && <div className="dsg-model-picker-status" role="status">
          {query ? '没有匹配的模型' : '没有可用模型'}
        </div>}
      </div>
    </div>}

    {shownError && <div className="dsg-model-picker-error" id={errorId} role="alert">
      <span>{shownError}</span>
      {canRetry && <button type="button" className="dsg-model-picker-retry" disabled={reloadBusy} onClick={() => { void run('reload', onReload); }}>重试</button>}
    </div>}
  </div>;
}
