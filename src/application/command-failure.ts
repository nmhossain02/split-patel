export type CommandFailureKind = 'unknown_outcome' | 'correction' | 'conflict' | 'forbidden' | 'retryable';

export type CommandFailure = {
  kind: CommandFailureKind;
  message: string;
};

const codeFrom = (error: unknown): string => {
  if (!error || typeof error !== 'object' || !('code' in error) || typeof error.code !== 'string') return '';
  return error.code.replace(/^functions\//, '');
};

export const classifyCommandFailure = (error: unknown, operation: string): CommandFailure => {
  const code = codeFrom(error);
  if (['deadline-exceeded', 'unavailable', 'internal', 'unknown'].includes(code)) {
    return {
      kind: 'unknown_outcome',
      message: `The ${operation} may have completed, but confirmation was interrupted. The form is locked so retry can safely resolve the same command.`,
    };
  }
  if (['invalid-argument', 'out-of-range'].includes(code)) {
    return { kind: 'correction', message: `The ${operation} contains an invalid value. Correct the entries and retry.` };
  }
  if (['aborted', 'already-exists', 'failed-precondition'].includes(code)) {
    return { kind: 'conflict', message: `The ${operation} conflicts with newer data. Reload before trying again.` };
  }
  if (['permission-denied', 'unauthenticated', 'not-found'].includes(code)) {
    return { kind: 'forbidden', message: `The ${operation} is no longer permitted. Reload to refresh your access.` };
  }
  return { kind: 'retryable', message: `The ${operation} could not be completed. Your entries are preserved for retry.` };
};
