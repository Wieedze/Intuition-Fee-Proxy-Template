interface Props {
  connected: boolean
}

export function ViewerBanner({ connected }: Props) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3 text-xs text-muted flex items-center gap-3">
      <span
        aria-hidden
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-line text-subtle"
      >
        👁
      </span>
      <span className="leading-relaxed">
        <strong className="text-ink font-medium">Read-only view.</strong>{' '}
        {connected
          ? 'Your connected wallet is not an admin of this proxy — management tabs are hidden.'
          : 'Connect the fee-admin or proxyAdmin wallet to manage fees, admins, or versions.'}
      </span>
    </div>
  )
}
