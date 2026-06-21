import type { JournalEntry, JournalEntryLine, JournalFilters } from '../types';
export { DEFAULT_FILTERS } from '../types';

export type EntryWithLines = JournalEntry & { lines: JournalEntryLine[] };

export function applyFilters(entries: EntryWithLines[], filters: JournalFilters): EntryWithLines[] {
  let result = entries;

  if (filters.dateFrom) {
    result = result.filter(e => e.date >= filters.dateFrom);
  }
  if (filters.dateTo) {
    result = result.filter(e => e.date <= filters.dateTo);
  }
  if (filters.text) {
    const q = filters.text.toLowerCase();
    result = result.filter(e =>
      e.description.toLowerCase().includes(q) ||
      (e.piece?.toLowerCase().includes(q) ?? false),
    );
  }
  if (filters.accountId !== null) {
    result = result
      .map(e => ({ ...e, lines: e.lines.filter(l => l.account_id === filters.accountId) }))
      .filter(e => e.lines.length > 0);
  }

  return result;
}
