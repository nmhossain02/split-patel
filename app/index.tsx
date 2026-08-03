import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/hooks/useAuth';
import LoginScreen from '../src/screens/LoginScreen';
import { Text } from 'react-native';

export default function Index() {
  const { user, loading, errorMessage, retryProvisioning } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/tabs');
    }
  }, [router, user]);

  if (loading) {
    return <Text>Loading...</Text>;
  }

  if (user) {
    // This will be briefly visible before the redirect happens
    return <Text>Redirecting...</Text>;
  }

  return <LoginScreen initialErrorMessage={errorMessage} onRetryProvisioning={retryProvisioning} />;
}
