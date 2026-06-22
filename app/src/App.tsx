import { useState } from 'react';
import Layout from './components/Layout';
import AccountsPage    from './pages/AccountsPage';
import JournalPage     from './pages/JournalPage';
import FiscalYearsPage from './pages/FiscalYearsPage';
import BalancesPage    from './pages/BalancesPage';
import SettingsPage    from './pages/SettingsPage';

export type Page = 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'settings';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('accounts');

  const renderPage = () => {
    switch (currentPage) {
      case 'accounts':     return <AccountsPage />;
      case 'journal':      return <JournalPage />;
      case 'fiscal-years': return <FiscalYearsPage />;
      case 'balances':     return <BalancesPage />;
      case 'settings':     return <SettingsPage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={setCurrentPage}>
      {renderPage()}
    </Layout>
  );
}
