import type { Page } from '../App';
import { useHelp } from './HelpContext';
import styles from './Sidebar.module.css';

const NAV_ITEMS: Array<{ id: Page; label: string }> = [
  { id: 'accounts',     label: 'Plan comptable' },
  { id: 'journal',      label: 'Journal'        },
  { id: 'fiscal-years', label: 'Exercices'      },
  { id: 'balances',     label: 'Soldes'         },
  { id: 'settings',     label: 'Paramètres'     },
];

interface SidebarProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ currentPage, onNavigate }: SidebarProps) {
  const { toggle, isOpen } = useHelp();

  return (
    <nav aria-label="Navigation principale" className={styles.nav}>
      <div className={styles.brand}>MCY Compta</div>
      <ul className={styles.list}>
        {NAV_ITEMS.map(item => (
          <li key={item.id}>
            <button
              onClick={() => onNavigate(item.id)}
              aria-current={currentPage === item.id ? 'page' : undefined}
              className={styles.btn}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
      <div className={styles.helpSection}>
        <button
          onClick={toggle}
          aria-label="Aide"
          aria-expanded={isOpen}
          className={styles.helpBtn}
        >
          Aide
        </button>
      </div>
    </nav>
  );
}
