import React from 'react';
import {
  Box,
  VStack,
  Text,
  Divider,
  Badge,
  HStack,
  Button,
  useToast,
} from '@chakra-ui/react';
import type { Balance, User } from '../types';
import { paymentService } from '../services/payment';

interface BalanceSummaryProps {
  balances: Balance[];
  currentUser: User;
}

export const BalanceSummary: React.FC<BalanceSummaryProps> = ({
  balances,
  currentUser,
}) => {
  const toast = useToast();

  const handlePayment = async (to: User, amount: number) => {
    try {
      const payment = await paymentService.createPayment(
        amount,
        currentUser,
        to,
        'paypal' // Default to PayPal, but in a real app, you'd let users choose
      );

      toast({
        title: 'Payment initiated',
        description: `Payment of $${amount.toFixed(2)} to ${to.name} is being processed`,
        status: 'success',
        duration: 5000,
      });
    } catch (error) {
      toast({
        title: 'Payment failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      });
    }
  };

  const renderBalance = (balance: Balance) => {
    const isPositive = balance.amount > 0;
    const isCurrentUser = balance.user.id === currentUser.id;

    return (
      <Box
        key={balance.user.id}
        p={4}
        borderWidth={1}
        borderRadius="md"
        bg={isCurrentUser ? 'gray.50' : 'white'}
      >
        <HStack justify="space-between">
          <VStack align="start" spacing={1}>
            <Text fontWeight="bold">{balance.user.name}</Text>
            <Badge
              colorScheme={isPositive ? 'green' : 'red'}
              variant="subtle"
            >
              {isPositive ? 'owes you' : 'you owe'}
            </Badge>
          </VStack>

          <VStack align="end" spacing={2}>
            <Text
              fontWeight="bold"
              color={isPositive ? 'green.500' : 'red.500'}
            >
              {isPositive ? '+' : '-'}${Math.abs(balance.amount).toFixed(2)}
            </Text>

            {!isCurrentUser && (
              <Button
                size="sm"
                colorScheme={isPositive ? 'green' : 'red'}
                onClick={() => handlePayment(balance.user, Math.abs(balance.amount))}
              >
                {isPositive ? 'Request Payment' : 'Pay Now'}
              </Button>
            )}
          </VStack>
        </HStack>
      </Box>
    );
  };

  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" mb={4}>
        Balance Summary
      </Text>
      <VStack spacing={4} align="stretch">
        {balances.map(renderBalance)}
      </VStack>
    </Box>
  );
}; 