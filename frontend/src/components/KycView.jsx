import { useState } from 'react'
import { api } from '../api'
import styles from './KycView.module.css'

export default function KycView({ session, onDone, addToast }) {
  const [step, setStep] = useState(1) // 1: Form, 2: Loading, 3: Done
  const [livenessDone, setLivenessDone] = useState(false)

  const handleVerify = async (e) => {
    e.preventDefault()
    setStep(2)
    try {
      await api.kycVerify(session.token)
      // Simulate real processing time
      setTimeout(() => {
        setStep(3)
        setTimeout(() => onDone(), 2000)
      }, 2500)
    } catch (err) {
      addToast(err.message, 'error')
      setStep(1)
    }
  }

  const handleLiveness = () => {
    setLivenessDone(true)
  }

  return (
    <div className={styles.container}>
      <div className={styles.card + ' animate-fade-in-scale'}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.logoRow}>
            <div className={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L26 8V20L14 26L2 20V8L14 2Z" fill="url(#g2)" opacity="0.9"/>
                <path d="M10 14L13 17L18 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="g2" x1="2" y1="2" x2="26" y2="26">
                    <stop stopColor="#00D4AA"/><stop offset="1" stopColor="#0088CC"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className={styles.brand}>GlobalPay</span>
          </div>
        </div>

        {step === 1 && (
          <div className={styles.stepContainer + ' animate-fade-in'}>
            <div className={styles.content}>
              <h2>Identity Verification</h2>
              <p>Hi {session.userId}, we need to verify your identity before you can send money.</p>
            </div>
            <form onSubmit={handleVerify} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Government ID Number</label>
                <input type="text" placeholder="e.g. AB1234567" required className={styles.input} />
              </div>
              
              <div className={styles.formGroup}>
                <label>Residential Address</label>
                <input type="text" placeholder="123 Main St, City, Country" required className={styles.input} />
              </div>
              
              <div className={styles.formGroup}>
                <label>Upload ID (Front & Back)</label>
                <input type="file" required className={styles.fileInput} />
              </div>

              <div className={styles.formGroup}>
                <button 
                  type="button" 
                  className={`${styles.livenessBtn} ${livenessDone ? styles.livenessBtnDone : ''}`}
                  onClick={handleLiveness}
                >
                  {livenessDone ? (
                    <>
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
                        <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Liveness Check Complete
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5"/>
                        <path d="M12 16v.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M10 10c0-1.5 4-1.5 4 0 0 1-2 1.5-2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                      Start Liveness Check
                    </>
                  )}
                </button>
              </div>

              <button
                type="submit"
                className={'btn btn-primary btn-full btn-lg ' + styles.verifyBtn}
              >
                Verify Identity
              </button>
            </form>
          </div>
        )}

        {step === 2 && (
          <div className={styles.stepContainer + ' animate-fade-in'}>
            <div className={styles.loadingPulse}>
              <div className={styles.spinnerWrapper}>
                <svg className={styles.spinnerSvg} viewBox="0 0 50 50">
                  <circle className={styles.spinnerPath} cx="25" cy="25" r="20" fill="none" strokeWidth="4"></circle>
                </svg>
              </div>
              <div className={styles.iconWrapLoading}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M9 12l2 2 4-4" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v3a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6h3" stroke="var(--border-active)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <div className={styles.content}>
              <h2>Verifying your identity...</h2>
              <p>We are analyzing your documents and running a background check. This usually takes a few seconds.</p>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className={styles.stepContainer + ' animate-fade-in-scale'}>
            <div className={styles.iconWrapDone}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="20" fill="rgba(16,185,129,0.15)"/>
                <path d="M12 20l6 6 10-12" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className={styles.content}>
              <h2>KYC Verified</h2>
              <p>You're all set, {session.userId}. Taking you to your dashboard…</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
