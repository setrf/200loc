import type { MobileTab } from '../walkthrough/reducer'
import { useRef, type KeyboardEvent } from 'react'

interface SegmentTabsProps {
  activeTab: MobileTab
  onChange: (tab: MobileTab) => void
}

const tabs: MobileTab[] = ['code', 'scene']

export function SegmentTabs({ activeTab, onChange }: SegmentTabsProps) {
  const tabRefs = useRef<Record<MobileTab, HTMLButtonElement | null>>({
    code: null,
    scene: null,
  })

  function selectTab(tab: MobileTab) {
    onChange(tab)
    tabRefs.current[tab]?.focus()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabs.indexOf(activeTab)

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      selectTab(tabs[(currentIndex + 1) % tabs.length]!)
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      selectTab(tabs[(currentIndex - 1 + tabs.length) % tabs.length]!)
    }

    if (event.key === 'Home') {
      event.preventDefault()
      selectTab(tabs[0]!)
    }

    if (event.key === 'End') {
      event.preventDefault()
      selectTab(tabs[tabs.length - 1]!)
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
          onKeyDown={handleKeyDown}
          ref={(node) => {
            tabRefs.current[tab] = node
          }}
        >
          {tab[0].toUpperCase()}
          {tab.slice(1)}
        </button>
      ))}
    </div>
  )
}
