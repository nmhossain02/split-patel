export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface Tab {
  id: string;
  name: string;
  participants: User[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseItem {
  id: string;
  name: string;
  amount: number;
  paidBy: User;
  assignedTo: User[];
  expenseId: string;
}

export interface Expense {
  id: string;
  title: string;
  date: Date;
  items: ExpenseItem[];
  tabId: string;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Payment {
  id: string;
  amount: number;
  from: User;
  to: User;
  status: 'pending' | 'completed' | 'failed';
  paymentMethod: 'paypal' | 'venmo' | 'cashapp';
  createdAt: Date;
  updatedAt: Date;
}

export interface Balance {
  user: User;
  amount: number;
  currency: string;
}

export interface TabSummary {
  tab: Tab;
  balances: Balance[];
  totalExpenses: number;
} 