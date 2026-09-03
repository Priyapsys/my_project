import styles from './TransactionList.module.css'

function fmt(amount, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(amount)
}

function timeAgo(ts) {
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TransactionList({ txs, compact, onViewAll, userId }) {
  if (!txs || txs.length === 0) {
    return (
      <div className={styles.empty} data-testid="transaction-empty">
        <div className={styles.emptyIcon}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path d="M9 12h6M9 16h6M9 8h6M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <p>No transactions yet</p>
        <span>Transfers will appear here</span>
      </div>
    )
  }

  return (
    <div className={styles.wrapper} data-testid="transaction-list">
      {compact && (
        <div className={styles.header}>
          <h3>Recent Transactions</h3>
          {onViewAll && (
            <button className={styles.viewAll} onClick={onViewAll} data-testid="transaction-view-all">
              View all →
            </button>
          )}
        </div>
      )}

      <div className={styles.list}>
        {txs.map((tx, i) => {
          const isSent = tx.sender === userId
          return (
            <div
              key={tx.txId}
              data-testid="transaction-item"
              className={styles.item + ' animate-slide-in'}
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className={isSent ? styles.iconSent : styles.iconReceived}>
                {isSent ? (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M14 2L2 7l5 3 2 5 5-13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>

              <div className={styles.info}>
                <div className={styles.parties}>
                  <span className={styles.name}>{tx.sender}</span>
                  <span className={styles.arrow}>→</span>
                  <span className={styles.name}>{tx.receiver}</span>
                </div>
                <div className={styles.meta}>
                  <span className="mono" style={{fontSize:'11px', color:'var(--text-muted)'}}>
                    {tx.txId?.slice(0, 22)}…
                  </span>
                  {tx.batchId && (
                    <span className={styles.anchored}>⛓ Settled</span>
                  )}
                </div>
              </div>

              <div className={styles.amounts}>
                <div className={styles.mainAmt + (isSent ? ' ' + styles.sent : ' ' + styles.received)}>
                  {isSent ? '-' : '+'}{fmt(tx.originalAmount, tx.sourceCurrency)}
                </div>
                {tx.sourceCurrency !== tx.destCurrency && (
                  <div className={styles.converted}>
                    {fmt(tx.convertedAmount, tx.destCurrency)}
                  </div>
                )}
                <div className={styles.time}>{timeAgo(tx.timestamp)}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
