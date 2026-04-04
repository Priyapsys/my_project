import styles from './BalanceCard.module.css'

const CURRENCY_FLAGS = {
  USD: '🇺🇸', INR: '🇮🇳', GBP: '🇬🇧', EUR: '🇪🇺', AED: '🇦🇪', JPY: '🇯🇵'
}
const CURRENCY_NAMES = {
  USD: 'US Dollar', INR: 'Indian Rupee', GBP: 'British Pound',
  EUR: 'Euro', AED: 'UAE Dirham', JPY: 'Japanese Yen'
}
const USD_RATES = {
  USD: 1, INR: 0.012, GBP: 1.267, EUR: 1.082, AED: 0.272, JPY: 0.0066
}

function fmt(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount)
}

export default function BalanceCard({ balances, loading, userId }) {
  const totalUSD = Object.entries(balances).reduce((sum, [cur, amt]) => {
    return sum + (amt * (USD_RATES[cur] ?? 0))
  }, 0)

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.shimmer} />
      </div>
    )
  }

  return (
    <div className={styles.card}>
      {/* Top accent line */}
      <div className={styles.accentLine} />

      <div className={styles.header}>
        <div>
          <div className={styles.label}>Total Portfolio Value</div>
          <div className={styles.total}>
            {fmt(totalUSD, 'USD')}
            <span className={styles.approx}>≈ USD</span>
          </div>
        </div>
        <div className={styles.liveBadge}>
          <span className={styles.liveDot} />
          Live
        </div>
      </div>

      <div className={styles.divider} />

      <div className={styles.currencies}>
        {Object.entries(balances).length === 0 ? (
          <div className={styles.empty}>No balances yet</div>
        ) : (
          Object.entries(balances).map(([currency, amount]) => (
            <div key={currency} className={styles.currencyRow}>
              <div className={styles.currencyLeft}>
                <span className={styles.flag}>{CURRENCY_FLAGS[currency] ?? '💱'}</span>
                <div>
                  <div className={styles.currencyCode}>{currency}</div>
                  <div className={styles.currencyName}>{CURRENCY_NAMES[currency] ?? currency}</div>
                </div>
              </div>
              <div className={styles.currencyRight}>
                <div className={styles.amount}>{fmt(amount, currency)}</div>
                <div className={styles.usdVal}>≈ {fmt(amount * (USD_RATES[currency] ?? 0), 'USD')}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
