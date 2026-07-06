import type { MemberWithDues } from '../types';

export function isPaid(member: MemberWithDues, year: number): boolean {
  return member.dues.some(d => d.year === year && d.paid === 1);
}

export function isArrears(member: MemberWithDues, year: number): boolean {
  const currentYear = new Date().getFullYear();
  if (year > currentYear) return false;
  if (!member.entry_date) return true;
  const entryYear = parseInt(member.entry_date.slice(0, 4), 10);
  return year >= entryYear;
}
