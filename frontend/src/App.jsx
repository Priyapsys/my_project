import { useState, useCallback, useEffect } from 'react'
import { api } from './api'
import LoginView from './components/LoginView'
import KycView from './components/KycView'
import Dashboard from './components/Dashboard'
import Toast from './components/Toast'

export default function App() {
  const [session, setSession] = useState(() => {
    try {
      const saved = localStorage.getItem('globalpay_session')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [view, setView] = useState('login')   // login | kyc | dashboard
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  useEffect(() => {
    if (session) {
      api.kycStatus(session.token)
        .then(kyc => {
          if (kyc.status === 'VERIFIED') {
            setView('dashboard')
          } else {
            setView('kyc')
          }
        })
        .catch(() => {
          setSession(null)
          localStorage.removeItem('globalpay_session')
          setView('login')
        })
    } else {
      setView('login')
    }
  }, [session])

  const handleLogin = async (userId, token) => {
    const sess = { userId, token }
    setSession(sess)
    localStorage.setItem('globalpay_session', JSON.stringify(sess))
    addToast(`Welcome, ${userId}!`, 'success')
    try {
      const kyc = await api.kycStatus(token)
      if (kyc.status === 'VERIFIED') {
        setView('dashboard')
        return
      }
    } catch { /* fallthrough to kyc */ }
    setView('kyc')
  }

  const handleKycDone = () => {
    setView('dashboard')
    addToast('Identity verified. You\'re all set.', 'success')
  }

  const handleLogout = () => {
    setSession(null)
    localStorage.removeItem('globalpay_session')
    setView('login')
    addToast('Logged out successfully.', 'info')
  }

  return (
    <>
      {view === 'login' && (
        <LoginView onLogin={handleLogin} addToast={addToast} />
      )}
      {view === 'kyc' && session && (
        <KycView session={session} onDone={handleKycDone} addToast={addToast} />
      )}
      {view === 'dashboard' && session && (
        <Dashboard session={session} onLogout={handleLogout} addToast={addToast} />
      )}
      <Toast toasts={toasts} />
    </>
  )
}
