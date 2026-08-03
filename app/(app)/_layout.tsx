import React from 'react';
import { Stack, Redirect } from 'expo-router';
import { useAuth } from '../../src/hooks/useAuth';
import { Text } from 'react-native';

const AppLayout = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (!user) {
    return <Redirect href="/" />;
  }

  return (
    <Stack>
      <Stack.Screen name="tabs/index" options={{ title: 'My Tabs' }} />
      <Stack.Screen name="tabs/create" options={{ title: 'Create New Tab' }} />
      <Stack.Screen name="tabs/[id]/index" options={{ title: 'Tab Details' }} />
      <Stack.Screen name="tabs/[id]/expenses/create" options={{ title: 'New Expense' }} />
      <Stack.Screen name="tabs/[id]/expenses/[expenseId]/index" options={{ title: 'Expense' }} />
      <Stack.Screen name="tabs/[id]/expenses/[expenseId]/edit" options={{ title: 'Edit Expense' }} />
      <Stack.Screen name="tabs/[id]/settlement" options={{ title: 'Record Settlement' }} />
      <Stack.Screen name="tabs/[id]/settlements/[settlementId]" options={{ title: 'Settlement' }} />
      <Stack.Screen name="tabs/[id]/settings" options={{ title: 'Manage Tab' }} />
    </Stack>
  );
};

export default AppLayout;
