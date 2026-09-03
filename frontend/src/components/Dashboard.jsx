import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'
import BalanceCard from './BalanceCard'
import SendMoneyForm from './SendMoneyForm'
import TransactionList from './TransactionList'
import SettlementPanel from './SettlementPanel'
import styles from './Dashboard.module.css'

const TABS = [
  { id: 'overview',     label: 'Overview',    icon: '⊞' },
  { id: 'send',         label: 'Send',         icon: '↗' },
  { id: 'transactions', label: 'History',      icon: '≡' },
  { id: 'settlement',   label: 'Settlement',   icon: '⬡' },
]

export default function Dashboard({ session, onLogout, addToast }) {
  const [tab, setTab]             = useState('overview')
  const [balances, setBalances]   = useState({})
  const [txs, setTxs]             = useState([])
  const [queueSize, setQueueSize] = useState(0)
  const [loadingBal, setLoadingBal] = useState(true)

  const refreshBalance = useCallback(async () => {
    try {
      const data = await api.balance(session.token, session.userId)
      setBalances(data.balances ?? {})
    } catch { /* silent */ }
    setLoadingBal(false)
  }, [session])

  const refreshTxs = useCallback(async () => {
    try {
      const data = await api.transactions(session.token, session.userId)
      setTxs(data.transactions ?? [])
    } catch { /* silent */ }
  }, [session])

  const refreshQueue = useCallback(async () => {
    try {
      const data = await api.settlementStatus(session.token)
      setQueueSize(data.queue?.queueSize ?? 0)
    } catch { /* silent */ }
  }, [session])

  const refreshAll = useCallback(() => {
    refreshBalance()
    refreshTxs()
    refreshQueue()
  }, [refreshBalance, refreshTxs, refreshQueue])

  useEffect(() => { refreshAll() }, [refreshAll])

  return (
    <div className={styles.layout} data-testid="dashboard-layout">
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.sideTop}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" fill="url(#gs)"/>
                <path d="M10 14L13 17L18 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="gs" x1="2" y1="2" x2="26" y2="26">
                    <stop stopColor="#00D4AA"/><stop offset="1" stopColor="#0088CC"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className={styles.logoName}>GlobalPay</span>
          </div>

          <nav className={styles.nav}>
            {TABS.map(t => (
              <button
                key={t.id}
                data-testid={`nav-tab-${t.id}`}
                className={styles.navBtn + (tab === t.id ? ' ' + styles.navActive : '')}
                onClick={() => setTab(t.id)}
              >
                <span className={styles.navIcon}>{t.icon}</span>
                <span>{t.label}</span>
                {t.id === 'settlement' && queueSize > 0 && (
                  <span className={styles.badge}>{queueSize}</span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className={styles.sideBottom}>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{session.userId[0].toUpperCase()}</div>
            <div>
              <div className={styles.userName} data-testid="user-name">{session.userId}</div>
              <div className={styles.userStatus}>
                <span className={styles.dot} /> Verified
              </div>
            </div>
          </div>
          <button
            data-testid="logout-button"
            className={'btn btn-secondary btn-sm ' + styles.logoutBtn}
            onClick={onLogout}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className={styles.main}>
        <div className={styles.topBar}>
          <div>
            <h1 className={styles.pageTitle} data-testid="page-title">
              {tab === 'overview'     && 'Dashboard'}
              {tab === 'send'         && 'Send Money'}
              {tab === 'transactions' && 'Transaction History'}
              {tab === 'settlement'   && 'Settlement Engine'}
            </h1>
            <p className={styles.pageSubtitle}>
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <button
            data-testid="refresh-button"
            className={'btn btn-secondary btn-sm'}
            onClick={refreshAll}
          >
            ↻ Refresh
          </button>
        </div>

        <div className={styles.content + ' animate-fade-in'} key={tab}>
          {tab === 'overview' && (
            <div className={styles.overview}>
              <BalanceCard
                balances={balances}
                loading={loadingBal}
                userId={session.userId}
              />
              <div className={styles.quickActions}>
                <button
                  data-testid="quick-action-send"
                  className={'btn btn-primary ' + styles.qaBtn}
                  onClick={() => setTab('send')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M14 2L2 7l5 3 2 5 5-13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
                  </svg>
                  Send Money
                </button>
                <button
                  data-testid="quick-action-history"
                  className={'btn btn-secondary ' + styles.qaBtn}
                  onClick={() => setTab('transactions')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M3 4h10M3 8h8M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  View History
                </button>
                <button
                  data-testid="quick-action-settlement"
                  className={'btn btn-ghost ' + styles.qaBtn}
                  onClick={() => setTab('settlement')}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1l6 3v5c0 3-2.5 5-6 6-3.5-1-6-3-6-6V4z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Settlement
                  {queueSize > 0 && <span className={styles.badge}>{queueSize} pending</span>}
                </button>
              </div>
              <TransactionList
                txs={txs.slice(0, 5)}
                compact
                onViewAll={() => setTab('transactions')}
              />
            </div>
          )}

          {tab === 'send' && (
            <SendMoneyForm
              session={session}
              addToast={addToast}
              onSuccess={() => { refreshAll(); }}
            />
          )}

          {tab === 'transactions' && (
            <TransactionList txs={txs} userId={session.userId} />
          )}

          {tab === 'settlement' && (
            <SettlementPanel
              session={session}
              addToast={addToast}
              queueSize={queueSize}
              onSettled={refreshAll}
            />
          )}
        </div>
      </main>
    </div>
  )
}
