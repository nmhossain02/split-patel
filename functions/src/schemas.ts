import { z } from 'zod';

const documentId = z.string().trim().min(1).max(128).regex(/^[^/]+$/);
const idempotencyKey = z.string().trim().min(16).max(128).regex(/^[A-Za-z0-9._:-]+$/);
const revision = z.number().int().positive();
const minorAmount = z.number().int().positive().max(9_000_000_000_000);
const currency = z.enum(['AUD', 'CAD', 'EUR', 'GBP', 'INR', 'JPY', 'NZD', 'USD']);
const unicodeText = (maximum: number) => z.string().trim().min(1).max(maximum * 2)
  .refine(value => [...value].length <= maximum, { message: `Must contain at most ${maximum} characters.` });
const optionalUnicodeText = (maximum: number) => z.string().trim().max(maximum * 2)
  .refine(value => [...value].length <= maximum, { message: `Must contain at most ${maximum} characters.` });

const contribution = z.object({
  memberId: documentId,
  amountMinor: minorAmount,
}).strict();

const allocation = z.object({
  memberId: documentId,
  amountMinor: minorAmount,
}).strict();

const expenseItem = z.object({
  id: documentId,
  description: unicodeText(120),
  amountMinor: minorAmount,
  allocations: z.array(allocation).min(1).max(100),
}).strict();

const expenseDraft = z.object({
  description: unicodeText(120),
  currency,
  totalMinor: minorAmount,
  contributions: z.array(contribution).min(1).max(100),
  items: z.array(expenseItem).min(1).max(100),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();

export const tabCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create'),
    name: unicodeText(80),
    currency,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('rename'),
    tabId: documentId,
    name: unicodeText(80),
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('change_currency'),
    tabId: documentId,
    currency,
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('set_archived'),
    tabId: documentId,
    archived: z.boolean(),
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('add_member'),
    tabId: documentId,
    userId: documentId,
    role: z.enum(['admin', 'member']),
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('end_membership'),
    tabId: documentId,
    userId: documentId,
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('set_member_role'),
    tabId: documentId,
    userId: documentId,
    role: z.enum(['owner', 'admin', 'member']),
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('invite_member'),
    tabId: documentId,
    email: z.string().trim().email().max(320),
    role: z.enum(['admin', 'member']),
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('accept_invitation'),
    invitationId: documentId,
    idempotencyKey,
  }).strict(),
]);

export const expenseCommandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_expense'),
    tabId: documentId,
    idempotencyKey,
    draft: expenseDraft,
  }).strict(),
  z.object({
    type: z.literal('edit_expense'),
    tabId: documentId,
    expenseId: documentId,
    expectedRevision: revision,
    idempotencyKey,
    draft: expenseDraft,
  }).strict(),
  z.object({
    type: z.literal('void_expense'),
    tabId: documentId,
    expenseId: documentId,
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
  z.object({
    type: z.literal('create_settlement'),
    tabId: documentId,
    idempotencyKey,
    draft: z.object({
      currency,
      fromMemberId: documentId,
      toMemberId: documentId,
      amountMinor: minorAmount,
      occurredAt: z.string().datetime({ offset: true }),
      method: z.enum(['cash', 'bank', 'venmo', 'paypal', 'cash_app', 'other']).optional(),
      note: optionalUnicodeText(240).nullable().optional(),
    }).strict(),
  }).strict(),
  z.object({
    type: z.literal('void_settlement'),
    tabId: documentId,
    settlementId: documentId,
    expectedRevision: revision,
    idempotencyKey,
  }).strict(),
]);

export type TabCommandInput = z.infer<typeof tabCommandSchema>;
export type ExpenseCommandInput = z.infer<typeof expenseCommandSchema>;
