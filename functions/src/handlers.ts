import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { ZodError } from 'zod';
import { ExpenseService } from '../../src/application/expenses/expense-service';
import { TabService } from '../../src/application/tabs/tab-service';
import { ApplicationError } from '../../src/application/errors';
import { DomainValidationError } from '../../src/domain/shared/errors';
import { FirestoreApplicationStore } from './firestore-store';
import { RandomIdGenerator, Sha256Fingerprinter, SystemClock } from './runtime';
import {
  ExpenseCommandInput,
  expenseCommandSchema,
  TabCommandInput,
  tabCommandSchema,
} from './schemas';

const callableOptions = {
  region: 'us-west1',
  timeoutSeconds: 30,
  memory: '256MiB' as const,
  maxInstances: 20,
  concurrency: 40,
  enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== 'true',
};

const dependencies = () => {
  const common = {
    store: new FirestoreApplicationStore(getFirestore()),
    clock: new SystemClock(),
    ids: new RandomIdGenerator(),
    fingerprinter: new Sha256Fingerprinter(),
  };
  return {
    tabs: new TabService(common),
    expenses: new ExpenseService(common),
  };
};

const authenticatedUid = (request: CallableRequest): string => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication is required.');
  return uid;
};

const assertActiveAccount = async (uid: string): Promise<void> => {
  const snapshot = await getFirestore().doc(`users/${uid}`).get();
  if (!snapshot.exists || snapshot.data()?.accountStatus !== 'active') {
    throw new HttpsError('permission-denied', 'An active provisioned account is required.');
  }
};

const assertInviteLookupAllowed = async (actorId: string, input: TabCommandInput): Promise<void> => {
  if (input.type !== 'invite_member') return;
  const [tab, membership] = await Promise.all([
    getFirestore().doc(`tabs/${input.tabId}`).get(),
    getFirestore().doc(`tabs/${input.tabId}/members/${actorId}`).get(),
  ]);
  const role = membership.data()?.role;
  const allowed = tab.data()?.status === 'active'
    && membership.data()?.state === 'active'
    && (role === 'owner' || (role === 'admin' && input.role === 'member'));
  if (!allowed) throw new HttpsError('permission-denied', 'You cannot invite members to this tab.');
};

export const executeTabCommand = async (
  input: TabCommandInput,
  actorId: string,
  service = dependencies().tabs,
) => {
  switch (input.type) {
    case 'create':
      return service.createTab({ ...input, actorId });
    case 'rename':
      return service.renameTab({ ...input, actorId });
    case 'change_currency':
      return service.changeCurrency({ ...input, actorId });
    case 'set_archived':
      return service.setArchived({ ...input, actorId });
    case 'add_member':
      return service.addMember({ ...input, actorId });
    case 'end_membership':
      return service.endMembership({ ...input, actorId });
    case 'set_member_role':
      return service.setMemberRole({ ...input, actorId });
    case 'invite_member': {
      const matches = await getFirestore().collection('users')
        .where('emailNormalized', '==', input.email.toLocaleLowerCase('en-US')).limit(2).get();
      if (matches.size !== 1 || matches.docs[0].data().accountStatus !== 'active') {
        throw new ApplicationError('not_found', 'That account could not be invited.');
      }
      return service.inviteMember({
        actorId, tabId: input.tabId, recipientUserId: matches.docs[0].id, role: input.role,
        expectedRevision: input.expectedRevision, idempotencyKey: input.idempotencyKey,
      });
    }
    case 'accept_invitation':
      return service.acceptInvitation({ ...input, actorId });
  }
};

export const executeExpenseCommand = async (
  input: ExpenseCommandInput,
  actorId: string,
  service = dependencies().expenses,
) => {
  switch (input.type) {
    case 'create_expense':
      return service.createExpense({ ...input, actorId });
    case 'edit_expense':
      return service.editExpense({ ...input, actorId });
    case 'void_expense':
      return service.voidExpense({ ...input, actorId });
    case 'create_settlement':
      return service.createSettlement({ ...input, actorId });
    case 'void_settlement':
      return service.voidSettlement({ ...input, actorId });
  }
};

const translateError = (error: unknown, context: Record<string, unknown>): never => {
  if (error instanceof HttpsError) throw error;
  if (error instanceof ZodError) {
    throw new HttpsError('invalid-argument', 'Command input is invalid.', {
      issues: error.issues.map(issue => ({ path: issue.path.join('.'), code: issue.code })),
    });
  }
  if (error instanceof DomainValidationError) {
    const code = error.issues.some(issue => issue.code === 'forbidden')
      ? 'permission-denied'
      : error.issues.some(issue => issue.code === 'conflict' || issue.code === 'archived')
        ? 'failed-precondition'
        : 'invalid-argument';
    throw new HttpsError(code, error.message, { issues: error.issues });
  }
  if (error instanceof ApplicationError) {
    const codes = {
      unauthenticated: 'unauthenticated',
      forbidden: 'permission-denied',
      not_found: 'not-found',
      validation_failed: 'invalid-argument',
      conflict: 'aborted',
      idempotency_conflict: 'already-exists',
    } as const;
    throw new HttpsError(codes[error.code], error.message, { code: error.code });
  }
  logger.error('Unhandled command error', { ...context, error });
  throw new HttpsError('internal', 'The command could not be completed.');
};

export const tabCommand = onCall(callableOptions, async request => {
  const actorId = authenticatedUid(request);
  const startedAt = Date.now();
  let type = 'invalid';
  try {
    await assertActiveAccount(actorId);
    const input = tabCommandSchema.parse(request.data);
    type = input.type;
    await assertInviteLookupAllowed(actorId, input);
    if (input.type === 'add_member') await assertActiveAccount(input.userId);
    const result = await executeTabCommand(input, actorId);
    logger.info('Tab command completed', {
      actorId,
      commandType: type,
      aggregateId: result.id,
      correlationId: input.idempotencyKey,
      latencyMs: Date.now() - startedAt,
      result: 'success',
    });
    return result;
  } catch (error) {
    return translateError(error, { actorId, commandType: type, latencyMs: Date.now() - startedAt });
  }
});

export const expenseCommand = onCall(callableOptions, async request => {
  const actorId = authenticatedUid(request);
  const startedAt = Date.now();
  let type = 'invalid';
  try {
    await assertActiveAccount(actorId);
    const input = expenseCommandSchema.parse(request.data);
    type = input.type;
    const result = await executeExpenseCommand(input, actorId);
    logger.info('Expense command completed', {
      actorId,
      tabId: input.tabId,
      commandType: type,
      aggregateId: result.id,
      correlationId: input.idempotencyKey,
      latencyMs: Date.now() - startedAt,
      result: 'success',
    });
    return result;
  } catch (error) {
    return translateError(error, { actorId, commandType: type, latencyMs: Date.now() - startedAt });
  }
});
