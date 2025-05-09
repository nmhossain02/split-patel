import React, { useState } from 'react';
import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  HStack,
  Text,
  useToast,
  Select,
  Checkbox,
  CheckboxGroup,
} from '@chakra-ui/react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { User, ExpenseItem } from '../types';

const expenseSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  items: z.array(
    z.object({
      name: z.string().min(1, 'Item name is required'),
      amount: z.number().min(0.01, 'Amount must be greater than 0'),
      paidBy: z.string().min(1, 'Paid by is required'),
      assignedTo: z.array(z.string()).min(1, 'At least one person must be assigned'),
    })
  ).min(1, 'At least one item is required'),
});

type ExpenseFormData = z.infer<typeof expenseSchema>;

interface ExpenseFormProps {
  participants: User[];
  onSubmit: (data: ExpenseFormData) => Promise<void>;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({ participants, onSubmit }) => {
  const toast = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      items: [{ name: '', amount: 0, paidBy: '', assignedTo: [] }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const onFormSubmit = async (data: ExpenseFormData) => {
    try {
      setIsSubmitting(true);
      await onSubmit(data);
      toast({
        title: 'Expense created',
        status: 'success',
        duration: 3000,
      });
    } catch (error) {
      toast({
        title: 'Error creating expense',
        description: error instanceof Error ? error.message : 'Unknown error',
        status: 'error',
        duration: 5000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box as="form" onSubmit={handleSubmit(onFormSubmit)}>
      <VStack spacing={4} align="stretch">
        <FormControl isInvalid={!!errors.title}>
          <FormLabel>Title</FormLabel>
          <Input {...register('title')} />
          {errors.title && (
            <Text color="red.500">{errors.title.message}</Text>
          )}
        </FormControl>

        <FormControl isInvalid={!!errors.date}>
          <FormLabel>Date</FormLabel>
          <Input type="date" {...register('date')} />
          {errors.date && (
            <Text color="red.500">{errors.date.message}</Text>
          )}
        </FormControl>

        {fields.map((field, index) => (
          <Box key={field.id} p={4} borderWidth={1} borderRadius="md">
            <VStack spacing={4}>
              <FormControl isInvalid={!!errors.items?.[index]?.name}>
                <FormLabel>Item Name</FormLabel>
                <Input {...register(`items.${index}.name`)} />
                {errors.items?.[index]?.name && (
                  <Text color="red.500">{errors.items[index]?.name?.message}</Text>
                )}
              </FormControl>

              <FormControl isInvalid={!!errors.items?.[index]?.amount}>
                <FormLabel>Amount</FormLabel>
                <Input
                  type="number"
                  step="0.01"
                  {...register(`items.${index}.amount`, { valueAsNumber: true })}
                />
                {errors.items?.[index]?.amount && (
                  <Text color="red.500">{errors.items[index]?.amount?.message}</Text>
                )}
              </FormControl>

              <FormControl isInvalid={!!errors.items?.[index]?.paidBy}>
                <FormLabel>Paid By</FormLabel>
                <Select {...register(`items.${index}.paidBy`)}>
                  <option value="">Select a person</option>
                  {participants.map((participant) => (
                    <option key={participant.id} value={participant.id}>
                      {participant.name}
                    </option>
                  ))}
                </Select>
                {errors.items?.[index]?.paidBy && (
                  <Text color="red.500">{errors.items[index]?.paidBy?.message}</Text>
                )}
              </FormControl>

              <FormControl isInvalid={!!errors.items?.[index]?.assignedTo}>
                <FormLabel>Assigned To</FormLabel>
                <CheckboxGroup>
                  <VStack align="start">
                    {participants.map((participant) => (
                      <Checkbox
                        key={participant.id}
                        value={participant.id}
                        {...register(`items.${index}.assignedTo`)}
                      >
                        {participant.name}
                      </Checkbox>
                    ))}
                  </VStack>
                </CheckboxGroup>
                {errors.items?.[index]?.assignedTo && (
                  <Text color="red.500">{errors.items[index]?.assignedTo?.message}</Text>
                )}
              </FormControl>

              {index > 0 && (
                <Button
                  colorScheme="red"
                  size="sm"
                  onClick={() => remove(index)}
                >
                  Remove Item
                </Button>
              )}
            </VStack>
          </Box>
        ))}

        <Button
          type="button"
          onClick={() => append({ name: '', amount: 0, paidBy: '', assignedTo: [] })}
        >
          Add Item
        </Button>

        <Button
          type="submit"
          colorScheme="blue"
          isLoading={isSubmitting}
          loadingText="Creating Expense"
        >
          Create Expense
        </Button>
      </VStack>
    </Box>
  );
}; 