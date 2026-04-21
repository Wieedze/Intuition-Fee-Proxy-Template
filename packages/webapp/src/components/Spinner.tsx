interface Props {
  size?: 'sm' | 'md'
  ariaLabel?: string
}

/**
 * Small monochrome spinner (inherits `currentColor`). Used for the discrete
 * "refreshing" indicator next to card titles and inline inside buttons.
 */
export function Spinner({ size = 'sm', ariaLabel = 'Loading' }: Props) {
  const dim = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  return (
    <span
      aria-hidden
      aria-label={ariaLabel}
      className={`inline-block ${dim} rounded-full border border-current border-r-transparent animate-spin opacity-60`}
    />
  )
}
