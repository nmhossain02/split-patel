import { z } from 'zod';
import type { User } from '../types';

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

export interface AuthService {
  signUp(email: string, password: string, name: string): Promise<User>;
  signIn(email: string, password: string): Promise<User>;
  signOut(): Promise<void>;
  getCurrentUser(): Promise<User | null>;
  resetPassword(email: string): Promise<void>;
}

// This is a mock implementation. In a real application, you would use a proper auth provider
// like Firebase Auth, Auth0, or your own backend authentication system
export class MockAuthService implements AuthService {
  private currentUser: User | null = null;

  async signUp(email: string, password: string, name: string): Promise<User> {
    // Validate input
    userSchema.parse({ email, password, name });

    // In a real implementation, this would create a user in your auth provider
    const user: User = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      name,
    };

    this.currentUser = user;
    return user;
  }

  async signIn(email: string, password: string): Promise<User> {
    // In a real implementation, this would verify credentials with your auth provider
    const user: User = {
      id: Math.random().toString(36).substr(2, 9),
      email,
      name: 'Test User',
    };

    this.currentUser = user;
    return user;
  }

  async signOut(): Promise<void> {
    this.currentUser = null;
  }

  async getCurrentUser(): Promise<User | null> {
    return this.currentUser;
  }

  async resetPassword(email: string): Promise<void> {
    // In a real implementation, this would trigger a password reset email
    console.log(`Password reset requested for ${email}`);
  }
}

// Export a singleton instance
export const authService = new MockAuthService(); 