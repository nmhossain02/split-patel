import React, { useState } from 'react';
import {
  Box,
  Heading,
  Button,
  VStack,
  HStack,
  Text,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalCloseButton,
  ModalBody,
  ModalFooter,
  Input,
  useDisclosure,
  Divider,
  FormControl,
  FormLabel,
  Select,
  Checkbox,
  CheckboxGroup,
  Stack,
} from '@chakra-ui/react';

interface Expense {
  id: string;
  title: string;
  date: string;
  amount: number;
  paidBy: string;
  assignedTo: string[];
}

interface Tab {
  id: string;
  name: string;
  participants: string[];
  expenses?: Expense[];
}

const mockTabs: Tab[] = [
  { id: '1', name: 'Trip to Paris', participants: ['Alice', 'Bob'], expenses: [] },
  { id: '2', name: 'Roommates', participants: ['Alice', 'Charlie'], expenses: [] },
];

export const TabsPage: React.FC = () => {
  const [tabs, setTabs] = useState<Tab[]>(mockTabs);
  const [selectedTab, setSelectedTab] = useState<Tab | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [newTabName, setNewTabName] = useState('');

  // Expense modal state
  const {
    isOpen: isExpenseOpen,
    onOpen: onExpenseOpen,
    onClose: onExpenseClose,
  } = useDisclosure();
  const [expenseForm, setExpenseForm] = useState({
    title: '',
    date: '',
    amount: '',
    paidBy: '',
    assignedTo: [] as string[],
  });

  const handleAddTab = () => {
    if (newTabName.trim()) {
      setTabs([
        ...tabs,
        { id: Math.random().toString(36).slice(2), name: newTabName, participants: [], expenses: [] },
      ]);
      setNewTabName('');
      onClose();
    }
  };

  const handleExpenseChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setExpenseForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleAssignedToChange = (values: string[]) => {
    setExpenseForm((prev) => ({ ...prev, assignedTo: values }));
  };

  const handleAddExpense = () => {
    if (!selectedTab) return;
    const { title, date, amount, paidBy, assignedTo } = expenseForm;
    if (!title || !date || !amount || !paidBy || assignedTo.length === 0) return;
    const expense: Expense = {
      id: Math.random().toString(36).slice(2),
      title,
      date,
      amount: parseFloat(amount),
      paidBy,
      assignedTo,
    };
    setTabs((prevTabs) =>
      prevTabs.map((tab) =>
        tab.id === selectedTab.id
          ? { ...tab, expenses: [...(tab.expenses || []), expense] }
          : tab
      )
    );
    setSelectedTab((prev) =>
      prev ? { ...prev, expenses: [...(prev.expenses || []), expense] } : prev
    );
    setExpenseForm({ title: '', date: '', amount: '', paidBy: '', assignedTo: [] });
    onExpenseClose();
  };

  return (
    <Box>
      <HStack justify="space-between" mb={4}>
        <Heading size="md">Your Tabs</Heading>
        <Button colorScheme="blue" onClick={onOpen}>Add Tab</Button>
      </HStack>
      <VStack align="stretch" spacing={3}>
        {tabs.map(tab => (
          <Box
            key={tab.id}
            p={4}
            borderWidth={1}
            borderRadius="md"
            bg={selectedTab?.id === tab.id ? 'blue.50' : 'white'}
            cursor="pointer"
            onClick={() => setSelectedTab(tab)}
          >
            <Text fontWeight="bold">{tab.name}</Text>
            <Text fontSize="sm" color="gray.500">
              {tab.participants.length} participant{tab.participants.length !== 1 ? 's' : ''}
            </Text>
          </Box>
        ))}
      </VStack>
      <Modal isOpen={isOpen} onClose={onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add New Tab</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Input
              placeholder="Tab name"
              value={newTabName}
              onChange={e => setNewTabName(e.target.value)}
              autoFocus
            />
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="blue" mr={3} onClick={handleAddTab}>
              Add
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      {selectedTab && (
        <Box mt={8} p={4} borderWidth={1} borderRadius="md" bg="gray.50">
          <HStack justify="space-between" mb={2}>
            <Heading size="sm">{selectedTab.name} Details</Heading>
            <Button size="sm" colorScheme="green" onClick={onExpenseOpen}>
              Add Expense
            </Button>
          </HStack>
          <Divider mb={2} />
          <Text>Participants: {selectedTab.participants.join(', ') || 'None yet'}</Text>
          <Text mt={2} color="gray.500">(Tab details and expenses coming soon)</Text>
          {/* Expenses List */}
          <Box mt={4}>
            <Heading size="xs" mb={2}>Expenses</Heading>
            <VStack align="stretch" spacing={2}>
              {(selectedTab.expenses || []).length === 0 && (
                <Text color="gray.400">No expenses yet.</Text>
              )}
              {(selectedTab.expenses || []).map((exp) => (
                <Box key={exp.id} p={2} borderWidth={1} borderRadius="md" bg="white">
                  <Text fontWeight="bold">{exp.title}</Text>
                  <Text fontSize="sm">Amount: ${exp.amount.toFixed(2)}</Text>
                  <Text fontSize="sm">Paid by: {exp.paidBy}</Text>
                  <Text fontSize="sm">Assigned to: {exp.assignedTo.join(', ')}</Text>
                  <Text fontSize="xs" color="gray.500">{exp.date}</Text>
                </Box>
              ))}
            </VStack>
          </Box>
        </Box>
      )}
      {/* Expense Modal */}
      <Modal isOpen={isExpenseOpen} onClose={onExpenseClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Add Expense</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <FormControl isRequired>
                <FormLabel>Title</FormLabel>
                <Input name="title" value={expenseForm.title} onChange={handleExpenseChange} />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Date</FormLabel>
                <Input type="date" name="date" value={expenseForm.date} onChange={handleExpenseChange} />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Amount</FormLabel>
                <Input type="number" name="amount" value={expenseForm.amount} onChange={handleExpenseChange} />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Paid By</FormLabel>
                <Select name="paidBy" value={expenseForm.paidBy} onChange={handleExpenseChange}>
                  <option value="">Select</option>
                  {selectedTab?.participants.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </Select>
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Assigned To</FormLabel>
                <CheckboxGroup value={expenseForm.assignedTo} onChange={handleAssignedToChange}>
                  <Stack direction="column">
                    {selectedTab?.participants.map((p) => (
                      <Checkbox key={p} value={p}>{p}</Checkbox>
                    ))}
                  </Stack>
                </CheckboxGroup>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button colorScheme="green" mr={3} onClick={handleAddExpense}>
              Add Expense
            </Button>
            <Button variant="ghost" onClick={onExpenseClose}>Cancel</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
}; 