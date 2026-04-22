import { z } from 'zod'
import { router, protectedProcedure } from '../index'
import {
  listProfiles,
  upsertProfile,
  seedProfilesIfEmpty,
  appendKnownDomain,
  listDismissedDomains,
  dismissDomain,
} from '@/lib/server/profiles'

const ProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['Adult', 'Child', 'Pet']),
  currentContext: z.string(),
  preferences: z.array(z.string()),
  routines: z.array(z.string()),
  sizes: z.record(z.string(), z.string()),
  medicalNotes: z.string(),
  knownDomains: z.array(z.string()).optional(),
  knownSenders: z.array(z.string()).optional(),
})

const DomainRe = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i

const LearnDomainInput = z.object({
  profileId: z.string().min(1),
  domain: z.string().regex(DomainRe, 'Expect a bare domain like "example.com"'),
})

const DismissDomainInput = z.object({
  domain: z.string().regex(DomainRe, 'Expect a bare domain like "example.com"'),
})

export const profilesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const profiles = await seedProfilesIfEmpty(ctx.uid)
    return { profiles }
  }),

  upsert: protectedProcedure
    .input(ProfileSchema)
    .mutation(async ({ ctx, input }) => {
      await upsertProfile(ctx.uid, input)
      const profiles = await listProfiles(ctx.uid)
      return { profiles }
    }),

  learnDomain: protectedProcedure
    .input(LearnDomainInput)
    .mutation(async ({ ctx, input }) => {
      await appendKnownDomain(ctx.uid, input.profileId, input.domain.toLowerCase())
      return { ok: true as const }
    }),

  listDismissedDomains: protectedProcedure.query(async ({ ctx }) => {
    const domains = await listDismissedDomains(ctx.uid)
    return { domains }
  }),

  dismissDomain: protectedProcedure
    .input(DismissDomainInput)
    .mutation(async ({ ctx, input }) => {
      await dismissDomain(ctx.uid, input.domain.toLowerCase())
      return { ok: true as const }
    }),
})
