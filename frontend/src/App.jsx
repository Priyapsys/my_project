import { useState, useCallback } from 'react'
import LoginView from './components/LoginView'
import KycView from './components/KycView'
import Dashboard from './components/Dashboard'
import Toast from './components/Toast'

export default function App() {
  const [view, setView]     = useState('login')   // login | kyc | dashboard
  const [session, setSession] = useState(null)    // { userId, token }
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }, [])

  const handleLogin = (userId, token) => {
    setSession({ userId, token })
    setView('kyc')
    addToast(`Welcome, ${userId}!`, 'success')
  }

  const handleKycDone = () => {
    setView('dashboard')
    addToast('Identity verified. You\'re all set.', 'success')
  }

  const handleLogout = () => {
    setSession(null)
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
