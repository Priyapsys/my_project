import { useState } from 'react'
import Decimal from 'decimal.js'
import { api } from '../api'
import styles from './SendMoneyForm.module.css'

const CURRENCIES = ['USD', 'INR', 'GBP', 'EUR', 'AED', 'JPY']
const FX_RATES = {
  USD: { USD: '1',       INR: '83.5',    GBP: '0.789',   EUR: '0.924',   AED: '3.673',   JPY: '151.6'  },
  INR: { USD: '0.01198', INR: '1',       GBP: '0.00945', EUR: '0.01107', AED: '0.043',   JPY: '1.816'  },
  GBP: { USD: '1.267',   INR: '105.83',  GBP: '1',       EUR: '1.171',   AED: '4.653',   JPY: '192.1'  },
  EUR: { USD: '1.082',   INR: '90.35',   GBP: '0.854',   EUR: '1',       AED: '3.975',   JPY: '164.1'  },
  AED: { USD: '0.2723',  INR: '22.73',   GBP: '0.2149',  EUR: '0.2516',  AED: '1',       JPY: '41.28'  },
  JPY: { USD: '0.00660', INR: '0.5508',  GBP: '0.00521', EUR: '0.00610', AED: '0.02422', JPY: '1'     },
}

function fmt(amount, currency) {
  const num = typeof amount === 'number' ? amount : Number(amount)
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  }).format(num)
}

export default function SendMoneyForm({ session, addToast, onSuccess }) {
  const [form, setForm] = useState({
    receiverId: '', amount: '', sourceCurrency: 'USD', destCurrency: 'INR'
  })
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState(null)

  const rate = FX_RATES[form.sourceCurrency]?.[form.destCurrency] ?? '1'
  let preview = null
  if (form.amount && !isNaN(form.amount) && Number(form.amount) > 0) {
    try {
      const decimals = form.destCurrency === 'JPY' ? 0 : 2
      preview = new Decimal(form.amount.trim()).times(new Decimal(rate)).toFixed(decimals)
    } catch {
      preview = null
    }
  }

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }))
    setResult(null)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.receiverId || !form.amount) return
    setLoading(true)
    setResult(null)
    try {
      const data = await api.transfer(session.token, {
        senderId: session.userId,
        receiverId: form.receiverId,
        amount: form.amount.trim(),
        sourceCurrency: form.sourceCurrency,
        destCurrency: form.destCurrency,
      })
      setResult({ success: true, data })
      addToast('Transfer completed successfully!', 'success')
      onSuccess?.()
      setForm(f => ({ ...f, receiverId: '', amount: '' }))
    } catch (err) {
      setResult({ success: false, error: err.message })
      addToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={styles.cardIcon}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
              <path d="M14 2L2 7l5 3 2 5 5-13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          </div>
          <div>
            <h2 className={styles.cardTitle}>Send Money</h2>
            <p className={styles.cardSub}>Instant, global, secure</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          {/* Receiver */}
          <div className={styles.field}>
            <label>Recipient User ID</label>
            <input
              type="text"
              data-testid="transfer-receiver-input"
              placeholder="e.g. bob"
              value={form.receiverId}
              onChange={e => set('receiverId', e.target.value)}
              autoComplete="off"
            />
          </div>

          {/* Amount + Currencies */}
          <div className={styles.amountRow}>
            <div className={styles.field + ' ' + styles.amountField}>
              <label>Amount</label>
              <div className={styles.inputWithSelect}>
                <input
                  type="number"
                  data-testid="transfer-amount-input"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={e => set('amount', e.target.value)}
                  className={styles.amountInput}
                />
                <select
                  data-testid="transfer-source-currency-select"
                  value={form.sourceCurrency}
                  onChange={e => set('sourceCurrency', e.target.value)}
                  className={styles.currencySelect}
                >
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.arrowWrap}>
              <div className={styles.arrow}>→</div>
            </div>

            <div className={styles.field + ' ' + styles.destField}>
              <label>Recipient Gets</label>
              <select
                data-testid="transfer-dest-currency-select"
                value={form.destCurrency}
                onChange={e => set('destCurrency', e.target.value)}
                className={styles.destSelect}
              >
                {CURRENCIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* FX Preview */}
          {preview !== null && (
            <div className={styles.fxPreview + ' animate-fade-in'} data-testid="transfer-fx-preview">
              <div className={styles.fxRow}>
                <span className={styles.fxLabel}>Recipient gets</span>
                <span className={styles.fxAmount}>{fmt(preview, form.destCurrency)}</span>
              </div>
              <div className={styles.fxRow}>
                <span className={styles.fxLabel}>Exchange rate</span>
                <span className={styles.fxRate}>1 {form.sourceCurrency} = {rate} {form.destCurrency}</span>
              </div>
              <div className={styles.fxRow}>
                <span className={styles.fxLabel}>Settlement fee</span>
                <span className={styles.fxFree}>Free</span>
              </div>
            </div>
          )}

          <button
            type="submit"
            data-testid="transfer-submit-button"
            className={'btn btn-primary btn-full btn-lg ' + styles.submitBtn}
            disabled={loading || !form.receiverId || !form.amount}
          >
            {loading ? <span className="spinner" /> : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M14 2L2 7l5 3 2 5 5-13z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
              </svg>
            )}
            {loading ? 'Processing…' : 'Send Money'}
          </button>
        </form>

        {/* Success result */}
        {result?.success && (
          <div className={styles.successBox + ' animate-fade-in'} data-testid="transfer-success-box">
            <div className={styles.successHeader}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="10" fill="rgba(16,185,129,0.2)"/>
                <path d="M6 10l3 3 5-6" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Transfer Completed</span>
            </div>
            <div className={styles.successGrid}>
              <div className={styles.successItem}>
                <span>TX ID</span>
                <span className="mono" data-testid="transfer-tx-id">{result.data.txId}</span>
              </div>
              <div className={styles.successItem}>
                <span>Sent</span>
                <span>{fmt(result.data.originalAmount, result.data.sourceCurrency)}</span>
              </div>
              <div className={styles.successItem}>
                <span>Received</span>
                <span>{fmt(result.data.convertedAmount, result.data.destCurrency)}</span>
              </div>
              <div className={styles.successItem}>
                <span>Risk Score</span>
                <span style={{color: result.data.compliance.score < 60 ? 'var(--success)' : 'var(--warning)'}}>
                  {result.data.compliance.score}/100
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {result?.success === false && (
          <div className={styles.errorBox + ' animate-fade-in'} data-testid="transfer-error-box">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {result.error}
          </div>
        )}
      </div>
    </div>
  )
}
