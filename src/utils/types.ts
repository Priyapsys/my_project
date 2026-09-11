// ============================================================
//  GLOBAL PAYMENT SYSTEM — Shared Types & Interfaces
// ============================================================

import { Request } from 'express';

// ----------------------------
//  Currencies
// ----------------------------
export type Currency = 'USD' | 'INR' | 'GBP' | 'EUR' | 'AED' | 'JPY';

export type CurrencyBalances = Partial<Record<Currency, string>>;

// ----------------------------
//  Auth
// ----------------------------
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  requestId?: string;
}

// ----------------------------
//  KYC
// ----------------------------
export type KycStatus = 'PENDING' | 'VERIFIED';

export type IdType = 'passport' | 'national_id' | 'driver_license';

export interface KycRecord {
  userId: string;
  status: KycStatus;
  idType?: IdType;
  idNumber?: string;
  documentUploaded: boolean;
  addressProofUploaded: boolean;
  faceVerified: boolean;
  createdAt: Date;
  verifiedAt?: Date;
}

// ----------------------------
//  Compliance
// ----------------------------
export interface ComplianceResult {
  score: number;
  status: 'pass' | 'block';
  flagged: boolean;
  reason?: string;
}

// ----------------------------
//  FX
// ----------------------------
export interface FxResult {
  sourceCurrency: Currency;
  destCurrency: Currency;
  rate: number;              // ratio, not money — stays number
  originalAmount: string;
  convertedAmount: string;
  pair: string;
}

// ----------------------------
//  Transaction
// ----------------------------
export type TransactionStatus = 'completed' | 'pending' | 'failed';

export interface Transaction {
  txId: string;
  sender: string;
  receiver: string;
  originalAmount: string;
  convertedAmount: string;
  sourceCurrency: Currency;
  destCurrency: Currency;
  rate: number;                 // ratio, not money — stays number
  complianceScore: number;
  status: TransactionStatus;
  timestamp: Date;
  batchId?: string;             // populated after settlement
}

// ----------------------------
//  Treasury
// ----------------------------
export interface TreasuryReserves {
  [currency: string]: string;
}

// ----------------------------
//  Settlement Batch
// ----------------------------
export interface BatchSummary {
  batchId: string;
  transactionCount: number;
  totalVolume: Record<string, string>;
  transactions: Transaction[];
  timestamp: Date;
  blockchainTxHash?: string;
}

// ----------------------------
//  Blockchain Record
// ----------------------------
export interface BlockchainRecord {
  batchId: string;
  txHash: string | null;
  batchHash: string;
  explorerUrl: string | null;
  anchoredAt: Date;
  batch: BatchSummary;
}

// ----------------------------
//  API Response Helpers
// ----------------------------
export interface ApiSuccess<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
  timestamp: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

// ----------------------------
//  Transfer Request Body
// ----------------------------
export interface TransferRequestBody {
  senderId: string;
  receiverId: string;
  amount: number;
  sourceCurrency: Currency;
  destCurrency: Currency;
}

// ----------------------------
//  Transfer Response
// ----------------------------
export interface TransferResponse {
  success: true;
  txId: string;
  sender: string;
  receiver: string;
  originalAmount: string;
  convertedAmount: string;
  sourceCurrency: Currency;
  destCurrency: Currency;
  compliance: ComplianceResult;
  fx: FxResult;
  status: TransactionStatus;
  timestamp: string;
}
