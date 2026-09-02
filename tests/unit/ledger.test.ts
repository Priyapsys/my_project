import { initDatabase, closeDatabase, getDb } from '../../src/db/connection';
import {
  getBalanceForCurrency,
  setBalance,
  updateBalance,
  debit,
  credit,
} from '../../src/modules/ledger';
import { InsufficientBalanceError } from '../../src/utils/errors';

beforeAll(async () => {
  // In a real environment, this would point to a test database.
  // Requires DATABASE_URL to be set to a test DB if testing against PG.
  try {
    await initDatabase();
  } catch (err) {
    console.warn('DB init failed. Tests may fail if no DB is available.', err);
  }
});

afterAll(async () => {
  try {
    await closeDatabase();
  } catch (err) {
    // Ignore cleanup errors
  }
});

beforeEach(async () => {
  try {
    const db = getDb();
    await db('accounts').truncate();
    await db('transactions').truncate();
  } catch (err) {}
});

describe('Ledger Persistence Unit Tests', () => {
  const USER = 'test-user';

  it('should initialize empty balance to 0', async () => {
    const balance = await getBalanceForCurrency(USER, 'USD');
    expect(balance).toBe(0);
  });

  it('should set and retrieve balance', async () => {
    await setBalance(USER, 'USD', 100);
    const balance = await getBalanceForCurrency(USER, 'USD');
    expect(balance).toBe(100);
  });

  it('should update balance incrementally', async () => {
    await setBalance(USER, 'USD', 100);
    await updateBalance(USER, 'USD', 50);
    const balance = await getBalanceForCurrency(USER, 'USD');
    expect(balance).toBe(150);
  });

  it('should debit balance successfully', async () => {
    await setBalance(USER, 'EUR', 200);
    await debit(USER, 'EUR', 50);
    const balance = await getBalanceForCurrency(USER, 'EUR');
    expect(balance).toBe(150);
  });

  it('should throw InsufficientBalanceError on overdraft', async () => {
    await setBalance(USER, 'GBP', 50);
    await expect(debit(USER, 'GBP', 100)).rejects.toThrow(InsufficientBalanceError);
  });

  it('should credit balance successfully', async () => {
    await setBalance(USER, 'JPY', 1000);
    await credit(USER, 'JPY', 500);
    const balance = await getBalanceForCurrency(USER, 'JPY');
    expect(balance).toBe(1500);
  });
});
