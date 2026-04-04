import { useState } from 'react'
import { api } from '../api'
import styles from './LoginView.module.css'

export default function LoginView({ onLogin, addToast }) {
  const [userId, setUserId] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!userId.trim()) return
    setLoading(true)
    try {
      const data = await api.login(userId.trim().toLowerCase())
      onLogin(data.userId, data.token)
    } catch (err) {
      addToast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (name) => setUserId(name)

  return (
    <div className={styles.container}>
      <div className={styles.card + ' animate-fade-in-scale'}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" fill="url(#grad)" opacity="0.9"/>
              <path d="M10 14L13 17L18 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="grad" x1="2" y1="2" x2="26" y2="26">
                  <stop stopColor="#00D4AA"/>
                  <stop offset="1" stopColor="#0088CC"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <div className={styles.logoName}>GlobalPay</div>
            <div className={styles.logoTag}>Real-time · Borderless</div>
          </div>
        </div>

        <div className={styles.heading}>
          <h1>Sign in</h1>
          <p>Enter your user ID to continue</p>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>User ID</label>
            <input
              type="text"
              value={userId}
              onChange={e => setUserId(e.target.value)}
              placeholder="e.g. alice"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <button
            type="submit"
            className={'btn btn-primary btn-full btn-lg ' + styles.submitBtn}
            disabled={loading || !userId.trim()}
          >
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Signing in...' : 'Continue →'}
          </button>
        </form>

        <div className={styles.demo}>
          <p>Demo accounts</p>
          <div className={styles.chips}>
            {['alice','bob','charlie','diana','eve'].map(u => (
              <button key={u} className={styles.chip} onClick={() => fillDemo(u)}>
                {u}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className={styles.footer}>
        Secured · Regulated · Instant
      </p>
    </div>
  )
}
