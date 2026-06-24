import { useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Page } from '../App';
import Sidebar from './Sidebar';
import HelpDrawer from './HelpDrawer';
import { HelpContext } from './HelpContext';
import styles from './Layout.module.css';

interface LayoutProps {
  currentPage: Page;
  onNavigate:  (page: Page) => void;
  children:    ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen(v => !v), []);
  const close  = useCallback(() => setIsOpen(false),   []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1')     { e.preventDefault(); toggle(); }
      if (e.key === 'Escape') { close(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggle, close]);

  return (
    <HelpContext.Provider value={{ isOpen, toggle, close }}>
      <div className={styles.shell}>
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
        <main className={styles.main}>
          {children}
        </main>
      </div>
      <HelpDrawer />
    </HelpContext.Provider>
  );
}
