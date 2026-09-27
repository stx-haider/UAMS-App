import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { FeedbackContext } from './feedbackContext';

export function FeedbackProvider({ children }) {
  const [toast, setToast] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const toastTimer = useRef(null);
  const resolver = useRef(null);

  const notify = useCallback((message, tone = 'success') => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);

  const confirm = useCallback((message, title = 'Please confirm') => new Promise((resolve) => {
    if (resolver.current) resolver.current(false);
    resolver.current = resolve;
    setConfirmation({ message, title });
  }), []);

  const resolveConfirmation = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setConfirmation(null);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!confirmation) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') resolveConfirmation(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [confirmation, resolveConfirmation]);

  const ToastIcon = toast?.tone === 'error' ? CircleAlert : toast?.tone === 'info' ? Info : CircleCheck;

  return (
    <FeedbackContext.Provider value={{ notify, confirm }}>
      {children}
      {toast && <div className={`app-toast ${toast.tone}`} role={toast.tone === 'error' ? 'alert' : 'status'}>
        <ToastIcon size={19} aria-hidden="true" />
        <span>{toast.message}</span>
        <button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={17} /></button>
      </div>}
      {confirmation && <div className="app-confirm-backdrop" onMouseDown={(event) => {
        if (event.target === event.currentTarget) resolveConfirmation(false);
      }}>
        <section className="app-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message">
          <div className="app-confirm-icon"><CircleAlert size={22} /></div>
          <h2 id="app-confirm-title">{confirmation.title}</h2>
          <p id="app-confirm-message">{confirmation.message}</p>
          <div className="app-confirm-actions">
            <button type="button" className="app-button secondary" onClick={() => resolveConfirmation(false)}>Cancel</button>
            <button type="button" className="app-button" autoFocus onClick={() => resolveConfirmation(true)}>Continue</button>
          </div>
        </section>
      </div>}
    </FeedbackContext.Provider>
  );
}
