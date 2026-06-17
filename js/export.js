// ─────────────────────────────────────────────────────────────
//  export.js — Excel export via SheetJS
//  Finance Tracker v2
//  Requires SheetJS (XLSX) to be loaded as a global before calling.
//  CDN: https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js
// ─────────────────────────────────────────────────────────────

import { formatDate, formatMonth } from './format.js';

// ── Internal helpers ──────────────────────────────────────────

/** @param {Map<string,any>} accMap @param {string} id */
function _accName(accMap, id) {
  return accMap.get(id)?.name ?? '—';
}

/** Convert amountMinor (integer) to decimal THB string with 2 dp. */
function _thb(amountMinor) {
  return (amountMinor / 100).toFixed(2);
}

// ── Public export function ────────────────────────────────────

/**
 * Build and download an Excel workbook from Finance Tracker data.
 *
 * Sheets produced:
 *   1. "รายการ"    — every transaction (date, type, account, category, amount, note)
 *   2. "สรุปเดือน" — monthly totals (income / expense / net)
 *   3. "บัญชี"     — account balances derived from all transactions
 *
 * @param {Object[]} transactions — v2 transaction objects (amountMinor field)
 * @param {Object[]} accounts     — account objects
 * @param {Object[]} categories   — category objects
 * @param {string}   [filename]   — output file name WITHOUT extension (default: "finance-export")
 */
export function exportTransactions(
  transactions,
  accounts,
  categories,
  filename = 'finance-export'
) {
  // Guard: SheetJS must be available as global XLSX
  if (typeof globalThis.XLSX === 'undefined') {
    // eslint-disable-next-line no-alert
    alert(
      'SheetJS ยังไม่ได้โหลด\n' +
      'กรุณาเพิ่ม <script> tag นี้ใน index.html ก่อน export:\n' +
      'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js'
    );
    return;
  }

  const XLSX = globalThis.XLSX;

  // Build lookup maps once
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));

  const TYPE_LABEL = { income: 'รายรับ', expense: 'รายจ่าย', transfer: 'โอน' };

  // Active (non-deleted) transactions, newest first
  const activeTxs = transactions
    .filter(tx => !tx.deletedAt)
    .sort((a, b) => {
      const dc = (b.date ?? '').localeCompare(a.date ?? '');
      return dc !== 0 ? dc : (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });

  const wb = XLSX.utils.book_new();

  // ── Sheet 1: รายการ ────────────────────────────────────────

  const sheet1Rows = activeTxs.map(tx => {
    let accountCol;
    if (tx.type === 'transfer') {
      accountCol = `${_accName(accMap, tx.fromAccountId)} → ${_accName(accMap, tx.toAccountId)}`;
    } else {
      accountCol = accMap.get(tx.accountId)?.name ?? '—';
    }

    const category = tx.type === 'transfer'
      ? '—'
      : (catMap.get(tx.categoryId)?.name ?? '—');

    return {
      'วันที่':      formatDate(tx.date),
      'ประเภท':      TYPE_LABEL[tx.type] ?? tx.type,
      'บัญชี':       accountCol,
      'หมวดหมู่':    category,
      'จำนวน (฿)':  _thb(tx.amountMinor),
      'โน้ต':        tx.note ?? '',
    };
  });

  const ws1 = XLSX.utils.json_to_sheet(sheet1Rows);
  ws1['!cols'] = [
    { wch: 16 }, // วันที่
    { wch: 10 }, // ประเภท
    { wch: 22 }, // บัญชี
    { wch: 16 }, // หมวดหมู่
    { wch: 14 }, // จำนวน
    { wch: 28 }, // โน้ต
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'รายการ');

  // ── Sheet 2: สรุปเดือน ─────────────────────────────────────

  /** @type {Map<string, {income: number, expense: number}>} */
  const monthMap = new Map();
  for (const tx of activeTxs) {
    const month = tx.date?.slice(0, 7);
    if (!month) continue;
    if (!monthMap.has(month)) monthMap.set(month, { income: 0, expense: 0 });
    const m = monthMap.get(month);
    if (tx.type === 'income')  m.income  += tx.amountMinor;
    if (tx.type === 'expense') m.expense += tx.amountMinor;
  }

  const sortedMonths = [...monthMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  const sheet2Rows = sortedMonths.map(([month, { income, expense }]) => ({
    'เดือน':        formatMonth(month),
    'รายรับ (฿)':   _thb(income),
    'รายจ่าย (฿)':  _thb(expense),
    'คงเหลือ (฿)':  _thb(income - expense),
  }));

  if (sheet2Rows.length > 0) {
    const totalIncome  = sortedMonths.reduce((s, [, m]) => s + m.income,  0);
    const totalExpense = sortedMonths.reduce((s, [, m]) => s + m.expense, 0);
    sheet2Rows.push({
      'เดือน':        'รวมทั้งหมด',
      'รายรับ (฿)':   _thb(totalIncome),
      'รายจ่าย (฿)':  _thb(totalExpense),
      'คงเหลือ (฿)':  _thb(totalIncome - totalExpense),
    });
  }

  const ws2 = XLSX.utils.json_to_sheet(sheet2Rows);
  ws2['!cols'] = [{ wch: 20 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws2, 'สรุปเดือน');

  // ── Sheet 3: บัญชี ─────────────────────────────────────────

  // Start each account at its initialBalanceMinor
  /** @type {Map<string, {name: string, icon: string, balance: number}>} */
  const balMap = new Map();
  for (const acc of accounts) {
    if (acc.archived || acc.deletedAt) continue;
    balMap.set(acc.id, {
      name:    acc.name,
      icon:    acc.icon ?? '',
      balance: acc.initialBalanceMinor ?? 0,
    });
  }

  // Apply all (non-deleted) transactions
  for (const tx of activeTxs) {
    if (tx.type === 'income') {
      const e = balMap.get(tx.accountId);
      if (e) e.balance += tx.amountMinor;
    } else if (tx.type === 'expense') {
      const e = balMap.get(tx.accountId);
      if (e) e.balance -= tx.amountMinor;
    } else if (tx.type === 'transfer') {
      const from = balMap.get(tx.fromAccountId);
      const to   = balMap.get(tx.toAccountId);
      if (from) from.balance -= tx.amountMinor;
      if (to)   to.balance   += tx.amountMinor;
    }
  }

  const sheet3Rows = [...balMap.values()].map(({ name, icon, balance }) => ({
    'บัญชี':           [icon, name].filter(Boolean).join(' '),
    'ยอดคงเหลือ (฿)':  _thb(balance),
  }));

  const ws3 = XLSX.utils.json_to_sheet(sheet3Rows);
  ws3['!cols'] = [{ wch: 24 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'บัญชี');

  // ── Download ───────────────────────────────────────────────
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
