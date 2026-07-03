import type { FiscalYear, MemberWithDues, Account } from '../types';

interface Props {
  member: MemberWithDues;
  fiscalYears: FiscalYear[];
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}

export default function MembrePaiementModal(_props: Props) {
  return null;
}
