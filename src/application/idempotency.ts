import { randomUUID } from 'expo-crypto';

export const createIdempotencyKey = (operation: string): string => `${operation}:${randomUUID()}`;
