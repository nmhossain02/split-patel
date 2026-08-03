import { Stack } from 'expo-router';
import { AuthProvider } from '../src/hooks/useAuth';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  );
}
