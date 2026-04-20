import { useState } from 'react'
import { api } from '../api'
import styles from './KycView.module.css'

const ID_TYPES = [
  { value: 'passport',       label: '🛂  Passport' },
  { value: 'national_id',   label: '🪪  National ID' },
  { value: 'driver_license', label: '🚗  Driver\'s License' },
]

// ── Step indicator labels
const STEPS = ['ID Document', 'Address Proof', 'Face Check']

export default function KycView({ session, onDone, addToast }) {
  // currentStep: 1 | 2 | 3   — which form we're showing
  // phase:  'form' | 'loading' | 'done'
  const [currentStep, setCurrentStep] = useState(1)
  const [phase, setPhase] = useState('form')

  // Step 1 fields
  const [idType, setIdType]     = useState('passport')
  const [idNumber, setIdNumber] = useState('')

  // Step 2 field
  const [addressProof, setAddressProof] = useState('')

  // Step 3 field
  const [selfieDone, setSelfieDone] = useState(false)

  // ── Completed steps tracker
  const [completedSteps, setCompletedSteps] = useState([])

  // ── Generic loading wrapper
  const withLoading = async (fn) => {
    setPhase('loading')
    try {
      await fn()
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error')
      setPhase('form')
    }
  }

  // ──────────────────────────────────────────
  //  STEP 1: Submit ID
  // ──────────────────────────────────────────
  const handleSubmitId = async (e) => {
    e.preventDefault()
    if (!idNumber.trim()) { addToast('ID number is required', 'error'); return }

    withLoading(async () => {
      await api.kycSubmitId(session.token, idType, idNumber.trim())
      setCompletedSteps(prev => [...prev, 1])
      addToast('ID document submitted ✓', 'success')
      setCurrentStep(2)
      setPhase('form')
    })
  }

  // ──────────────────────────────────────────
  //  STEP 2: Submit address proof
  // ──────────────────────────────────────────
  const handleSubmitAddress = async (e) => {
    e.preventDefault()
    if (!addressProof.trim()) { addToast('Address proof is required', 'error'); return }

    withLoading(async () => {
      await api.kycSubmitAddress(session.token, addressProof.trim())
      setCompletedSteps(prev => [...prev, 2])
      addToast('Address proof submitted ✓', 'success')
      setCurrentStep(3)
      setPhase('form')
    })
  }

  // ──────────────────────────────────────────
  //  STEP 3: Face / liveness
  // ──────────────────────────────────────────
  const handleSubmitFace = async (e) => {
    e.preventDefault()
    if (!selfieDone) { addToast('Please complete the liveness check first', 'error'); return }

    withLoading(async () => {
      await api.kycSubmitFace(session.token, 'liveness-capture-data')
      setCompletedSteps(prev => [...prev, 3])
      setPhase('done')
      setTimeout(() => onDone(), 2500)
    })
  }

  // ──────────────────────────────────────────
  //  Render
  // ──────────────────────────────────────────
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

        {/* Step Progress Bar (only show during form phase) */}
        {phase !== 'done' && (
          <div className={styles.progressWrapper}>
            {STEPS.map((label, i) => {
              const stepNum = i + 1
              const isDone = completedSteps.includes(stepNum)
              const isActive = currentStep === stepNum && phase !== 'loading'
              return (
                <div key={stepNum} className={styles.progressStep}>
                  <div className={`${styles.stepBubble} ${isDone ? styles.stepDone : ''} ${isActive ? styles.stepActive : ''}`}>
                    {isDone
                      ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : stepNum
                    }
                  </div>
                  <span className={`${styles.stepLabel} ${isActive ? styles.stepLabelActive : ''}`}>{label}</span>
                  {i < STEPS.length - 1 && (
                    <div className={`${styles.stepLine} ${isDone ? styles.stepLineDone : ''}`} />
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* ── LOADING STATE */}
        {phase === 'loading' && (
          <div className={styles.stepContainer + ' animate-fade-in'}>
            <div className={styles.loadingPulse}>
              <div className={styles.spinnerWrapper}>
                <svg className={styles.spinnerSvg} viewBox="0 0 50 50">
                  <circle className={styles.spinnerPath} cx="25" cy="25" r="20" fill="none" strokeWidth="4"></circle>
                </svg>
              </div>
              <div className={styles.iconWrapLoading}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                  <path d="M9 12l2 2 4-4" stroke="var(--teal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 12v3a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6V9a6 6 0 0 1 6-6h3" stroke="var(--border-active)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <div className={styles.content}>
              <h2>Processing…</h2>
              <p>Securely submitting your information.</p>
            </div>
          </div>
        )}

        {/* ── DONE STATE */}
        {phase === 'done' && (
          <div className={styles.stepContainer + ' animate-fade-in-scale'}>
            <div className={styles.iconWrapDone}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="20" fill="rgba(16,185,129,0.15)"/>
                <path d="M12 20l6 6 10-12" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className={styles.content}>
              <h2>KYC Verified 🎉</h2>
              <p>You're all set, <strong>{session.userId}</strong>. Taking you to your dashboard…</p>
            </div>
          </div>
        )}

        {/* ── STEP 1: ID Document */}
        {phase === 'form' && currentStep === 1 && (
          <div className={styles.stepContainer + ' animate-fade-in'}>
            <div className={styles.content}>
              <h2>Identity Document</h2>
              <p>Hi <strong>{session.userId}</strong>, let's start with your government-issued ID.</p>
            </div>
            <form onSubmit={handleSubmitId} className={styles.form}>
              <div className={styles.formGroup}>
                <label>ID Type</label>
                <select
                  value={idType}
                  onChange={e => setIdType(e.target.value)}
                  className={styles.input}
                  required
                >
                  {ID_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label>Document Number</label>
                <input
                  type="text"
                  placeholder="e.g. AB1234567"
                  value={idNumber}
                  onChange={e => setIdNumber(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Upload ID (Front &amp; Back)</label>
                <input type="file" accept="image/*,application/pdf" className={styles.fileInput} />
              </div>
              <button type="submit" className={'btn btn-primary btn-full btn-lg ' + styles.verifyBtn}>
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 2: Address Proof */}
        {phase === 'form' && currentStep === 2 && (
          <div className={styles.stepContainer + ' animate-fade-in'}>
            <div className={styles.content}>
              <h2>Address Verification</h2>
              <p>Provide your full residential address. We'll cross-reference it with your ID documents.</p>
            </div>
            <form onSubmit={handleSubmitAddress} className={styles.form}>
              <div className={styles.formGroup}>
                <label>Full Residential Address</label>
                <input
                  type="text"
                  placeholder="e.g. 123 Main St, Mumbai, India 400001"
                  value={addressProof}
                  onChange={e => setAddressProof(e.target.value)}
                  required
                  className={styles.input}
                />
              </div>
              <div className={styles.formGroup}>
                <label>Upload Proof of Address</label>
                <div className={styles.fileHint}>Utility bill, bank statement, or rental agreement (last 3 months)</div>
                <input type="file" accept="image/*,application/pdf" className={styles.fileInput} />
              </div>
              <button type="submit" className={'btn btn-primary btn-full btn-lg ' + styles.verifyBtn}>
                Continue →
              </button>
            </form>
          </div>
        )}

        {/* ── STEP 3: Face / Liveness */}
        {phase === 'form' && currentStep === 3 && (
          <div className={styles.stepContainer + ' animate-fade-in'}>
            <div className={styles.content}>
              <h2>Face Verification</h2>
              <p>A quick liveness check to confirm you're the real document holder.</p>
            </div>
            <form onSubmit={handleSubmitFace} className={styles.form}>
              <div className={styles.formGroup}>
                <button
                  type="button"
                  className={`${styles.livenessBtn} ${selfieDone ? styles.livenessBtnDone : ''}`}
                  onClick={() => setSelfieDone(true)}
                >
                  {selfieDone ? (
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
                disabled={!selfieDone}
                className={'btn btn-primary btn-full btn-lg ' + styles.verifyBtn + (!selfieDone ? ' ' + styles.btnDisabled : '')}
              >
                Complete Verification
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
