import { useState, useEffect } from 'react';
import Layout from './components/Layout';
import DashboardPage   from './pages/DashboardPage';
import AccountsPage    from './pages/AccountsPage';
import JournalPage     from './pages/JournalPage';
import FiscalYearsPage from './pages/FiscalYearsPage';
import BalancesPage    from './pages/BalancesPage';
import AnalyticsPage   from './pages/AnalyticsPage';
import BilanPage       from './pages/BilanPage';
import SettingsPage    from './pages/SettingsPage';
import WelcomePage     from './pages/WelcomePage';

export type Page = 'dashboard' | 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'analytics' | 'bilan' | 'settings' | 'welcome';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page | null>(null);

  useEffect(() => {
    window.api.getSettings()
      .then(s  => setCurrentPage(s ? 'dashboard' : 'welcome'))
      .catch(() => setCurrentPage('welcome'));
  }, []);

  if (currentPage === null) return null;
  if (currentPage === 'welcome') return <WelcomePage onReady={() => setCurrentPage('accounts')} />;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':    return <DashboardPage />;
      case 'accounts':     return <AccountsPage />;
      case 'journal':      return <JournalPage />;
      case 'fiscal-years': return <FiscalYearsPage />;
      case 'balances':     return <BalancesPage />;
      case 'analytics':    return <AnalyticsPage />;
      case 'bilan':        return <BilanPage />;
      case 'settings':     return <SettingsPage />;
      default:             return <DashboardPage />;
    }
  };

  return (
    <Layout currentPage={currentPage} onNavigate={(p) => setCurrentPage(p)}>
      {renderPage()}
    </Layout>
  );
}
