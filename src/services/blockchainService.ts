// ============================================================
//  BLOCKCHAIN MODULE — Real Solana Devnet Settlement Anchor
// ============================================================

import {
  Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { logger } from '../utils/logger';
import { SettlementAnchorFailedError } from '../utils/errors';
import { createHash } from 'crypto';
import { getAllSettlementBatches } from '../modules/ledger';

// ----------------------------
//  Solana Devnet Connection & Wallet
// ----------------------------
const DEVNET_RPC = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const EXPLORER_BASE = 'https://explorer.solana.com/tx';

const connection = new Connection(DEVNET_RPC, 'confirmed');

// ----------------------------
//  Wallet Persistence Logic
// ----------------------------
// TODO: In production, use a real KMS/secrets manager instead of env vars.
function initWallet(): Keypair {
  const secret = process.env.SOLANA_KEYPAIR;
  if (secret) {
    try {
      if (secret.startsWith('[')) {
        return Keypair.fromSecretKey(new Uint8Array(JSON.parse(secret)));
      } else {
        return Keypair.fromSecretKey(bs58.decode(secret));
      }
    } catch (err) {
      logger.warn('Failed to parse SOLANA_KEYPAIR env var, falling back to new keypair.');
    }
  }
  // Generate a fallback if env var is missing/invalid
  const keypair = Keypair.generate();
  logger.chain(`Generated fallback wallet: ${keypair.publicKey.toBase58()}`);
  return keypair;
}

const persistentWallet = initWallet();

// ----------------------------
//  Internal helper — SHA-256 of any serialisable payload
// ----------------------------

export function hashBatchData(batchData: unknown): string {
  const raw = typeof batchData === 'string'
    ? batchData
    : JSON.stringify(batchData);
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ----------------------------
//  Real Solana Transaction
// ----------------------------

export async function sendBatchToBlockchain(
  batchId: string,
  batchHash: string
): Promise<{ txHash: string; explorerUrl: string }> {
  logger.chain(`Preparing to anchor batch on Solana Devnet...`);

  const keypair = persistentWallet;
  logger.chain(`Using wallet: ${keypair.publicKey.toBase58()}`);

  // ── Step 1: Check balance & conditionally airdrop ───────────
  const balance = await connection.getBalance(keypair.publicKey);
  const MIN_BALANCE = 0.05 * LAMPORTS_PER_SOL;

  if (balance < MIN_BALANCE) {
    logger.chain(`Balance low (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Requesting airdrop...`);
    let airdropSuccess = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const airdropSig = await connection.requestAirdrop(keypair.publicKey, LAMPORTS_PER_SOL);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        await connection.confirmTransaction(
          { signature: airdropSig, blockhash, lastValidBlockHeight },
          'confirmed'
        );
        logger.chain(`Airdrop confirmed: ${airdropSig}`);
        airdropSuccess = true;
        break;
      } catch (err: any) {
        logger.warn?.(`[BlockchainService] Airdrop attempt ${attempt} failed: ${err.message || err}`);
        if (attempt < 3) {
          await new Promise(res => setTimeout(res, 2000));
        }
      }
    }
    if (!airdropSuccess) {
      logger.warn?.(`[BlockchainService] Airdrop failed. Transaction may fail if balance is insufficient.`);
    }
  }

  // ── Step 2: Build transaction ──────────────────────────────────
  const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  
  const instruction = new TransactionInstruction({
    keys: [{ pubkey: keypair.publicKey, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(batchHash, 'utf8'),
  });

  const MAX_RETRIES = 3;
  let lastError: any = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const tx = new Transaction({ feePayer: keypair.publicKey, blockhash, lastValidBlockHeight });
      tx.add(instruction);
      
      tx.sign(keypair);
      const rawTx = tx.serialize();
      
      logger.chain(`Sending tx for batch ${batchId}, waiting for confirmation (attempt ${attempt})...`);
      const signature = await connection.sendRawTransaction(rawTx, { skipPreflight: false });

      // Note: we use 'confirmed' commitment for faster feedback, acceptable finality risk for now
      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      const explorerUrl = `${EXPLORER_BASE}/${signature}?cluster=devnet`;
      logger.chain(`✅ Batch anchored on-chain`, { batchId, txHash: signature, explorerUrl });
      return { txHash: signature, explorerUrl };
    } catch (error: any) {
      logger.warn?.(`[BlockchainService] Anchor attempt ${attempt} failed: ${error.message || error}`);
      lastError = error;
      // Exponential backoff for RPC errors before retry
      if (attempt < MAX_RETRIES) {
        await new Promise(res => setTimeout(res, Math.pow(2, attempt) * 1000));
      }
    }
  }

  throw new SettlementAnchorFailedError(`Failed to anchor batch to Solana devnet after ${MAX_RETRIES} attempts. Last error: ${lastError?.message || lastError}`);
}

export async function getChainStats(): Promise<{
  totalBatchesAnchored: number;
  totalTransactionsAnchored: number;
}> {
  const batches = await getAllSettlementBatches();
  const anchored = batches.filter(b => b.status === 'confirmed' || b.status === 'anchored');
  return {
    totalBatchesAnchored: anchored.length,
    totalTransactionsAnchored: 0,
  };
}

export async function getAllRecords(): Promise<any[]> {
  const batches = await getAllSettlementBatches();
  return batches.map(b => ({
    batchId: b.batch_id,
    txHash: b.tx_hash,
    batchHash: b.batch_hash,
    explorerUrl: b.tx_hash ? `${EXPLORER_BASE}/${b.tx_hash}?cluster=devnet` : null,
    anchoredAt: b.confirmed_at || b.created_at,
    batch: { transactionCount: 0, totalVolume: {} } // Dummy for backward compatibility
  }));
}

export async function verifyBatchOnChain(batchId: string, expectedHash: string): Promise<boolean> {
  // 1. Fetch batch from db to get txHash
  const batches = await getAllSettlementBatches();
  const batch = batches.find(b => b.batch_id === batchId);
  if (!batch || !batch.tx_hash) throw new Error("Batch not anchored or not found");

  // 2. Fetch transaction from solana devnet
  const tx = await connection.getTransaction(batch.tx_hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!tx) throw new Error("Transaction not found on devnet");

  // 3. Extract memo
  const logMessages = tx.meta?.logMessages || [];
  const memoLog = logMessages.find(msg => msg.includes('Program log: Memo (len'));
  if (memoLog) {
    // Memo logs often look like: 'Program log: Memo (len 64): "hash_string"'
    const match = memoLog.match(/"(.*)"/);
    if (match && match[1] === expectedHash) {
      return true;
    }
  }
  
  // Alternative: parse transaction instructions if logs don't match
  // We can fetch parsed transaction for easier parsing
  const parsedTx = await connection.getParsedTransaction(batch.tx_hash, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
  if (!parsedTx) return false;

  const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';
  const instructions = parsedTx.transaction.message.instructions;
  
  for (const ix of instructions) {
    if ('programId' in ix && ix.programId.toBase58() === MEMO_PROGRAM_ID && 'parsed' in ix) {
      if (typeof ix.parsed === 'string' && ix.parsed === expectedHash) {
        return true;
      }
    }
  }
  
  return false;
}

export async function reconcilePendingBatches(): Promise<{ checked: number; resolved: number }> {
  const { getPendingSettlementBatches, updateSettlementBatchStatus } = await import('../modules/ledger');
  const pending = await getPendingSettlementBatches();
  
  let resolved = 0;
  for (const batch of pending) {
    if (!batch.tx_hash) {
      await updateSettlementBatchStatus(batch.batch_id, 'failed');
      resolved++;
      continue;
    }
    
    try {
      const status = await connection.getSignatureStatus(batch.tx_hash);
      if (status && status.value) {
        if (status.value.err) {
          await updateSettlementBatchStatus(batch.batch_id, 'failed');
          resolved++;
        } else if (status.value.confirmationStatus === 'confirmed' || status.value.confirmationStatus === 'finalized') {
          await updateSettlementBatchStatus(batch.batch_id, 'confirmed', batch.tx_hash, new Date());
          resolved++;
        }
      }
    } catch (err) {
      logger.warn(`Failed to check status for pending batch ${batch.batch_id}`);
    }
  }
  
  return { checked: pending.length, resolved };
}
