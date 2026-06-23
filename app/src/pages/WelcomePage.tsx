import { useState } from 'react';
import styles from './WelcomePage.module.css';

interface WelcomePageProps {
  onReady: () => void;
}

export default function WelcomePage({ onReady }: WelcomePageProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleChoose() {
    setLoading(true);
    setError(null);
    try {
      const chosen = await window.api.chooseDataDir();
      if (chosen) onReady();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.h1}>Bienvenue dans MCY Compta</h1>
        <p className={styles.desc}>
          Choisissez l&apos;emplacement où sera stockée votre base de données.
        </p>
        <p className={styles.hint}>
          Conseil : placez ce dossier dans OneDrive ou un dossier synchronisé
          pour une protection cloud automatique.
        </p>
        {error && <div role="alert" className={styles.alert}>Erreur : {error}</div>}
        <button onClick={handleChoose} disabled={loading} className={styles.btn}>
          {loading ? 'Ouverture…' : 'Choisir le dossier de données'}
        </button>
      </div>
    </div>
  );
}
