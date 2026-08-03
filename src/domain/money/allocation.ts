import { DomainValidationError, ValidationIssue } from '../shared/errors';
import { assertMinorAmount } from './money';

export type WeightedMember = {
  memberId: string;
  weight: number;
};

export type MemberAllocation = {
  memberId: string;
  amountMinor: number;
};

const validateWeightedMembers = (members: readonly WeightedMember[]): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();

  if (members.length === 0) {
    issues.push({ path: 'members', code: 'empty', message: 'At least one member is required.' });
  }

  for (const [index, member] of members.entries()) {
    if (!member.memberId.trim()) {
      issues.push({
        path: `members.${index}.memberId`,
        code: 'empty',
        message: 'Member ID is required.',
      });
    } else if (seen.has(member.memberId)) {
      issues.push({
        path: `members.${index}.memberId`,
        code: 'duplicate',
        message: 'A member may appear only once.',
      });
    }
    seen.add(member.memberId);

    if (!Number.isSafeInteger(member.weight) || member.weight <= 0) {
      issues.push({
        path: `members.${index}.weight`,
        code: 'invalid_weight',
        message: 'Weight must be a positive safe integer.',
      });
    }
  }

  return issues;
};

export const allocateWeighted = (
  amountMinor: number,
  members: readonly WeightedMember[],
): MemberAllocation[] => {
  assertMinorAmount(amountMinor);
  const issues = validateWeightedMembers(members);
  if (issues.length > 0) {
    throw new DomainValidationError('Invalid weighted allocation.', issues);
  }

  const totalWeight = members.reduce((sum, member) => sum + BigInt(member.weight), 0n);
  const amount = BigInt(amountMinor);
  const calculated = members.map(member => {
    const numerator = amount * BigInt(member.weight);
    return {
      memberId: member.memberId,
      amountMinor: Number(numerator / totalWeight),
      remainder: numerator % totalWeight,
    };
  });

  const allocated = calculated.reduce((sum, item) => sum + item.amountMinor, 0);
  let remaining = amountMinor - allocated;
  const remainderOrder = [...calculated].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.memberId.localeCompare(right.memberId);
    }
    return left.remainder > right.remainder ? -1 : 1;
  });

  for (let index = 0; remaining > 0; index += 1, remaining -= 1) {
    remainderOrder[index].amountMinor += 1;
  }

  return calculated
    .map(({ memberId, amountMinor: allocatedMinor }) => ({ memberId, amountMinor: allocatedMinor }))
    .sort((left, right) => left.memberId.localeCompare(right.memberId));
};

export const allocateEqual = (
  amountMinor: number,
  memberIds: readonly string[],
): MemberAllocation[] => allocateWeighted(
  amountMinor,
  memberIds.map(memberId => ({ memberId, weight: 1 })),
);

export const allocatePercentages = (
  amountMinor: number,
  percentagesInBasisPoints: readonly WeightedMember[],
): MemberAllocation[] => {
  const total = percentagesInBasisPoints.reduce((sum, item) => sum + item.weight, 0);
  if (total !== 10_000) {
    throw new DomainValidationError('Percentages must total 100%.', [{
      path: 'percentages',
      code: 'percentage_total',
      message: 'Percentages must total exactly 10,000 basis points.',
    }]);
  }
  return allocateWeighted(amountMinor, percentagesInBasisPoints);
};
