import { initializeApp } from 'firebase-admin/app';

initializeApp();

export { expenseCommand, tabCommand } from './handlers';
export { provisionAccount } from './account';
export { verifyBalanceProjections } from './projections';
