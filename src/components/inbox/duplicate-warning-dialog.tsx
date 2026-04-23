"use client"

export function DuplicateWarningDialog({
  existingTitle,
  existingStart,
  onCancel,
  onConfirm,
}: {
  existingTitle: string
  existingStart: string
  onCancel: () => void
  onConfirm: () => void
}) {
  const when = new Date(existingStart).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return (
    <div role="dialog" aria-label="Duplicate event warning" className="duplicate-warning">
      <p>Looks like you already have <strong>{existingTitle}</strong> at {when}. Add anyway?</p>
      <button onClick={onCancel}>Cancel</button>
      <button onClick={onConfirm}>Add anyway</button>
    </div>
  )
}
