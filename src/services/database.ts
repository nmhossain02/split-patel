import { PrismaClient } from '@prisma/client';
import type { User, Tab, Expense, ExpenseItem, Payment } from '../types';

const prisma = new PrismaClient();

export class DatabaseService {
  // User operations
  async createUser(data: Omit<User, 'id'>): Promise<User> {
    return prisma.user.create({ data });
  }

  async getUser(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  // Tab operations
  async createTab(data: Omit<Tab, 'id' | 'createdAt' | 'updatedAt'>): Promise<Tab> {
    return prisma.tab.create({
      data: {
        ...data,
        participants: {
          create: data.participants.map(user => ({
            userId: user.id
          }))
        }
      }
    });
  }

  async getTab(id: string): Promise<Tab | null> {
    return prisma.tab.findUnique({
      where: { id },
      include: {
        participants: {
          include: {
            user: true
          }
        }
      }
    });
  }

  // Expense operations
  async createExpense(data: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense> {
    return prisma.expense.create({
      data: {
        ...data,
        items: {
          create: data.items.map(item => ({
            name: item.name,
            amount: item.amount,
            paidById: item.paidBy.id,
            assignedTo: {
              create: item.assignedTo.map(user => ({
                userId: user.id
              }))
            }
          }))
        }
      },
      include: {
        items: {
          include: {
            assignedTo: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });
  }

  async getExpense(id: string): Promise<Expense | null> {
    return prisma.expense.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            assignedTo: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });
  }

  // Payment operations
  async createPayment(data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Payment> {
    return prisma.payment.create({ data });
  }

  async getPayment(id: string): Promise<Payment | null> {
    return prisma.payment.findUnique({
      where: { id },
      include: {
        from: true,
        to: true
      }
    });
  }

  // Balance calculations
  async calculateTabBalances(tabId: string) {
    const expenses = await prisma.expense.findMany({
      where: { tabId },
      include: {
        items: {
          include: {
            assignedTo: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    const balances = new Map<string, number>();

    for (const expense of expenses) {
      for (const item of expense.items) {
        const amountPerPerson = item.amount / item.assignedTo.length;
        
        // Add to paid by user
        balances.set(
          item.paidById,
          (balances.get(item.paidById) || 0) + item.amount
        );

        // Subtract from assigned users
        for (const assignment of item.assignedTo) {
          balances.set(
            assignment.userId,
            (balances.get(assignment.userId) || 0) - amountPerPerson
          );
        }
      }
    }

    return Array.from(balances.entries()).map(([userId, amount]) => ({
      userId,
      amount
    }));
  }
} 