// ============================================================
//  FX ENGINE — Currency Conversion with Live Rates & Caching
// ============================================================

import { Currency, FxResult } from '../utils/types';
import { logger } from '../utils/logger';
import * as money from '../utils/money';

import Decimal from 'decimal.js';

type RateTable = Record<string, Record<string, string>>;

const STATIC_FX_RATES: RateTable = {
  USD: { USD: '1',       INR: '83.5',    GBP: '0.789',   EUR: '0.924',   AED: '3.673',   JPY: '151.6'  },
  INR: { USD: '0.01198', INR: '1',       GBP: '0.00945', EUR: '0.01107', AED: '0.043',   JPY: '1.816'  },
  GBP: { USD: '1.267',   INR: '105.83',  GBP: '1',       EUR: '1.171',   AED: '4.653',   JPY: '192.1'  },
  EUR: { USD: '1.082',   INR: '90.35',   GBP: '0.854',   EUR: '1',       AED: '3.975',   JPY: '164.1'  },
  AED: { USD: '0.2723',  INR: '22.73',   GBP: '0.2149',  EUR: '0.2516',  AED: '1',       JPY: '41.28'  },
  JPY: { USD: '0.00660', INR: '0.5508',  GBP: '0.00521', EUR: '0.00610', AED: '0.02422', JPY: '1'     },
};

let cachedRateTable: RateTable | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60 * 1000;

async function fetchLiveRates(): Promise<RateTable> {
  const now = Date.now();
  if (cachedRateTable && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedRateTable;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = (await res.json()) as any;
    if (data && data.result === 'success' && data.rates) {
      const rates: Record<string, number | string> = data.rates;
      const currencies: Currency[] = ['USD', 'INR', 'GBP', 'EUR', 'AED', 'JPY'];
      const newTable: RateTable = {};

      for (const from of currencies) {
        newTable[from] = {};
        for (const to of currencies) {
          const fromRateInUSD = rates[from];
          const toRateInUSD = rates[to];
          if (fromRateInUSD && toRateInUSD) {
            const dTo = new Decimal(String(toRateInUSD));
            const dFrom = new Decimal(String(fromRateInUSD));
            newTable[from][to] = dTo.div(dFrom).toFixed(8);
          } else if (STATIC_FX_RATES[from]?.[to] !== undefined) {
            newTable[from][to] = STATIC_FX_RATES[from][to];
          }
        }
      }

      cachedRateTable = newTable;
      lastFetchTime = now;
      logger.info('FX rates updated from open.er-api.com');
      return newTable;
    }
  } catch (err) {
    logger.warn('Failed to fetch live FX rates, falling back to static rates', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return cachedRateTable ?? STATIC_FX_RATES;
}

export async function convert(
  sourceCurrency: Currency,
  destCurrency: Currency,
  amount: string | Decimal
): Promise<FxResult> {
  const rateTable = await fetchLiveRates();
  const rateRow = rateTable[sourceCurrency];
  if (!rateRow) {
    throw new Error(`FX_UNSUPPORTED: Source currency '${sourceCurrency}' not in rate table`);
  }

  const rate = rateRow[destCurrency];
  if (rate === undefined) {
    throw new Error(
      `FX_UNSUPPORTED: Conversion from '${sourceCurrency}' to '${destCurrency}' not available`
    );
  }

  // Exact decimal multiplication: amount × rate, rounded to destination currency precision
  const rawConverted = money.mul(amount, rate);
  const convertedAmount = money.roundToCurrency(rawConverted, destCurrency);
  const originalAmountStr = money.roundToCurrency(amount, sourceCurrency);
  const pair = `${sourceCurrency}/${destCurrency}`;

  logger.debug(`FX conversion`, { pair, rate, amount: originalAmountStr, convertedAmount });

  return {
    sourceCurrency,
    destCurrency,
    rate,
    originalAmount: originalAmountStr,
    convertedAmount,
    pair,
  };
}

export function getSupportedCurrencies(): Currency[] {
  return Object.keys(STATIC_FX_RATES) as Currency[];
}

export async function getRate(from: Currency, to: Currency): Promise<string | undefined> {
  const table = await fetchLiveRates();
  return table[from]?.[to];
}

export async function getRateTable(): Promise<RateTable> {
  return await fetchLiveRates();
}
