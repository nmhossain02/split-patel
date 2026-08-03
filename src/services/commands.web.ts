import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { CreateExpenseCommand, CreateSettlementCommand, EditExpenseCommand, VoidExpenseCommand, VoidSettlementCommand } from '@/application/expenses/commands';
import { AddTabMemberCommand, ChangeTabCurrencyCommand, CreateTabCommand, EndTabMembershipCommand, RenameTabCommand, SetMemberRoleCommand, SetTabArchivedCommand } from '@/application/tabs/commands';
import { Expense } from '@/domain/expenses/types';
import { Settlement } from '@/domain/settlements/types';
import { TabAggregate } from '@/domain/tabs/types';
import { Invitation } from '@/domain/invitations/types';
import { ensureAppCheck } from './app-check.web';
import { app } from './firebase.web';

type WithoutActor<T> = Omit<T, 'actorId'>;
const functions = getFunctions(app, 'us-west1');
if (__DEV__ && process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === 'true') {
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

const call = async <Input, Output>(name: string, input: Input): Promise<Output> => {
  await ensureAppCheck();
  const result = await httpsCallable<Input, Output>(functions, name)(input);
  return result.data;
};

export const provisionAccount = (): Promise<{ uid: string }> => call('provisionAccount', {});
export const createTabCommand = (command: WithoutActor<CreateTabCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'create', ...command });
export const renameTabCommand = (command: WithoutActor<RenameTabCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'rename', ...command });
export const changeTabCurrencyCommand = (command: WithoutActor<ChangeTabCurrencyCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'change_currency', ...command });
export const setTabArchivedCommand = (command: WithoutActor<SetTabArchivedCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'set_archived', ...command });
export const addTabMemberCommand = (command: WithoutActor<AddTabMemberCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'add_member', ...command });
export const endTabMembershipCommand = (command: WithoutActor<EndTabMembershipCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'end_membership', ...command });
export const setMemberRoleCommand = (command: WithoutActor<SetMemberRoleCommand>): Promise<TabAggregate> =>
  call('tabCommand', { type: 'set_member_role', ...command });
export const inviteMemberCommand = (command: {
  tabId: string; email: string; role: 'admin' | 'member'; expectedRevision: number; idempotencyKey: string;
}): Promise<Invitation> => call('tabCommand', { type: 'invite_member', ...command });
export const acceptInvitationCommand = (command: {
  invitationId: string; idempotencyKey: string;
}): Promise<TabAggregate> => call('tabCommand', { type: 'accept_invitation', ...command });
export const createExpenseCommand = (command: WithoutActor<CreateExpenseCommand>): Promise<Expense> =>
  call('expenseCommand', { type: 'create_expense', ...command });
export const editExpenseCommand = (command: WithoutActor<EditExpenseCommand>): Promise<Expense> =>
  call('expenseCommand', { type: 'edit_expense', ...command });
export const voidExpenseCommand = (command: WithoutActor<VoidExpenseCommand>): Promise<Expense> =>
  call('expenseCommand', { type: 'void_expense', ...command });
export const createSettlementCommand = (command: WithoutActor<CreateSettlementCommand>): Promise<Settlement> =>
  call('expenseCommand', { type: 'create_settlement', ...command });
export const voidSettlementCommand = (command: WithoutActor<VoidSettlementCommand>): Promise<Settlement> =>
  call('expenseCommand', { type: 'void_settlement', ...command });
