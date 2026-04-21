import { useEffect, useState } from 'react'
import type { Address } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'

import { useSetProxyName } from '../hooks/useVersionedProxy'

interface Props {
  proxy: Address
  currentName: string
  canEdit: boolean
  onDone: () => void
}

/**
 * Inline-editable proxy title. At rest: just the h1. Double-click (when
 * canEdit) switches to an input with Save / Cancel buttons. Save fires
 * setProxyName on the proxy; receipt success flips back to rest.
 *
 * Only proxy admins can toggle edit mode — for everyone else the title
 * is a plain h1 (no double-click handler, no visible affordance).
 */
export function EditableName({ proxy, currentName, canEdit, onDone }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(currentName)
  const { setName, hash, isPending, error, reset } = useSetProxyName(proxy)
  const receipt = useWaitForTransactionReceipt({ hash })

  useEffect(() => {
    if (receipt.isSuccess) {
      onDone()
      setEditing(false)
      reset()
    }
  }, [hash, receipt.isSuccess])

  const trimmed = draft.trim()
  const valid = new Blob([trimmed]).size <= 32 && trimmed !== currentName

  function enterEdit() {
    if (!canEdit) return
    setDraft(currentName)
    setEditing(true)
  }

  async function onConfirm() {
    if (!valid) return
    try {
      await setName(trimmed)
    } catch (e) {
      console.error(e)
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && valid) onConfirm()
    if (e.key === 'Escape') setEditing(false)
  }

  if (!editing) {
    return (
      <h1
        onDoubleClick={enterEdit}
        title={canEdit ? 'Double-click to rename' : undefined}
        className={`text-2xl font-semibold tracking-tight text-ink ${
          canEdit ? 'cursor-text select-none' : ''
        }`}
      >
        {currentName || <span className="text-subtle">Untitled proxy</span>}
      </h1>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
        placeholder="My DAO Fees"
        maxLength={32}
        className="input text-2xl font-semibold tracking-tight text-ink py-1 px-2 max-w-[420px]"
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
        onClick={() => setEditing(false)}
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
