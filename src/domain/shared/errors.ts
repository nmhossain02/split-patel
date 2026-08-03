export type ValidationIssue = {
  path: string;
  code: string;
  message: string;
};

export class DomainValidationError extends Error {
  readonly issues: ValidationIssue[];

  constructor(message: string, issues: ValidationIssue[]) {
    super(message);
    this.name = 'DomainValidationError';
    this.issues = issues;
  }
}

export class DomainInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DomainInvariantError';
  }
}
