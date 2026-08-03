import { classifyCommandFailure } from '../command-failure';

describe('command failure classification', () => {
  test.each([
    ['functions/deadline-exceeded', 'unknown_outcome'],
    ['functions/unavailable', 'unknown_outcome'],
    ['functions/invalid-argument', 'correction'],
    ['functions/aborted', 'conflict'],
    ['functions/permission-denied', 'forbidden'],
    ['unexpected', 'retryable'],
  ])('maps %s to %s without exposing transport details', (code, kind) => {
    const failure = classifyCommandFailure({ code, details: { token: 'private' } }, 'expense');
    expect(failure.kind).toBe(kind);
    expect(failure.message).not.toContain('private');
  });
});
