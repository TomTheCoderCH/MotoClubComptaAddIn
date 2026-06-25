import { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import DashboardPage   from './pages/DashboardPage';
import AccountsPage    from './pages/AccountsPage';
import JournalPage     from './pages/JournalPage';
import FiscalYearsPage from './pages/FiscalYearsPage';
import BalancesPage    from './pages/BalancesPage';
import AnalyticsPage   from './pages/AnalyticsPage';
import BilanPage       from './pages/BilanPage';
import AccountLedgerPage from './pages/AccountLedgerPage';
import SettingsPage    from './pages/SettingsPage';
import WelcomePage     from './pages/WelcomePage';

export type Page = 'dashboard' | 'accounts' | 'journal' | 'fiscal-years' | 'balances' | 'analytics' | 'bilan' | 'ledger' | 'settings' | 'welcome';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page | null>(null);
  const [ledgerParams, setLedgerParams] = useState<{ accountId: number; fiscalYearId: number } | null>(null);

  useEffect(() => {
    window.api.getSettings()
      .then(s  => setCurrentPage(s ? 'dashboard' : 'welcome'))
      .catch(() => setCurrentPage('welcome'));
  }, []);

  const openLedger = useCallback((accountId: number, fiscalYearId: number) => {
    setLedgerParams({ accountId, fiscalYearId });
    setCurrentPage('ledger');
  }, []);

  if (currentPage === null) return null;
  if (currentPage === 'welcome') return <WelcomePage onReady={() => setCurrentPage('accounts')} />;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':    return <DashboardPage />;
      case 'accounts':     return <AccountsPage />;
      case 'journal':      return <JournalPage />;
      case 'fiscal-years': return <FiscalYearsPage />;
      case 'balances':     return <BalancesPage onOpenLedger={openLedger} />;
      case 'analytics':    return <AnalyticsPage />;
      case 'bilan':        return <BilanPage />;
      case 'ledger':
        return ledgerParams
          ? <AccountLedgerPage
              accountId={ledgerParams.accountId}
              fiscalYearId={ledgerParams.fiscalYearId}
              onBack={() => setCurrentPage('balances')}
            />
          : <BalancesPage onOpenLedger={openLedger} />;
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
