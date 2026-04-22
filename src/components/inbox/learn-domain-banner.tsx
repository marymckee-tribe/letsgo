"use client"

import { trpc } from "@/lib/trpc/client"
import { useHub } from "@/lib/store"
import type { Email } from "@/lib/store"

// Extracts the bare domain from "Name <user@example.com>" or "user@example.com"
function domainOf(sender: string): string | null {
  const match = sender.match(/<[^@]+@([^>]+)>/) ?? sender.match(/[^@]+@([^\s]+)/)
  return match ? match[1].toLowerCase() : null
}

interface Props {
  email: Email
}

export function LearnDomainBanner({ email }: Props) {
  const { profiles, appendKnownDomain } = useHub()
  const utils = trpc.useUtils()

  const { data: dismissedData } = trpc.profiles.listDismissedDomains.useQuery(undefined, {
    staleTime: 60_000,
  })

  const dismissMutation = trpc.profiles.dismissDomain.useMutation({
    onMutate: async ({ domain }) => {
      await utils.profiles.listDismissedDomains.cancel()
      const previous = utils.profiles.listDismissedDomains.getData()
      utils.profiles.listDismissedDomains.setData(undefined, (old) => ({
        domains: [...(old?.domains ?? []), domain],
      }))
      return { previous }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) {
        utils.profiles.listDismissedDomains.setData(undefined, context.previous)
      }
    },
    onSettled: () => {
      utils.profiles.listDismissedDomains.invalidate()
    },
  })

  // Guard: must have a resolved personId
  if (!email.senderIdentity?.personId) return null

  // Guard: only show for medium-confidence identifications
  if (email.senderIdentity.confidence !== "medium") return null

  const domain = domainOf(email.sender)

  // Guard: must be able to extract a domain
  if (!domain) return null

  const dismissedDomains = dismissedData?.domains ?? []

  // Guard: already dismissed
  if (dismissedDomains.includes(domain)) return null

  // Guard: look up the profile that matches the personId
  const profile = profiles.find((p) => p.id === email.senderIdentity!.personId)
  if (!profile) return null

  // Guard: profile already knows this domain (exact or subdomain match)
  const knownDomains = profile.knownDomains ?? []
  const alreadyKnown = knownDomains.some(
    (kd) => domain === kd || domain.endsWith(`.${kd}`)
  )
  if (alreadyKnown) return null

  const onAccept = async () => {
    await appendKnownDomain(profile.id, domain)
  }

  const onDecline = () => {
    dismissMutation.mutate({ domain })
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-muted border border-border px-4 py-3 text-xs">
      <span className="text-foreground/70 font-medium">
        Remember{" "}
        <span className="font-mono font-bold text-foreground">{domain}</span> as{" "}
        {profile.name}&apos;s domain?
      </span>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={onAccept}
          className="bg-foreground text-background font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-foreground/80 transition-colors"
        >
          Remember
        </button>
        <button
          onClick={onDecline}
          className="border border-border text-foreground/60 font-bold uppercase tracking-widest px-3 py-1.5 hover:bg-muted/80 transition-colors"
        >
          Not this one
        </button>
      </div>
    </div>
  )
}
