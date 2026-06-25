import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content:   ReactNode;
  children?: ReactNode;  // déclencheur personnalisé ; si absent, affiche le bouton "?"
}

export default function Tooltip({ content, children }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      {children ?? (
        <span className={styles.icon} role="img" aria-label="Aide">?</span>
      )}
      <span className={styles.bubble} role="tooltip">{content}</span>
    </span>
  );
}
