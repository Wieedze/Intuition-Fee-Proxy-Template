interface Props {
  label: string
  value: string
  hint?: string
  loading?: boolean
  emphasize?: boolean
}

export function Metric({
  label,
  value,
  hint,
  loading = false,
  emphasize = false,
}: Props) {
  return (
    <div className={`card ${emphasize ? 'border-brand/30' : ''}`}>
      <div className="text-xs text-subtle">{label}</div>
      {loading ? (
        <div className="mt-2 skeleton h-6 w-16" />
      ) : (
        <div
          className={`mt-2 text-lg font-semibold ${
            emphasize ? 'text-brand' : 'text-ink'
          }`}
        >
          {value}
        </div>
      )}
      {hint && !loading && (
        <div className="mt-1 text-xs text-subtle">{hint}</div>
      )}
    </div>
  )
}
