import type { Page } from '../App';

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
  return (
    <nav aria-label="Navigation principale" style={styles.nav}>
      <div style={styles.brand}>MCY Compta</div>
      <ul style={styles.list}>
        {NAV_ITEMS.map(item => {
          const active = currentPage === item.id;
          return (
            <li key={item.id}>
              <button
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                style={{
                  ...styles.btn,
                  ...(active ? styles.btnActive : {}),
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const styles = {
  nav: {
    width: '210px',
    flexShrink: 0,
    background: '#1e293b',
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '0',
  },
  brand: {
    padding: '1.25rem 1rem',
    fontWeight: 700,
    fontSize: '1rem',
    letterSpacing: '0.02em',
    borderBottom: '1px solid #334155',
    color: '#f1f5f9',
  },
  list: {
    listStyle: 'none',
    margin: '0.5rem 0 0',
    padding: 0,
  },
  btn: {
    display: 'block',
    width: '100%',
    textAlign: 'left' as const,
    padding: '0.65rem 1rem',
    background: 'transparent',
    color: '#94a3b8',
    border: 'none',
    borderLeft: '3px solid transparent',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  btnActive: {
    background: '#334155',
    color: '#93c5fd',
    borderLeftColor: '#3b82f6',
  },
} as const;
