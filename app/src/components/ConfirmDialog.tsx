import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className={styles.overlay} data-testid="confirm-overlay">
      <div className={styles.card} role="alertdialog" aria-modal="true" aria-describedby="confirm-message">
        <p id="confirm-message" className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button onClick={onCancel}  className={styles.cancelBtn}>Annuler</button>
          <button onClick={onConfirm} className={styles.confirmBtn}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}
