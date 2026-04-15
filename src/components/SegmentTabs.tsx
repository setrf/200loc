import type { MobileTab } from '../walkthrough/reducer'
import type { KeyboardEvent } from 'react'

interface SegmentTabsProps {
  activeTab: MobileTab
  onChange: (tab: MobileTab) => void
}

const tabs: MobileTab[] = ['code', 'story', 'scene']

export function SegmentTabs({ activeTab, onChange }: SegmentTabsProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: MobileTab) {
    const currentIndex = tabs.indexOf(tab)
    if (currentIndex === -1) {
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      onChange(tabs[(currentIndex + 1) % tabs.length]!)
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      onChange(tabs[(currentIndex - 1 + tabs.length) % tabs.length]!)
    }

    if (event.key === 'Home') {
      event.preventDefault()
      onChange(tabs[0]!)
    }

    if (event.key === 'End') {
      event.preventDefault()
      onChange(tabs[tabs.length - 1]!)
    }
  }

  return (
    <div className="segment-tabs" role="group" aria-label="Mobile sections">
      {tabs.map((tab) => (
        <button
          type="button"
          aria-pressed={activeTab === tab}
          className={activeTab === tab ? 'is-active' : ''}
          key={tab}
          onClick={() => onChange(tab)}
          onKeyDown={(event) => handleKeyDown(event, tab)}
        >
          {tab[0].toUpperCase()}
          {tab.slice(1)}
        </button>
      ))}
    </div>
  )
}
