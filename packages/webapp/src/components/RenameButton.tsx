import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useSetProxyName } from '../hooks/useVersionedProxy'

interface Props {
  proxy: Address
  currentName: string
  onDone: () => void
}

export function RenameButton({ proxy, currentName, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(currentName)
  const { setName, hash, isPending, error, reset } = useSetProxyName(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      setOpen(false)
      reset()
    }
  }, [hash, receipt.isSuccess])

  const trimmed = draft.trim()
  const valid = new Blob([trimmed]).size <= 32 && trimmed !== currentName

  async function onConfirm() {
    if (!valid) return
    try {
      await setName(trimmed)
    } catch (e) {
      console.error(e)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(currentName)
          setOpen(true)
        }}
        className="text-xs text-muted hover:text-ink transition-colors underline underline-offset-2 decoration-dotted"
      >
        {currentName ? 'rename' : 'name this proxy'}
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="My DAO Fees"
        maxLength={32}
        className="input max-w-[220px] py-1 text-sm"
      />
      <button
        type="button"
        onClick={onConfirm}
        disabled={!valid || isPending || receipt.isLoading}
        className="btn-primary text-xs px-3 py-1.5"
      >
        {isPending ? 'Sign…' : receipt.isLoading ? 'Mining…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="btn-secondary text-xs px-3 py-1.5"
      >
        Cancel
      </button>
      {error && (
        <span className="text-xs text-rose-400 font-mono">
          {error.message.split('\n')[0]}
        </span>
      )}
    </div>
  )
}
