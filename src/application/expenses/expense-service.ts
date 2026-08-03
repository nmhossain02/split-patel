import { calculateExpenseDelta, calculateExpenseEffects, assertValidExpense } from '@/domain/expenses/expense';
import { Expense } from '@/domain/expenses/types';
import { calculateSettlementDelta, calculateSettlementEffects, validateSettlement } from '@/domain/settlements/settlement';
import { Settlement } from '@/domain/settlements/types';
import { assertCanPerformTabAction } from '@/domain/tabs/tab';
import { Membership, TabAggregate } from '@/domain/tabs/types';
import { DomainValidationError } from '@/domain/shared/errors';
import { ApplicationError } from '../errors';
import { Clock, IdGenerator, RequestFingerprinter } from '../ports/runtime';
import { ApplicationStore, AuditEvent, MutationRecord, StoreTransaction } from '../ports/store';
import {
  CreateExpenseCommand,
  CreateSettlementCommand,
  EditExpenseCommand,
  VoidExpenseCommand,
  VoidSettlementCommand,
} from './commands';

type ExpenseServiceDependencies = {
  store: ApplicationStore;
  clock: Clock;
  ids: IdGenerator;
  fingerprinter: RequestFingerprinter;
};

export class ExpenseService {
  constructor(private readonly dependencies: ExpenseServiceDependencies) {}

  async createExpense(command: CreateExpenseCommand): Promise<Expense> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const existing = await this.replayExpenseMutation(
        transaction,
        command.tabId,
        command.idempotencyKey,
        command.actorId,
        'create_expense',
        fingerprint,
      );
      if (existing) return existing;

      const { tab, membership } = await this.requireActiveMember(transaction, command.tabId, command.actorId);
      assertCanPerformTabAction(tab, membership, 'create_expense');
      if (command.draft.currency !== tab.currency) {
        throw new ApplicationError('validation_failed', 'Expense currency must match the tab currency.');
      }

      const expense: Expense = {
        id: this.dependencies.ids.next('expense'),
        tabId: tab.id,
        ...command.draft,
        status: 'active',
        createdBy: command.actorId,
        revision: 1,
        idempotencyKey: command.idempotencyKey,
      };
      this.validateExpense(expense, tab);
      await transaction.putExpense(expense);
      await transaction.applyBalanceEffects(tab.id, calculateExpenseEffects(expense));
      await this.recordMutationAndAudit(transaction, {
        tabId: tab.id,
        actorId: command.actorId,
        commandType: 'create_expense',
        fingerprint,
        aggregateId: expense.id,
        previousRevision: null,
        nextRevision: expense.revision,
        idempotencyKey: command.idempotencyKey,
      });
      return expense;
    });
  }

  async editExpense(command: EditExpenseCommand): Promise<Expense> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replayExpenseMutation(
        transaction,
        command.tabId,
        command.idempotencyKey,
        command.actorId,
        'edit_expense',
        fingerprint,
      );
      if (replay) return replay;

      const { tab, membership } = await this.requireActiveMember(transaction, command.tabId, command.actorId);
      const previous = await transaction.getExpense(tab.id, command.expenseId);
      if (!previous) throw new ApplicationError('not_found', 'Expense not found.');
      this.assertCanChangeExpense(previous, membership);
      if (previous.revision !== command.expectedRevision) {
        throw new ApplicationError('conflict', 'Expense has changed since it was loaded.');
      }
      if (command.draft.currency !== tab.currency) {
        throw new ApplicationError('validation_failed', 'Expense currency must match the tab currency.');
      }

      const next: Expense = {
        ...previous,
        ...command.draft,
        revision: previous.revision + 1,
        idempotencyKey: command.idempotencyKey,
      };
      this.validateExpense(next, tab);
      const delta = calculateExpenseDelta(previous, next);
      await transaction.putExpense(next);
      await transaction.applyBalanceEffects(tab.id, delta);
      await this.recordMutationAndAudit(transaction, {
        tabId: tab.id,
        actorId: command.actorId,
        commandType: 'edit_expense',
        fingerprint,
        aggregateId: next.id,
        previousRevision: previous.revision,
        nextRevision: next.revision,
        idempotencyKey: command.idempotencyKey,
      });
      return next;
    });
  }

  async voidExpense(command: VoidExpenseCommand): Promise<Expense> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replayExpenseMutation(
        transaction,
        command.tabId,
        command.idempotencyKey,
        command.actorId,
        'void_expense',
        fingerprint,
      );
      if (replay) return replay;

      const { tab, membership } = await this.requireActiveMember(transaction, command.tabId, command.actorId);
      const previous = await transaction.getExpense(tab.id, command.expenseId);
      if (!previous) throw new ApplicationError('not_found', 'Expense not found.');
      this.assertCanChangeExpense(previous, membership);
      if (previous.revision !== command.expectedRevision) {
        throw new ApplicationError('conflict', 'Expense has changed since it was loaded.');
      }
      if (previous.status === 'voided') return previous;

      const next: Expense = {
        ...previous,
        status: 'voided',
        revision: previous.revision + 1,
        idempotencyKey: command.idempotencyKey,
      };
      const delta = calculateExpenseDelta(previous, next);
      await transaction.putExpense(next);
      await transaction.applyBalanceEffects(tab.id, delta);
      await this.recordMutationAndAudit(transaction, {
        tabId: tab.id,
        actorId: command.actorId,
        commandType: 'void_expense',
        fingerprint,
        aggregateId: next.id,
        previousRevision: previous.revision,
        nextRevision: next.revision,
        idempotencyKey: command.idempotencyKey,
      });
      return next;
    });
  }

  async createSettlement(command: CreateSettlementCommand): Promise<Settlement> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replaySettlementMutation(
        transaction,
        command.tabId,
        command.idempotencyKey,
        command.actorId,
        'create_settlement',
        fingerprint,
      );
      if (replay) return replay;

      const { tab, membership } = await this.requireActiveMember(transaction, command.tabId, command.actorId);
      if (command.actorId !== command.draft.fromMemberId && membership.role === 'member') {
        throw new ApplicationError('forbidden', 'Members may record only settlements they sent.');
      }
      if (command.draft.currency !== tab.currency) {
        throw new ApplicationError('validation_failed', 'Settlement currency must match the tab currency.');
      }
      const settlement: Settlement = {
        id: this.dependencies.ids.next('settlement'),
        tabId: tab.id,
        ...command.draft,
        status: 'active',
        createdBy: command.actorId,
        revision: 1,
        idempotencyKey: command.idempotencyKey,
      };
      const issues = validateSettlement(settlement, new Set(tab.memberIds));
      if (issues.length > 0) throw new DomainValidationError('Settlement is invalid.', issues);
      await transaction.putSettlement(settlement);
      await transaction.applyBalanceEffects(tab.id, calculateSettlementEffects(settlement));
      await this.recordMutationAndAudit(transaction, {
        tabId: tab.id,
        actorId: command.actorId,
        commandType: 'create_settlement',
        fingerprint,
        aggregateId: settlement.id,
        previousRevision: null,
        nextRevision: settlement.revision,
        idempotencyKey: command.idempotencyKey,
      });
      return settlement;
    });
  }

  async voidSettlement(command: VoidSettlementCommand): Promise<Settlement> {
    return this.dependencies.store.transaction(async transaction => {
      const fingerprint = this.dependencies.fingerprinter.fingerprint(command);
      const replay = await this.replaySettlementMutation(
        transaction,
        command.tabId,
        command.idempotencyKey,
        command.actorId,
        'void_settlement',
        fingerprint,
      );
      if (replay) return replay;

      const { tab, membership } = await this.requireActiveMember(transaction, command.tabId, command.actorId);
      const previous = await transaction.getSettlement(tab.id, command.settlementId);
      if (!previous) throw new ApplicationError('not_found', 'Settlement not found.');
      if (membership.role === 'member' && previous.createdBy !== command.actorId) {
        throw new ApplicationError('forbidden', 'Members may void only their own settlements.');
      }
      if (previous.revision !== command.expectedRevision) {
        throw new ApplicationError('conflict', 'Settlement has changed since it was loaded.');
      }
      if (previous.status === 'voided') return previous;

      const next: Settlement = {
        ...previous,
        status: 'voided',
        revision: previous.revision + 1,
        idempotencyKey: command.idempotencyKey,
      };
      const delta = calculateSettlementDelta(previous, next);
      await transaction.putSettlement(next);
      await transaction.applyBalanceEffects(tab.id, delta);
      await this.recordMutationAndAudit(transaction, {
        tabId: tab.id,
        actorId: command.actorId,
        commandType: 'void_settlement',
        fingerprint,
        aggregateId: next.id,
        previousRevision: previous.revision,
        nextRevision: next.revision,
        idempotencyKey: command.idempotencyKey,
      });
      return next;
    });
  }

  private validateExpense(expense: Expense, tab: TabAggregate): void {
    try {
      assertValidExpense(expense, new Set(tab.memberIds));
    } catch (error) {
      if (error instanceof DomainValidationError) throw error;
      throw new ApplicationError('validation_failed', 'Expense is invalid.');
    }
  }

  private assertCanChangeExpense(expense: Expense, membership: Membership): void {
    if (membership.role === 'member' && expense.createdBy !== membership.userId) {
      throw new ApplicationError('forbidden', 'Members may change only their own expenses.');
    }
  }

  private async requireActiveMember(
    transaction: StoreTransaction,
    tabId: string,
    actorId: string,
  ): Promise<{ tab: TabAggregate; membership: Membership }> {
    if (!actorId) throw new ApplicationError('unauthenticated', 'Authentication is required.');
    const tab = await transaction.getTab(tabId);
    if (!tab) throw new ApplicationError('not_found', 'Tab not found.');
    const membership = await transaction.getMembership(tabId, actorId);
    if (!membership || membership.state !== 'active') {
      throw new ApplicationError('forbidden', 'Active tab membership is required.');
    }
    if (tab.status === 'archived') {
      throw new ApplicationError('forbidden', 'Archived tabs are read-only.');
    }
    return { tab, membership };
  }

  private async replayExpenseMutation(
    transaction: StoreTransaction,
    tabId: string,
    key: string,
    actorId: string,
    commandType: string,
    fingerprint: string,
  ): Promise<Expense | null> {
    const mutation = await transaction.getMutation(tabId, key);
    if (!mutation) return null;
    this.assertReplayMatches(mutation, actorId, commandType, fingerprint);
    const expense = await transaction.getExpense(tabId, mutation.aggregateId);
    if (!expense) throw new ApplicationError('conflict', 'Completed mutation result is missing.');
    return expense;
  }

  private async replaySettlementMutation(
    transaction: StoreTransaction,
    tabId: string,
    key: string,
    actorId: string,
    commandType: string,
    fingerprint: string,
  ): Promise<Settlement | null> {
    const mutation = await transaction.getMutation(tabId, key);
    if (!mutation) return null;
    this.assertReplayMatches(mutation, actorId, commandType, fingerprint);
    const settlement = await transaction.getSettlement(tabId, mutation.aggregateId);
    if (!settlement) throw new ApplicationError('conflict', 'Completed mutation result is missing.');
    return settlement;
  }

  private assertReplayMatches(
    mutation: MutationRecord,
    actorId: string,
    commandType: string,
    fingerprint: string,
  ): void {
    if (
      mutation.actorId !== actorId
      || mutation.commandType !== commandType
      || mutation.requestFingerprint !== fingerprint
    ) {
      throw new ApplicationError('idempotency_conflict', 'Idempotency key was used for another request.');
    }
  }

  private async recordMutationAndAudit(
    transaction: StoreTransaction,
    input: {
      tabId: string;
      actorId: string;
      commandType: string;
      fingerprint: string;
      aggregateId: string;
      previousRevision: number | null;
      nextRevision: number;
      idempotencyKey: string;
    },
  ): Promise<void> {
    const occurredAt = this.dependencies.clock.now();
    const mutation: MutationRecord = {
      key: input.idempotencyKey,
      actorId: input.actorId,
      commandType: input.commandType,
      requestFingerprint: input.fingerprint,
      aggregateId: input.aggregateId,
      resultRevision: input.nextRevision,
      completedAt: occurredAt,
    };
    const audit: AuditEvent = {
      id: this.dependencies.ids.next('audit'),
      tabId: input.tabId,
      actorId: input.actorId,
      action: input.commandType,
      aggregateId: input.aggregateId,
      previousRevision: input.previousRevision,
      nextRevision: input.nextRevision,
      occurredAt,
      correlationId: input.idempotencyKey,
    };
    await transaction.putMutation(input.tabId, mutation);
    await transaction.appendAuditEvent(audit);
  }
}
