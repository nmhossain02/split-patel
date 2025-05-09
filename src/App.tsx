import React, { useState, useEffect } from 'react';
import {
  ChakraProvider,
  Box,
  VStack,
  Heading,
  Button,
} from '@chakra-ui/react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { authService } from './services/auth';
import type { User } from './types';
import { TabsPage } from './pages/TabsPage';

function Dashboard() {
  return <Heading size="md">Dashboard (Coming Soon)</Heading>;
}
function ExpensesPage() {
  return <Heading size="md">Expenses (Coming Soon)</Heading>;
}
function ProfilePage() {
  return <Heading size="md">Profile (Coming Soon)</Heading>;
}

function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const user = await authService.getCurrentUser();
      if (user) setCurrentUser(user);
    };
    checkAuth();
  }, []);

  if (!currentUser) {
    return (
      <ChakraProvider>
        <Box p={8}>
          <VStack spacing={4}>
            <Heading>Welcome to SplitPatel</Heading>
            <Button
              colorScheme="blue"
              onClick={async () => {
                const user = await authService.signIn('test@example.com', 'password');
                setCurrentUser(user);
              }}
            >
              Sign In
            </Button>
          </VStack>
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider>
      <Router>
        <Layout user={currentUser}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/tabs" element={<TabsPage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </Layout>
      </Router>
    </ChakraProvider>
  );
}

export default App;
