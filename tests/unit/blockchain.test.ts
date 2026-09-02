import { hashBatchData } from '../../src/services/blockchainService';

describe('Blockchain Unit Tests', () => {
  it('should compute deterministic batch hashes', () => {
    const batch1 = {
      batchId: 'BATCH-123',
      transactionCount: 2,
      totalVolume: { USD: 100 },
      transactions: [],
      timestamp: new Date('2024-01-01T00:00:00Z'),
    };
    
    const batch2 = {
      batchId: 'BATCH-123',
      transactionCount: 2,
      totalVolume: { USD: 100 },
      transactions: [],
      timestamp: new Date('2024-01-01T00:00:00Z'),
    };
    
    const hash1 = hashBatchData(batch1);
    const hash2 = hashBatchData(batch2);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 is 64 hex chars
    
    const batch3 = { ...batch1, transactionCount: 3 };
    const hash3 = hashBatchData(batch3);
    
    expect(hash1).not.toBe(hash3);
  });
});
