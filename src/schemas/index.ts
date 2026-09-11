// ============================================================
//  ZOD SCHEMAS — Request Validation Layer for GlobalPay
// ============================================================

import { z } from 'zod';
import Decimal from 'decimal.js';

const CURRENCIES = ['USD', 'INR', 'GBP', 'EUR', 'AED', 'JPY'] as const;

/**
 * Validates that an amount is provided as a non-empty string representing
 * a strictly positive exact decimal number.
 */
const positiveDecimalString = (field = 'amount') =>
  z
    .string({ message: `${field} must be a positive number` })
    .trim()
    .min(1, `${field} is required`)
    .regex(/^\d+(\.\d+)?$/, `${field} must be a positive number`)
    .refine(
      (val) => {
        try {
          return new Decimal(val).gt(0);
        } catch {
          return false;
        }
      },
      { message: `${field} must be a positive number` }
    );

/**
 * Transfer Request Schema
 * Body for POST /api/transfer
 */
export const transferSchema = z
  .object({
    senderId: z.string({ message: 'senderId is required' }).min(1, 'senderId is required'),
    receiverId: z.string({ message: 'receiverId is required' }).min(1, 'receiverId is required'),
    amount: positiveDecimalString('amount'),
    sourceCurrency: z.enum(CURRENCIES, {
      message: 'sourceCurrency is required and must be a supported currency',
    }),
    destCurrency: z.enum(CURRENCIES, {
      message: 'destCurrency is required and must be a supported currency',
    }),
  })
  .refine((data) => data.senderId !== data.receiverId, {
    message: 'Cannot transfer to yourself',
    path: ['receiverId'],
  });

export type TransferSchemaInput = z.infer<typeof transferSchema>;

/**
 * Deposit Request Schema
 * Body for POST /api/deposit
 */
export const depositSchema = z.object({
  amount: positiveDecimalString('amount'),
  currency: z
    .string({ message: 'currency is required' })
    .min(1, 'currency is required'),
  demo: z.boolean().optional(),
});

export type DepositSchemaInput = z.infer<typeof depositSchema>;

/**
 * Withdraw Request Schema
 * Body for POST /api/withdraw
 */
export const withdrawSchema = z.object({
  amount: positiveDecimalString('amount'),
  destinationAccountId: z
    .string({ message: 'destinationAccountId is required' })
    .min(1, 'destinationAccountId is required'),
});

export type WithdrawSchemaInput = z.infer<typeof withdrawSchema>;

/**
 * Settlement Run Request Schema
 * Body for POST /api/settlement/run
 */
export const settlementRunSchema = z
  .object({
    batchSize: z
      .number({ message: 'batchSize must be a positive integer' })
      .int('batchSize must be a positive integer')
      .positive('batchSize must be a positive integer')
      .optional(),
  })
  .strict()
  .optional()
  .default({});

export type SettlementRunSchemaInput = z.infer<typeof settlementRunSchema>;

/**
 * Login Request Schema
 * Body for POST /api/login and POST /api/auth/login
 */
export const loginSchema = z.object({
  userId: z
    .string({ message: 'userId is required' })
    .trim()
    .min(1, 'userId is required'),
  password: z.string().optional(),
});

export type LoginSchemaInput = z.infer<typeof loginSchema>;

/**
 * Signup Request Schema
 * Body for POST /api/auth/signup and POST /api/signup
 */
export const signupSchema = z.object({
  userId: z
    .string({ message: 'userId is required' })
    .trim()
    .min(1, 'userId is required'),
  email: z.string().email('Invalid email address').optional(),
  password: z.string().min(6, 'Password must be at least 6 characters').optional(),
});

export type SignupSchemaInput = z.infer<typeof signupSchema>;
