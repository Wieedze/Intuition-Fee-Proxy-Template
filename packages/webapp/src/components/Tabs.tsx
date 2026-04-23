import type { TabId } from '../types'

interface Props {
  active: TabId
  onChange: (t: TabId) => void
  isSponsored: boolean
  isViewer: boolean
}

export function Tabs({ active, onChange, isSponsored, isViewer }: Props) {
  const items: { id: TabId; label: string }[] = isViewer
    ? [
        { id: 'overview', label: 'Overview' },
        { id: 'metrics', label: 'Metrics' },
      ]
    : [
        { id: 'overview', label: 'Overview' },
        { id: 'fee', label: 'Fee' },
        ...(isSponsored
          ? [
              { id: 'sponsoring' as TabId, label: 'Sponsoring' },
              { id: 'history' as TabId, label: 'History' },
            ]
          : []),
        { id: 'metrics', label: 'Metrics' },
        { id: 'admins', label: 'Admins' },
      ]

  return (
    <div className="flex items-center gap-6 border-b border-line">
      {items.map((item) => {
        const isActive = active === item.id
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative pb-3 text-sm transition-colors ${
              isActive ? 'text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {item.label}
            <span
              className={`absolute inset-x-0 -bottom-px h-px transition-opacity ${
                isActive ? 'bg-ink opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        )
      })}
    </div>
  )
}
