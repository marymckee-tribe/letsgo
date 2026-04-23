"use client"

import { useState } from 'react'
import { trpc } from '@/lib/trpc/client'
import type { EmailActionStatus } from '@/lib/store'

type OptimisticPatch = { status: EmailActionStatus; googleId?: string }

export function useCommitAction(input: {
  emailId: string
  actionId: string
  timeZone: string
}) {
  const utils = trpc.useUtils()
  const [lastStatus, setLastStatus] = useState<EmailActionStatus>('PROPOSED')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function patchCache(patch: OptimisticPatch) {
    utils.inbox.digest.setData(undefined, (prev) => {
      if (!prev) return prev
      return {
        ...prev,
        emails: prev.emails.map((e) =>
          e.id !== input.emailId
            ? e
            : {
                ...e,
                suggestedActions: e.suggestedActions.map((a) =>
                  a.id !== input.actionId ? a : { ...a, ...patch },
                ),
              },
        ),
      }
    })
  }

  async function withOptimistic(
    mutationCall: () => Promise<{ action: { status: EmailActionStatus; googleId?: string } }>,
  ) {
    setErrorMessage(null)
    const snapshot = utils.inbox.digest.getData()
    patchCache({ status: 'WRITING' })
    setLastStatus('WRITING')

    try {
      const res = await mutationCall()
      patchCache({ status: res.action.status, googleId: res.action.googleId })
      setLastStatus(res.action.status)
      await utils.inbox.digest.invalidate()
      return res
    } catch (err: unknown) {
      if (snapshot) utils.inbox.digest.setData(undefined, snapshot)
      setLastStatus('PROPOSED')
      setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      throw err
    }
  }

  const commitCalendarMutation = trpc.actions.commitCalendar.useMutation()
  const commitTaskMutation = trpc.actions.commitTask.useMutation()
  const dismissMutation = trpc.actions.dismiss.useMutation()
  const retryMutation = trpc.actions.retry.useMutation()

  return {
    lastStatus,
    errorMessage,
    isPending:
      commitCalendarMutation.isPending ||
      commitTaskMutation.isPending ||
      dismissMutation.isPending ||
      retryMutation.isPending,
    async commitCalendar(opts?: { force?: boolean }) {
      return withOptimistic(() =>
        commitCalendarMutation.mutateAsync({ ...input, force: opts?.force }),
      )
    },
    async commitTask() {
      return withOptimistic(() => commitTaskMutation.mutateAsync(input))
    },
    async dismiss() {
      return withOptimistic(() =>
        dismissMutation.mutateAsync({ emailId: input.emailId, actionId: input.actionId }),
      )
    },
    async retry() {
      return withOptimistic(() => retryMutation.mutateAsync(input))
    },
  }
}
