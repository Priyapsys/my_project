export default function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
        >
          {t.type === 'success' && '✓ '}
          {t.type === 'error'   && '✕ '}
          {t.type === 'info'    && '· '}
          {t.message}
        </div>
      ))}
    </div>
  )
}
