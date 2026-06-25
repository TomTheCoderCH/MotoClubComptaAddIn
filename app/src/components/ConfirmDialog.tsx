import Modal from './Modal';
import styles from './ConfirmDialog.module.css';

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      role="alertdialog"
      ariaDescribedby="confirm-message"
      onClose={onCancel}
      className={styles.card}
      data-testid="confirm-overlay"
    >
      <p id="confirm-message" className={styles.message}>{message}</p>
      <div className={styles.actions}>
        <button onClick={onCancel}  className={styles.cancelBtn}>Annuler</button>
        <button onClick={onConfirm} className={styles.confirmBtn}>Confirmer</button>
      </div>
    </Modal>
  );
}
