import { z } from 'zod'

export const CLASSIFICATION_VALUES = [
  'CALENDAR_EVENT',
  'TODO',
  'NEEDS_REPLY',
  'WAITING_ON',
  'FYI',
  'NEWSLETTER',
] as const

export const ACTION_TYPE_VALUES = ['CALENDAR_EVENT', 'TODO', 'NEEDS_REPLY'] as const

export const ConfidenceSchema = z.enum(['low', 'medium', 'high'])

export const SenderIdentitySchema = z.object({
  personId: z.string().optional(),
  orgName: z.string().optional(),
  confidence: ConfidenceSchema,
})

export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ACTION_TYPE_VALUES),
  title: z.string().min(1),
  date: z.number().nullable().optional(),
  time: z.string().nullable().optional(),
  context: z.string().nullable().optional(),
  sourceQuote: z.string().min(1),
  confidence: ConfidenceSchema,
})

export const ClassifiedEmailSchema = z.object({
  id: z.string().min(1),
  classification: z.enum(CLASSIFICATION_VALUES),
  snippet: z.string(),
  senderIdentity: SenderIdentitySchema.optional(),
  suggestedActions: z.array(SuggestedActionSchema),
})

export const ClassifiedEmailsSchema = z.object({
  emails: z.array(ClassifiedEmailSchema),
})

export type ClassifiedEmail = z.infer<typeof ClassifiedEmailSchema>
export type SuggestedActionShape = z.infer<typeof SuggestedActionSchema>
