import type { Payment, User } from '../types';

export type PaymentMethod = 'paypal' | 'venmo' | 'cashapp';

export interface PaymentService {
  createPayment(
    amount: number,
    from: User,
    to: User,
    method: PaymentMethod
  ): Promise<Payment>;
  getPaymentStatus(paymentId: string): Promise<Payment['status']>;
  cancelPayment(paymentId: string): Promise<void>;
}

// This is a mock implementation. In a real application, you would integrate with
// actual payment providers like PayPal, Venmo, or Cash App
export class MockPaymentService implements PaymentService {
  private payments: Map<string, Payment> = new Map();

  async createPayment(
    amount: number,
    from: User,
    to: User,
    method: PaymentMethod
  ): Promise<Payment> {
    const payment: Payment = {
      id: Math.random().toString(36).substr(2, 9),
      amount,
      from,
      to,
      status: 'pending',
      paymentMethod: method,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.payments.set(payment.id, payment);

    // Simulate payment processing
    setTimeout(() => {
      const storedPayment = this.payments.get(payment.id);
      if (storedPayment) {
        storedPayment.status = 'completed';
        storedPayment.updatedAt = new Date();
      }
    }, 2000);

    return payment;
  }

  async getPaymentStatus(paymentId: string): Promise<Payment['status']> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }
    return payment.status;
  }

  async cancelPayment(paymentId: string): Promise<void> {
    const payment = this.payments.get(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }
    if (payment.status === 'completed') {
      throw new Error('Cannot cancel completed payment');
    }
    payment.status = 'failed';
    payment.updatedAt = new Date();
  }
}

// Export a singleton instance
export const paymentService = new MockPaymentService(); 