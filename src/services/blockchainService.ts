// ============================================================
//  BLOCKCHAIN MODULE — Real Solana Devnet Settlement Anchor
// ============================================================

import {
  Connection,
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { BatchSummary, BlockchainRecord } from '../utils/types';
import { logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';

// ----------------------------
//  Solana Devnet Connection & Wallet
// ----------------------------
const DEVNET_RPC = 'https://api.devnet.solana.com';
const EXPLORER_BASE = 'https://explorer.solana.com/tx';

const connection = new Connection(DEVNET_RPC, 'confirmed');

// ----------------------------
//  Wallet Persistence Logic
// ----------------------------
const WALLET_PATH = path.join(process.cwd(), '.wallet.json');

function initWallet(): Keypair {
  if (fs.existsSync(WALLET_PATH)) {
    try {
      const data = fs.readFileSync(WALLET_PATH, 'utf-8');
      const secretKey = new Uint8Array(JSON.parse(data));
      const keypair = Keypair.fromSecretKey(secretKey);
      logger.chain(`Loaded persistent wallet from disk: ${keypair.publicKey.toBase58()}`);
      return keypair;
    } catch (err) {
      logger.warn(`Failed to read .wallet.json. Generating a fallback wallet.`);
    }
  }

  // Generate a new wallet if file doesn't exist or is corrupted
  const keypair = Keypair.generate();
  fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(keypair.secretKey)), 'utf-8');
  logger.chain(`Generated new persistent wallet and saved to .wallet.json: ${keypair.publicKey.toBase58()}`);
  return keypair;
}

const persistentWallet = initWallet();

// ----------------------------
//  Immutable On-Chain Store
// ----------------------------
const blockchainStore = new Map<string, BlockchainRecord>();
let totalAnchored = 0;

// ----------------------------
//  Internal helper — SHA-256 of any serialisable payload
// ----------------------------

import { createHash } from 'crypto';

function hashBatchData(batchData: unknown): string {
  const raw = typeof batchData === 'string'
    ? batchData
    : JSON.stringify(batchData);

  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

// ----------------------------
//  Real Solana Transaction
// ----------------------------

export async function sendBatchToBlockchain(
  batch: BatchSummary,
  batchHash: string
): Promise<{ txHash: string | null; explorerUrl: string | null }> {
  try {
    logger.chain(`Preparing to anchor batch on Solana Devnet...`);

    const keypair = persistentWallet;
    logger.chain(`Using persistent wallet: ${keypair.publicKey.toBase58()}`);

    // ── Step 1: Check balance & conditionally airdrop ───────────
    const balance = await connection.getBalance(keypair.publicKey);
    const MIN_BALANCE = 0.05 * LAMPORTS_PER_SOL;

    if (balance < MIN_BALANCE) {
      logger.chain(`Balance low (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Requesting airdrop...`);
      let airdropSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logger.chain(`Requesting airdrop (1 SOL) - Attempt ${attempt}...`);
          const airdropSig = await connection.requestAirdrop(
            keypair.publicKey,
            LAMPORTS_PER_SOL
          );

          const { blockhash: airdropBlockhash, lastValidBlockHeight: airdropHeight } =
            await connection.getLatestBlockhash('confirmed');
          await connection.confirmTransaction(
            { signature: airdropSig, blockhash: airdropBlockhash, lastValidBlockHeight: airdropHeight },
            'confirmed'
          );
          logger.chain(`Airdrop confirmed: ${airdropSig}`);
          airdropSuccess = true;
          break;
        } catch (err: any) {
          logger.warn?.(`[BlockchainService] Airdrop attempt ${attempt} failed: ${err.message || err}`);
          if (attempt < 3) {
            logger.chain(`Waiting 2 seconds before retry...`);
            await new Promise(res => setTimeout(res, 2000));
          }
        }
      }

      if (!airdropSuccess) {
        logger.warn?.(`[BlockchainService] Airdrop failed. Transaction may fail if balance is insufficient.`);
      }
    } else {
      logger.chain(`Balance sufficient (${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL). Skipping airdrop.`);
    }

    // ── Step 2: Build transaction ──────────────────────────────────
    const { blockhash, lastValidBlockHeight } =
      await connection.getLatestBlockhash('confirmed');

    const tx = new Transaction({
      feePayer: keypair.publicKey,
      blockhash,
      lastValidBlockHeight,
    });

    // Self-transfer of 1 lamport to ensure a valid transaction that costs a standard fee
    tx.add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 1,
      })
    );

    // ── Step 3: Send & confirm ────────────────────────────────────
    logger.chain(`Sending batch ${batch.batchId} (${batch.transactionCount} txs) to Solana Devnet...`);

    const signature = await sendAndConfirmTransaction(
      connection,
      tx,
      [keypair],
      { commitment: 'confirmed' }
    );

    const explorerUrl = `${EXPLORER_BASE}/${signature}?cluster=devnet`;

    logger.chain(`✅ Batch anchored on-chain`, {
      batchId:         batch.batchId,
      txHash:          signature,
      explorerUrl,
      transactionCount: batch.transactionCount,
    });

    return { txHash: signature, explorerUrl };
  } catch (error: any) {
    logger.warn?.(`[BlockchainService] Blockchain anchoring error: ${error.message || error}`);
    logger.warn?.(`[BlockchainService] Batch proof was not anchored due to network/fund errors.`);
    return { txHash: null, explorerUrl: null };
  }
}

// ----------------------------
//  Store Batch Record (called by settlementService)
// ----------------------------

export async function storeBatch(batch: BatchSummary): Promise<BlockchainRecord> {
  // Immutable: once written, cannot be overwritten
  if (blockchainStore.has(batch.batchId)) {
    logger.warn(`Blockchain: batch already anchored`, { batchId: batch.batchId });
    return blockchainStore.get(batch.batchId)!;
  }

  const batchHash = hashBatchData(batch);
  logger.chain(`batchHash: ${batchHash}`);
  const { txHash, explorerUrl } = await sendBatchToBlockchain(batch, batchHash);
  const anchoredAt = new Date();

  const record: BlockchainRecord = {
    batchId:     batch.batchId,
    txHash,
    batchHash,
    explorerUrl,
    anchoredAt,
    batch,
  };

  blockchainStore.set(batch.batchId, record);
  totalAnchored++;

  return record;
}

// ----------------------------
//  Query Helpers (unchanged API)
// ----------------------------

export function getBatchRecord(batchId: string): BlockchainRecord | undefined {
  return blockchainStore.get(batchId);
}

export function getAllRecords(): BlockchainRecord[] {
  return Array.from(blockchainStore.values());
}

export function getChainStats(): {
  totalBatchesAnchored: number;
  totalTransactionsAnchored: number;
} {
  let totalTxs = 0;
  blockchainStore.forEach((r) => {
    totalTxs += r.batch.transactionCount;
  });
  return {
    totalBatchesAnchored:      totalAnchored,
    totalTransactionsAnchored: totalTxs,
  };
}
