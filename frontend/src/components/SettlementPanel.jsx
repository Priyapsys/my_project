import { useState, useEffect } from 'react'
import { api } from '../api'
import styles from './SettlementPanel.module.css'

// ──────────────────────────────────────────────
//  Settlement Status Card — reusable per batch
// ──────────────────────────────────────────────
function SettlementStatusCard({ batchId, status, explorerUrl, txHash, batchHash, transactionCount, totalVolume, timestamp, anchoredAt, isNew }) {
  const isVerified = status === 'VERIFIED'
  const displayTime = timestamp
    ? new Date(timestamp).toLocaleTimeString()
    : anchoredAt
      ? new Date(anchoredAt).toLocaleTimeString()
      : null

  return (
    <div className={`${styles.statusCard} ${isNew ? styles.statusCardNew : ''}`}>
      {/* Top row: status badge + label */}
      <div className={styles.scHeader}>
        <div className={styles.scLeft}>
          <div className={`${styles.verifiedBadge} ${isVerified ? styles.verifiedBadgeOn : styles.verifiedBadgeOff}`}>
            {isVerified ? (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="rgba(0,212,170,0.2)"/>
                  <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="#00D4AA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                VERIFIED ✅
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="rgba(255,152,0,0.15)"/>
                  <path d="M8 5v4M8 11h.01" stroke="#ff9800" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                PENDING
              </>
            )}
          </div>
          <div className={styles.scLabel}>
            {isVerified ? 'Settlement Secured' : 'Awaiting Confirmation'}
          </div>
        </div>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.viewProofBtn}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            View Proof
          </a>
        )}
      </div>

      {/* Batch ID row */}
      <div className={styles.scBatchRow}>
        <span className={styles.scFieldLabel}>Batch ID</span>
        <span className={`${styles.scBatchId} mono`} title={batchId}>
          {batchId.length > 36 ? `${batchId.slice(0, 20)}…${batchId.slice(-12)}` : batchId}
        </span>
      </div>

      {/* Details grid */}
      <div className={styles.scGrid}>
        {transactionCount !== undefined && (
          <div className={styles.scCell}>
            <span className={styles.scCellLabel}>Transactions</span>
            <span className={styles.scCellValue}>{transactionCount}</span>
          </div>
        )}
        {totalVolume && (
          <div className={styles.scCell}>
            <span className={styles.scCellLabel}>Volume</span>
            <span className={styles.scCellValue}>
              {Object.entries(totalVolume).map(([c, a]) => `${a} ${c}`).join(' · ')}
            </span>
          </div>
        )}
        {displayTime && (
          <div className={styles.scCell}>
            <span className={styles.scCellLabel}>Time</span>
            <span className={styles.scCellValue}>{displayTime}</span>
          </div>
        )}
      </div>

      {/* Proof anchor note — no raw hash shown */}
      {isVerified && (
        <div className={styles.scProofNote}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1l7 3.5v5C15 13 12 15.5 8 16 4 15.5 1 13 1 9.5v-5L8 1z"
              stroke="#00D4AA" strokeWidth="1.2" fill="rgba(0,212,170,0.15)"/>
            <path d="M5 8.5l2 2 4-4" stroke="#00D4AA" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Cryptographic proof anchored on Solana Devnet · Immutable · Tamper-proof
        </div>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────
//  Main Settlement Panel
// ──────────────────────────────────────────────
export default function SettlementPanel({ session, addToast, queueSize, onSettled }) {
  const [loading, setLoading]     = useState(false)
  const [result, setResult]       = useState(null)
  const [history, setHistory]     = useState([])
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
      addToast('Settlement verified and anchored to blockchain!', 'success')
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

      {/* ── Header ── */}
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
              Batch transactions · Blockchain proof · Verified on-chain
            </p>
          </div>
        </div>

        <div className={styles.queueStat}>
          <div className={styles.queueNum}>{queueSize}</div>
          <div className={styles.queueLabel}>Pending</div>
        </div>
      </div>

      {/* ── Flow Steps ── */}
      <div className={styles.flowRow}>
        {[
          { icon: '≡', label: 'Collect', sub: 'Queue txs' },
          { icon: '⊕', label: 'Batch',   sub: 'Group all' },
          { icon: '⛓', label: 'Anchor',  sub: 'Blockchain' },
          { icon: '✅', label: 'Verify',  sub: 'Proof' },
        ].map((s, i) => (
          <div key={i} className={styles.flowItem}>
            <div className={styles.flowIcon}>{s.icon}</div>
            <div className={styles.flowLabel}>{s.label}</div>
            <div className={styles.flowSub}>{s.sub}</div>
            {i < 3 && <div className={styles.flowArrow}>→</div>}
          </div>
        ))}
      </div>

      {/* ── Run Button ── */}
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
          {loading
            ? 'Anchoring to Blockchain…'
            : queueSize === 0
              ? 'No Transactions Pending'
              : `Run Settlement · ${queueSize} txs`}
        </button>
        {queueSize === 0 && (
          <p className={styles.hint}>Make some transfers first, then run settlement.</p>
        )}
      </div>

      {/* ── Result: Settlement Status Card ── */}
      {result && (
        <div className="animate-fade-in">
          <div className={styles.resultHeading}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="8" fill="rgba(0,212,170,0.15)"/>
              <path d="M4.5 8.5l2.5 2.5 4.5-5" stroke="#00D4AA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Latest Settlement
          </div>
          <SettlementStatusCard
            batchId={result.batchId}
            status={result.status}
            explorerUrl={result.explorerUrl}
            txHash={result.txHash}
            batchHash={result.batchHash}
            transactionCount={result.transactionCount}
            totalVolume={result.totalVolume}
            timestamp={result.timestamp}
            isNew={true}
          />
        </div>
      )}

      {/* ── Settlement History ── */}
      <div className={styles.historySection}>
        <h3 className={styles.histTitle}>Settlement History</h3>
        {loadingHist ? (
          <div className={styles.histLoading}>Loading history…</div>
        ) : history.length === 0 ? (
          <div className={styles.histEmpty}>No settlements yet. Run your first batch above.</div>
        ) : (
          <div className={styles.histList}>
            {history.map((b, i) => (
              <div
                key={b.batchId}
                className="animate-slide-in"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <SettlementStatusCard
                  batchId={b.batchId}
                  status={b.status}
                  explorerUrl={b.txHash ? `https://explorer.solana.com/tx/${b.txHash}?cluster=devnet` : null}
                  txHash={b.txHash}
                  batchHash={b.batchHash}
                  transactionCount={b.transactionCount}
                  totalVolume={b.totalVolume}
                  anchoredAt={b.anchoredAt}
                  isNew={false}
                />
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
