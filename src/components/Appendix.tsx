import type { AppendixSection } from '../walkthrough/phases'

interface AppendixProps {
  open: boolean
  sections: AppendixSection[]
  onToggle: () => void
  onFocusRanges: (ranges: AppendixSection['codeRanges'] | null) => void
}

export function Appendix({
  open,
  sections,
  onToggle,
  onFocusRanges,
}: AppendixProps) {
  return (
    <section className="panel appendix">
      <div className="appendix__top">
        <div>
          <p className="eyebrow">Appendix</p>
          <h2>Where the weights came from</h2>
        </div>
        <button type="button" onClick={onToggle}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>

      {open ? (
        <div className="appendix__sections">
          {sections.map((section) => (
            <article
              className="appendix__section"
              key={section.id}
              onMouseEnter={() => onFocusRanges(section.codeRanges)}
              onMouseLeave={() => onFocusRanges(null)}
            >
              <h3>{section.title}</h3>
              <p>{section.description}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="appendix__collapsed">
          Training stays offline. This page explains the exact inference path that runs on the exported checkpoint.
        </p>
      )}
    </section>
  )
}
