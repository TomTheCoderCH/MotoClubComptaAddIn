import type { ReactNode } from 'react';
import type { Page } from '../App';
import Sidebar from './Sidebar';
import styles from './Layout.module.css';

interface LayoutProps {
  currentPage: Page;
  onNavigate:  (page: Page) => void;
  children:    ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  return (
    <div className={styles.shell}>
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
