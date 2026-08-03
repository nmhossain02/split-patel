import { tabCommandSchema } from '../schemas';

const command = (name: string) => ({
  type: 'create' as const,
  name,
  currency: 'USD',
  idempotencyKey: 'create-tab-key-0001',
});

it('enforces tab name length by Unicode code point rather than UTF-16 unit', () => {
  expect(tabCommandSchema.safeParse(command('😀'.repeat(80))).success).toBe(true);
  expect(tabCommandSchema.safeParse(command('😀'.repeat(81))).success).toBe(false);
  expect(tabCommandSchema.safeParse(command('a'.repeat(81))).success).toBe(false);
});
