import { jsPDF } from 'jspdf';
import type { PayrollRow } from './supabase';

type Cell = string | number | boolean | null | undefined;

// Prefix cells that spreadsheet apps would evaluate as formulas (CSV injection).
function csvCell(value: Cell): string {
  let s = value === null || value === undefined ? '' : String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, header: string[], rows: Cell[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
  // BOM so Excel opens UTF-8 (e.g. Hindi names) correctly
  const blob = new Blob(['\uFEFF', body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** One-page pay slip. jsPDF core fonts are Latin-only, so amounts use the ISO code (e.g. "INR"). */
export function downloadPayslip(row: PayrollRow, currency: string, companyName: string) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const amount = (n: number) => `${currency} ${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const lines: [string, string][] = [
    ['Employee', `${row.full_name} (${row.employee_code})`],
    ['Period', `${MONTHS[row.month - 1]} ${row.year}`],
    ['Days worked', String(row.days_worked)],
    ['Base hours', `${row.base_hours} h`],
    ['Overtime hours', `${row.overtime_hours} h`],
    ['Hourly rate', amount(row.hourly_rate)],
    ['Base pay', amount(row.base_pay)],
    [`Overtime pay (x${row.overtime_multiplier})`, amount(row.overtime_pay)],
  ];

  doc.setFontSize(18);
  doc.text(companyName, 20, 22);
  doc.setFontSize(13);
  doc.text('Pay Slip', 20, 31);
  doc.setFontSize(11);
  lines.forEach(([label, value], i) => {
    doc.text(label, 20, 48 + i * 9);
    doc.text(value, 190, 48 + i * 9, { align: 'right' });
  });
  const y = 48 + lines.length * 9 + 4;
  doc.line(20, y - 5, 190, y - 5);
  doc.setFontSize(13);
  doc.text('Total pay', 20, y + 2);
  doc.text(amount(row.total_pay), 190, y + 2, { align: 'right' });
  if (row.incomplete_days > 0) {
    doc.setFontSize(9);
    doc.text(`${row.incomplete_days} day(s) without clock-out were not counted.`, 20, y + 14);
  }
  doc.save(`payslip_${row.employee_code}_${row.year}-${String(row.month).padStart(2, '0')}.pdf`);
}
