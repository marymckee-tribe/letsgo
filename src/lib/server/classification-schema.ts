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

// OpenAI structured-outputs strict mode requires every property in `properties`
// to appear in `required`. Optional fields must be expressed as `.nullable()`
// (null-or-value) rather than `.optional()` (may-be-absent). See
// https://platform.openai.com/docs/guides/structured-outputs.
export const SenderIdentitySchema = z.object({
  personId: z.string().nullable(),
  orgName: z.string().nullable(),
  confidence: ConfidenceSchema,
})

export const SuggestedActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(ACTION_TYPE_VALUES),
  title: z.string().min(1),
  date: z.number().nullable(),
  time: z.string().nullable(),
  context: z.string().nullable(),
  sourceQuote: z.string().min(1),
  confidence: ConfidenceSchema,
})

export const ClassifiedEmailSchema = z.object({
  id: z.string().min(1),
  classification: z.enum(CLASSIFICATION_VALUES),
  snippet: z.string(),
  senderIdentity: SenderIdentitySchema.nullable(),
  suggestedActions: z.array(SuggestedActionSchema),
})

export const ClassifiedEmailsSchema = z.object({
  emails: z.array(ClassifiedEmailSchema),
})

export type ClassifiedEmail = z.infer<typeof ClassifiedEmailSchema>
export type SuggestedActionShape = z.infer<typeof SuggestedActionSchema>
