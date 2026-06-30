import { useEffect } from 'react';
import styles from './Toast.module.css';

interface ToastProps {
  message:   string;
  onDismiss: () => void;
  variant?:  'success' | 'error';
  duration?: number;
}

export default function Toast({ message, onDismiss, variant = 'success', duration = 2500 }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [onDismiss, duration]);

  return (
    <div className={styles.toast} data-variant={variant} role={variant === 'error' ? 'alert' : 'status'} aria-live="polite">
      {message}
    </div>
  );
}
