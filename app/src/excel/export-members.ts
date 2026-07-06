import ExcelJS from 'exceljs';
import { isPaid, isArrears } from '../lib/members';
import { formatDate } from '../lib/format';
import type { MemberWithDues, FiscalYear } from '../types';

const HEADER_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
const ARREARS_BG: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };

export async function exportMembersToExcel(
  members: MemberWithDues[],
  _fiscalYears: FiscalYear[],
  range: { start: number; end: number },
  showInactive: boolean,
  outputPath: string,
): Promise<void> {
  const start = Math.min(range.start, range.end);
  const end = Math.max(range.start, range.end);
  const years = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  const visible = members
    .filter(m => showInactive || m.is_active === 1)
    .sort((a, b) => {
      const byLastName = a.last_name.localeCompare(b.last_name);
      return byLastName !== 0 ? byLastName : a.first_name.localeCompare(b.first_name);
    });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'MCY Compta';
  const ws = wb.addWorksheet('Membres');

  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 10;
  for (let i = 0; i < years.length; i++) {
    ws.getColumn(5 + i).width = 8;
  }

  const titleCell = ws.getCell(1, 1);
  titleCell.value = `Membres et cotisations — ${start}–${end}`;
  titleCell.font  = { bold: true, size: 13 };
  ws.mergeCells(1, 1, 1, 4 + years.length);

  const headerRow = 3;
  const headers = ['Nom', 'Prénom', 'Entrée', 'Statut', ...years];
  headers.forEach((label, i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = label;
    c.font  = { bold: true };
    c.fill  = HEADER_BG;
  });

  let row = headerRow + 1;
  for (const member of visible) {
    ws.getCell(row, 1).value = member.last_name;
    ws.getCell(row, 2).value = member.first_name;
    ws.getCell(row, 3).value = member.entry_date ? formatDate(member.entry_date) : '';
    ws.getCell(row, 4).value = member.is_active === 1 ? 'Actif' : 'Inactif';

    years.forEach((year, i) => {
      const cell = ws.getCell(row, 5 + i);
      const paid = isPaid(member, year);
      cell.value = paid ? '✓' : '—';
      cell.alignment = { horizontal: 'center' };
      if (!paid && isArrears(member, year)) {
        cell.fill = ARREARS_BG;
      }
    });

    row++;
  }

  await wb.xlsx.writeFile(outputPath);
}
