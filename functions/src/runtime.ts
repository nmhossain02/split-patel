import { createHash, randomUUID } from 'node:crypto';
import { Clock, IdGenerator, RequestFingerprinter } from '../../src/application/ports/runtime';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

export class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

export class RandomIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${randomUUID()}`;
  }
}

export class Sha256Fingerprinter implements RequestFingerprinter {
  fingerprint(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
  }
}
