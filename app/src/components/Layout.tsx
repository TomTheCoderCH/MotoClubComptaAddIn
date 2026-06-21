import type { ReactNode } from 'react';
import type { Page } from '../App';
import Sidebar from './Sidebar';

interface LayoutProps {
  currentPage: Page;
  onNavigate:  (page: Page) => void;
  children:    ReactNode;
}

export default function Layout({ currentPage, onNavigate, children }: LayoutProps) {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
      <main style={{ flex: 1, overflow: 'auto', padding: '2rem', background: '#f8fafc' }}>
        {children}
      </main>
    </div>
  );
}
