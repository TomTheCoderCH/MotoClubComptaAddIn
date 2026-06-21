interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div style={s.overlay} data-testid="confirm-overlay">
      <div style={s.card} role="alertdialog" aria-modal="true" aria-describedby="confirm-message">
        <p id="confirm-message" style={s.message}>{message}</p>
        <div style={s.actions}>
          <button onClick={onCancel}  style={s.cancelBtn}>Annuler</button>
          <button onClick={onConfirm} style={s.confirmBtn}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay:    { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 },
  card:       { background: '#fff', borderRadius: '10px', padding: '1.5rem', minWidth: '320px', maxWidth: '480px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' },
  message:    { margin: '0 0 1.25rem', fontSize: '0.95rem', color: '#334155', lineHeight: 1.5 },
  actions:    { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' },
  cancelBtn:  { padding: '0.45rem 1rem', background: '#fff', border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', color: '#475569' },
  confirmBtn: { padding: '0.45rem 1rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500 as const },
} as const;
