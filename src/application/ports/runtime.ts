export type Clock = {
  now(): string;
};

export type IdGenerator = {
  next(prefix: string): string;
};

export type RequestFingerprinter = {
  fingerprint(value: unknown): string;
};

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

export class CanonicalJsonFingerprinter implements RequestFingerprinter {
  fingerprint(value: unknown): string {
    return JSON.stringify(canonicalize(value));
  }
}

export class FixedClock implements Clock {
  constructor(private readonly value: string) {}

  now(): string {
    return this.value;
  }
}

export class SequenceIdGenerator implements IdGenerator {
  private sequence = 0;

  next(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }
}
