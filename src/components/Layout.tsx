import React, { ReactNode } from 'react';
import {
  Box,
  Flex,
  IconButton,
  Avatar,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  VStack,
  HStack,
  Text,
} from '@chakra-ui/react';
import { HamburgerIcon } from '@chakra-ui/icons';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
  user?: { name: string; avatar?: string };
}

const navLinks = [
  { label: 'Dashboard', to: '/' },
  { label: 'Tabs', to: '/tabs' },
  { label: 'Expenses', to: '/expenses' },
  { label: 'Profile', to: '/profile' },
];

export const Layout: React.FC<LayoutProps> = ({ children, user }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const location = useLocation();

  return (
    <Box minH="100vh" bg="gray.50">
      <Flex
        as="header"
        align="center"
        justify="space-between"
        px={4}
        py={3}
        bg="white"
        boxShadow="sm"
        position="sticky"
        top={0}
        zIndex={10}
      >
        <HStack spacing={3}>
          <IconButton
            aria-label="Open menu"
            icon={<HamburgerIcon />}
            variant="ghost"
            onClick={onOpen}
            display={{ base: 'inline-flex', md: 'none' }}
          />
          <Text fontWeight="bold" fontSize="xl">
            SplitPatel
          </Text>
        </HStack>
        {user && (
          <HStack spacing={2}>
            <Text fontSize="md">{user.name}</Text>
            <Avatar size="sm" name={user.name} src={user.avatar} />
          </HStack>
        )}
      </Flex>
      <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
        <DrawerOverlay />
        <DrawerContent>
          <DrawerCloseButton />
          <DrawerHeader>Menu</DrawerHeader>
          <DrawerBody>
            <VStack align="start" spacing={4}>
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  style={{
                    fontWeight: location.pathname === link.to ? 'bold' : 'normal',
                    width: '100%',
                  }}
                  onClick={onClose}
                >
                  {link.label}
                </Link>
              ))}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
      <Box as="main" p={4} pt={6} maxW="600px" mx="auto">
        {children}
      </Box>
    </Box>
  );
}; 