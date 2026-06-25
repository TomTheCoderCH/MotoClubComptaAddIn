import { useEffect, type ReactNode } from 'react';
import styles from './Modal.module.css';

interface Props {
  children:   ReactNode;
  onClose?:   () => void;  // appelé sur Escape si fourni
  className?: string;      // classe CSS additionnelle sur le panneau interne
  role?:      'dialog' | 'alertdialog';
  ariaLabel?: string;
  ariaLabelledby?: string;
  ariaDescribedby?: string;
  'data-testid'?: string;
}

export default function Modal({
  children,
  onClose,
  className,
  role = 'dialog',
  ariaLabel,
  ariaLabelledby,
  ariaDescribedby,
  'data-testid': testId,
}: Props) {
  useEffect(() => {
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className={styles.overlay} data-testid={testId}>
      <div
        className={className ? `${styles.panel} ${className}` : styles.panel}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
      >
        {children}
      </div>
    </div>
  );
}
