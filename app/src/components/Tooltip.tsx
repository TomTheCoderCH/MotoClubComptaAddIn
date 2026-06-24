import type { ReactNode } from 'react';
import styles from './Tooltip.module.css';

interface TooltipProps {
  content: ReactNode;
}

export default function Tooltip({ content }: TooltipProps) {
  return (
    <span className={styles.wrapper}>
      <span className={styles.icon} role="img" aria-label="Aide">?</span>
      <span className={styles.bubble} role="tooltip">{content}</span>
    </span>
  );
}
