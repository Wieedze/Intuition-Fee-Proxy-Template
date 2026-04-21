interface Props {
  label: string
  value: string
  mono?: boolean
  emphasize?: boolean
}

export function Stat({ label, value, mono = false, emphasize = false }: Props) {
  return (
    <div className={`card ${emphasize ? 'border-brand/30' : ''}`}>
      <div className="text-xs text-subtle">{label}</div>
      <div
        className={`mt-2 ${
          mono
            ? 'font-mono text-xs text-muted break-all'
            : `text-lg ${
                emphasize ? 'text-brand font-semibold' : 'text-ink font-semibold'
              }`
        }`}
      >
        {value}
      </div>
    </div>
  )
}
