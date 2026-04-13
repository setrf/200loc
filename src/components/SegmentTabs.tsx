import type { MobileTab } from '../walkthrough/reducer'

interface SegmentTabsProps {
  activeTab: MobileTab
  onChange: (tab: MobileTab) => void
}

const tabs: MobileTab[] = ['code', 'story', 'scene']

export function SegmentTabs({ activeTab, onChange }: SegmentTabsProps) {
  return (
    <div className="segment-tabs" role="tablist" aria-label="Mobile sections">
      {tabs.map((tab) => (
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === tab}
          className={activeTab === tab ? 'is-active' : ''}
          key={tab}
          onClick={() => onChange(tab)}
        >
          {tab[0].toUpperCase()}
          {tab.slice(1)}
        </button>
      ))}
    </div>
  )
}
