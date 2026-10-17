import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { GalaxyEffortSlider } from '../src/ui/GalaxyEffortSlider'
import type { EffortOption } from '../src/ui-contract'
import './showcase.css'

// These sample capabilities mirror the DeepSeek model shown in the local preview.
// This standalone presentation deliberately has no Host, storage, or API adapter.
const options: readonly EffortOption[] = [
  { value: 'off', label: 'Off' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
]

function Showcase() {
  const [value, setValue] = useState('high')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    setTheme(next)
  }

  return <div className="showcase">
    <header className="showcase-header">
      <span className="showcase-brand">DeepSeek Harness <span>银河推理滑块</span></span>
      <button className="showcase-theme" type="button" onClick={toggleTheme}
        aria-label={`切换${theme === 'dark' ? '浅色' : '深色'}外观`} title={`切换${theme === 'dark' ? '浅色' : '深色'}外观`}>
        {theme === 'dark'
          ? <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
          : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.1 14.6A8.7 8.7 0 0 1 9.4 3.9a8.7 8.7 0 1 0 10.7 10.7Z"/></svg>}
      </button>
    </header>
    <main className="showcase-stage">
      <div className="showcase-intro">
        <h1>把思考交给星河。</h1>
        <p>轻轻一滑，找到这一次的思考力度。</p>
      </div>
      <section className="showcase-composer" aria-label="消息输入栏演示">
        <textarea aria-label="消息输入演示" placeholder="今天，想一起探索什么？" spellCheck={false}/>
        <div className="showcase-toolbar">
          <span className="showcase-model">DeepSeek Flash</span>
          <GalaxyEffortSlider options={options} value={value} onCommit={async next => { setValue(next) }}
            disabled={false} pending={false} modelLabel="DeepSeek Flash"/>
        </div>
      </section>
      <p className="showcase-hint">点击「思考力度」展开，拖动鲸鱼女孩选择档位。</p>
    </main>
    <footer className="showcase-footer">交互演示 · 仅在本页切换，不连接模型或保存设置</footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<Showcase />)
