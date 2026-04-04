import { useState, useEffect } from 'react'
import { api } from '../api'
import styles from './SettlementPanel.module.css'

export default function SettlementPanel({ session, addToast, queueSize, onSettled }) {
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)
  const [history, setHistory]   = useState([])
  const [loadingHist, setLoadingHist] = useState(true)

  const loadHistory = async () => {
    setLoadingHist(true)
    try {
      const data = await api.settlementHistory(session.token)
      setHistory(data.batches ?? [])
    } catch { /* silent */ }
    setLoadingHist(false)
  }

  useEffect(() => { loadHistory() }, [])

  const handleSettle = async () => {
    if (queueSize === 0) {
      addToast('No transactions in queue to settle.', 'error')
      return
    }
    setLoading(true)
    setResult(null)
    try {
      const data = await api.settlementRun(session.token)
      setResult(data)
      addToast('Settlement batch anchored to blockchain!', 'success')
      onSettled?.()
      loadHistory()
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      {/* Header card */}
      <div className={styles.heroCard}>
        <div className={styles.heroLeft}>
          <div className={styles.heroIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L21 7V13C21 17.5 17.5 21.5 12 23C6.5 21.5 3 17.5 3 13V7L12 2Z"
                stroke="url(#sg)" strokeWidth="1.5" fill="none" strokeLinejoin="round"/>
              <path d="M8.5 12l2.5 2.5 4.5-5" stroke="#00D4AA" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="sg" x1="3" y1="2" x2="21" y2="23">
                  <stop stopColor="#00D4AA"/><stop offset="1" stopColor="#0088CC"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <h2 className={styles.heroTitle}>Settlement Engine</h2>
            <p className={styles.heroSub}>
              Batch transactions · Anchor to blockchain · Generate proof
            </p>
          </div>
        </div>

        <div className={styles.queueStat}>
          <div className={styles.queueNum}>{queueSize}</div>
          <div className={styles.queueLabel}>Pending</div>
        </div>
      </div>

      {/* How it works */}
      <div className={styles.flowRow}>
        {[
          { icon: '≡', label: 'Collect', sub: 'Queue txs' },
          { icon: '⊕', label: 'Batch',   sub: 'Group all' },
          { icon: '⛓', label: 'Anchor',  sub: 'Blockchain' },
          { icon: '✓', label: 'Proof',   sub: 'txHash' },
        ].map((s, i) => (
          <div key={i} className={styles.flowItem}>
            <div className={styles.flowIcon}>{s.icon}</div>
            <div className={styles.flowLabel}>{s.label}</div>
            <div className={styles.flowSub}>{s.sub}</div>
            {i < 3 && <div className={styles.flowArrow}>→</div>}
          </div>
        ))}
      </div>

      {/* Run button */}
      <div className={styles.runSection}>
        <button
          className={'btn btn-primary btn-lg ' + styles.runBtn}
          onClick={handleSettle}
          disabled={loading || queueSize === 0}
        >
          {loading ? <span className="spinner" /> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L21 7V13C21 17.5 17.5 21.5 12 23C6.5 21.5 3 17.5 3 13V7L12 2Z"
                stroke="currentColor" strokeWidth="2" fill="none" strokeLinejoin="round"/>
            </svg>
          )}
          {loading ? 'Anchoring…' : queueSize === 0 ? 'No Transactions Pending' : `Run Settlement · ${queueSize} txs`}
        </button>
        {queueSize === 0 && (
          <p className={styles.hint}>Make some transfers first, then run settlement.</p>
        )}
      </div>

      {/* Result */}
      {result && (
        <div className={styles.resultCard + ' animate-fade-in'}>
          <div className={styles.resultHeader}>
            <div className={styles.resultIconWrap}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="rgba(0,212,170,0.2)"/>
                <path d="M6 10l3 3 5-6" stroke="#00D4AA" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className={styles.resultTitle}>Batch Settled</div>
              <div className={styles.resultSub}>Anchored to blockchain</div>
            </div>
          </div>

          <div className={styles.resultGrid}>
            <div className={styles.resultItem}>
              <span>Batch ID</span>
              <span className="mono">{result.batchId}</span>
            </div>
            <div className={styles.resultItem}>
              <span>Transactions</span>
              <span>{result.transactionCount}</span>
            </div>
            <div className={styles.resultItem}>
              <span>Total Volume</span>
              <span>{Object.entries(result.totalVolume ?? {})
                .map(([c,a]) => `${a} ${c}`).join(' · ')}</span>
            </div>
            <div className={styles.resultItem}>
              <span>Timestamp</span>
              <span>{new Date(result.timestamp).toLocaleTimeString()}</span>
            </div>
          </div>

          {/* TX HASH — highlighted prominently */}
          <div className={styles.hashBox}>
            <div className={styles.hashLabel}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 1l7 3.5v5C15 13 12 15.5 8 16 4 15.5 1 13 1 9.5v-5L8 1z"
                  stroke="currentColor" strokeWidth="1.2" fill="none"/>
              </svg>
              Blockchain Proof Hash
            </div>
            <div className={styles.hash + ' mono'}>{result.txHash}</div>
            <div className={styles.hashSub}>
              Immutable · Tamper-proof · Verifiable
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className={styles.historySection}>
        <h3 className={styles.histTitle}>Settlement History</h3>
        {loadingHist ? (
          <div className={styles.histLoading}>Loading history…</div>
        ) : history.length === 0 ? (
          <div className={styles.histEmpty}>No settlements yet. Run your first batch above.</div>
        ) : (
          <div className={styles.histList}>
            {history.map((b, i) => (
              <div key={b.batchId} className={styles.histItem + ' animate-slide-in'}
                style={{ animationDelay: `${i * 50}ms` }}>
                <div className={styles.histLeft}>
                  <div className={styles.histIcon}>⛓</div>
                  <div>
                    <div className={styles.histBatchId + ' mono'}>{b.batchId.slice(0, 28)}…</div>
                    <div className={styles.histMeta}>
                      {b.transactionCount} txs · {Object.entries(b.totalVolume ?? {})
                        .map(([c,a]) => `${a} ${c}`).join(', ')}
                    </div>
                  </div>
                </div>
                <div className={styles.histRight}>
                  <div className={styles.histHash + ' mono'}>{b.txHash.slice(0, 18)}…</div>
                  <div className={styles.histTime}>
                    {new Date(b.anchoredAt).toLocaleTimeString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
