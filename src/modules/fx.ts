// ============================================================
//  FX ENGINE — Currency Conversion with Static Rates
// ============================================================

import { Currency, FxResult } from '../utils/types';
import { logger } from '../utils/logger';

// ----------------------------
//  Static FX Rate Table (base: USD)
//  Rates represent: 1 {from} = X {to}
// ----------------------------
type RateTable = Record<string, Record<string, number>>;

const FX_RATES: RateTable = {
  USD: { USD: 1,       INR: 83.5,   GBP: 0.789,  EUR: 0.924,  AED: 3.673,  JPY: 151.6  },
  INR: { USD: 0.01198, INR: 1,      GBP: 0.00945, EUR: 0.01107, AED: 0.043,  JPY: 1.816  },
  GBP: { USD: 1.267,   INR: 105.83, GBP: 1,      EUR: 1.171,  AED: 4.653,  JPY: 192.1  },
  EUR: { USD: 1.082,   INR: 90.35,  GBP: 0.854,  EUR: 1,      AED: 3.975,  JPY: 164.1  },
  AED: { USD: 0.2723,  INR: 22.73,  GBP: 0.2149, EUR: 0.2516, AED: 1,      JPY: 41.28  },
  JPY: { USD: 0.00660, INR: 0.5508, GBP: 0.00521, EUR: 0.00610, AED: 0.02422, JPY: 1   },
};

// ----------------------------
//  Conversion
// ----------------------------

export function convert(
  sourceCurrency: Currency,
  destCurrency: Currency,
  amount: number
): FxResult {
  const rateRow = FX_RATES[sourceCurrency];
  if (!rateRow) {
    throw new Error(`FX_UNSUPPORTED: Source currency '${sourceCurrency}' not in rate table`);
  }

  const rate = rateRow[destCurrency];
  if (rate === undefined) {
    throw new Error(
      `FX_UNSUPPORTED: Conversion from '${sourceCurrency}' to '${destCurrency}' not available`
    );
  }

  const convertedAmount = parseFloat((amount * rate).toFixed(4));
  const pair = `${sourceCurrency}/${destCurrency}`;

  logger.debug(`FX conversion`, { pair, rate, amount, convertedAmount });

  return {
    sourceCurrency,
    destCurrency,
    rate,
    originalAmount: amount,
    convertedAmount,
    pair,
  };
}

// ----------------------------
//  Supported Currencies
// ----------------------------

export function getSupportedCurrencies(): Currency[] {
  return Object.keys(FX_RATES) as Currency[];
}

export function getRate(from: Currency, to: Currency): number | undefined {
  return FX_RATES[from]?.[to];
}

export function getRateTable(): RateTable {
  return { ...FX_RATES };
}
