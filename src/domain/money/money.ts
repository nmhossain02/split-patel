import { DomainValidationError, ValidationIssue } from '../shared/errors';

export type CurrencyCode = string;
export type MinorAmount = number;

export const MAX_MINOR_AMOUNT = 9_000_000_000_000;

export const SUPPORTED_CURRENCIES = new Set<CurrencyCode>([
  'AUD',
  'CAD',
  'EUR',
  'GBP',
  'INR',
  'JPY',
  'NZD',
  'USD',
]);

export const validateCurrency = (currency: string, path = 'currency'): ValidationIssue[] => {
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    return [{
      path,
      code: 'unsupported_currency',
      message: `Currency ${currency || '(empty)'} is not supported.`,
    }];
  }
  return [];
};

export const validateMinorAmount = (
  amountMinor: number,
  options: { path?: string; allowZero?: boolean } = {},
): ValidationIssue[] => {
  const path = options.path ?? 'amountMinor';
  const minimum = options.allowZero ? 0 : 1;

  if (!Number.isSafeInteger(amountMinor)) {
    return [{ path, code: 'not_integer', message: 'Amount must be a safe integer.' }];
  }
  if (amountMinor < minimum) {
    return [{
      path,
      code: options.allowZero ? 'negative_amount' : 'non_positive_amount',
      message: options.allowZero ? 'Amount cannot be negative.' : 'Amount must be positive.',
    }];
  }
  if (amountMinor > MAX_MINOR_AMOUNT) {
    return [{ path, code: 'amount_too_large', message: 'Amount exceeds the supported maximum.' }];
  }
  return [];
};

export const assertMinorAmount = (
  amountMinor: number,
  options: { path?: string; allowZero?: boolean } = {},
): void => {
  const issues = validateMinorAmount(amountMinor, options);
  if (issues.length > 0) {
    throw new DomainValidationError('Invalid money amount.', issues);
  }
};

export const sumMinorAmounts = (amounts: readonly number[]): number => {
  let total = 0;
  for (const amount of amounts) {
    if (!Number.isSafeInteger(amount)) {
      throw new DomainValidationError('Invalid money amount.', [{
        path: 'amountMinor',
        code: 'not_integer',
        message: 'Amount must be a safe integer.',
      }]);
    }
    total += amount;
    if (!Number.isSafeInteger(total) || Math.abs(total) > MAX_MINOR_AMOUNT) {
      throw new DomainValidationError('Money total exceeds the supported range.', [{
        path: 'totalMinor',
        code: 'total_out_of_range',
        message: 'Money total exceeds the supported range.',
      }]);
    }
  }
  return total;
};

export const currencyMinorDigits = (currency: CurrencyCode): number => currency === 'JPY' ? 0 : 2;

export const parseMajorAmount = (value: string, currency: CurrencyCode): number => {
  const digits = currencyMinorDigits(currency);
  const normalized = value.trim();
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(normalized)) {
    throw new DomainValidationError('Invalid money amount.', [{
      path: 'amount',
      code: 'invalid_format',
      message: digits === 0
        ? `${currency} amounts must use whole units.`
        : `Amount must use no more than ${digits} decimal places.`,
    }]);
  }
  const [whole, fraction = ''] = normalized.split('.');
  const scale = 10 ** digits;
  const amountMinor = Number(whole) * scale + Number(fraction.padEnd(digits, '0') || 0);
  assertMinorAmount(amountMinor);
  return amountMinor;
};

export const formatMinorAmount = (amountMinor: number, currency: CurrencyCode): string => {
  const digits = currencyMinorDigits(currency);
  const sign = amountMinor < 0 ? '-' : '';
  const absolute = Math.abs(amountMinor);
  if (digits === 0) return `${sign}${currency} ${absolute}`;
  const scale = 10 ** digits;
  const whole = Math.floor(absolute / scale);
  const fraction = String(absolute % scale).padStart(digits, '0');
  return `${sign}${currency} ${whole}.${fraction}`;
};

export const minorAmountInput = (amountMinor: number, currency: CurrencyCode): string => {
  const digits = currencyMinorDigits(currency);
  if (digits === 0) return String(amountMinor);
  const scale = 10 ** digits;
  return `${Math.floor(amountMinor / scale)}.${String(amountMinor % scale).padStart(digits, '0')}`;
};
