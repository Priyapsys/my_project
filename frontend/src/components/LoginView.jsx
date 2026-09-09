import { useState } from 'react'
import { api } from '../api'
import styles from './LoginView.module.css'

export default function LoginView({ onLogin, addToast }) {
  const [mode, setMode] = useState('login')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const isSignup = mode === 'signup'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!userId.trim() || !password) return
    setLoading(true)
    try {
      const data = isSignup
        ? await api.signup(userId.trim().toLowerCase(), password)
        : await api.login(userId.trim().toLowerCase(), password)
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
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" fill="url(#grad)" opacity="0.9"/>
              <path d="M10 14L13 17L18 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <defs><linearGradient id="grad" x1="2" y1="2" x2="26" y2="26"><stop stopColor="#00D4AA"/><stop offset="1" stopColor="#0088CC"/></linearGradient></defs>
            </svg>
          </div>
          <div><div className={styles.logoName}>GlobalPay</div><div className={styles.logoTag}>Real-time · Borderless</div></div>
        </div>
        <div className={styles.heading}>
          <h1>{isSignup ? 'Create your account' : 'Sign in'}</h1>
          <p>{isSignup ? 'Choose credentials to get started' : 'Enter your credentials to continue'}</p>
        </div>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label>User ID</label>
            <input type="text" data-testid="login-user-id-input" value={userId} onChange={e => setUserId(e.target.value)} placeholder="e.g. alice" autoFocus autoComplete="username" spellCheck={false}/>
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input type="password" data-testid="login-password-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" autoComplete={isSignup ? 'new-password' : 'current-password'}/>
          </div>
          <button type="submit" data-testid="login-submit-button" className={'btn btn-primary btn-full btn-lg ' + styles.submitBtn} disabled={loading || !userId.trim() || !password}>
            {loading ? <span className="spinner" /> : null}
            {loading ? (isSignup ? 'Creating account...' : 'Signing in...') : (isSignup ? 'Create account →' : 'Continue →')}
          </button>
        </form>
        {!isSignup && <div className={styles.demo}>
          <p>Demo accounts</p>
          <div className={styles.chips}>{['alice','bob','charlie','diana','eve'].map(u => <button key={u} data-testid={'demo-user-' + u} className={styles.chip} onClick={() => fillDemo(u)}>{u}</button>)}</div>
        </div>}
        <button type="button" data-testid="auth-mode-toggle" className={styles.chip} onClick={() => setMode(isSignup ? 'login' : 'signup')}>
          {isSignup ? 'Already have an account? Sign in' : 'New here? Create an account'}
        </button>
      </div>
      <p className={styles.footer}>Secured · Regulated · Instant</p>
    </div>
  )
}
