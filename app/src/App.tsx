import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import AccountsPage    from './pages/AccountsPage';
import JournalPage     from './pages/JournalPage';
import FiscalYearsPage from './pages/FiscalYearsPage';
import BalancesPage    from './pages/BalancesPage';
import SettingsPage    from './pages/SettingsPage';
import WelcomePage     from './pages/WelcomePage';

export type Page = 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'settings' | 'welcome';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page | null>(null);

  useEffect(() => {
    window.api.getSettings()
      .then(s  => setCurrentPage(s ? 'accounts' : 'welcome'))
      .catch(() => setCurrentPage('welcome'));
  }, []);

  if (currentPage === null) return null;
  if (currentPage === 'welcome') return <WelcomePage />;

  const renderPage = () => {
    switch (currentPage) {
      case 'accounts':     return <AccountsPage />;
      case 'journal':      return <JournalPage />;
      case 'fiscal-years': return <FiscalYearsPage />;
      case 'balances':     return <BalancesPage />;
      case 'settings':     return <SettingsPage />;
      default:             return <AccountsPage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={(p) => setCurrentPage(p)}>
      {renderPage()}
    </Layout>
  );
}
