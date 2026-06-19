// ─────────────────────────────────────────────────────────────
//  export.js — Excel export via SheetJS
//  Finance Tracker v2
//
//  Sheets:
//    1. รายการ          — every transaction
//    2. สรุปรายเดือน    — monthly P&L + saving rate
//    3. วิเคราะห์หมวด   — category breakdown pivot by month
//    4. งบประมาณ        — budget vs actual per month
//    5. บัญชี           — all account balances (active / hidden / archived)
// ─────────────────────────────────────────────────────────────

import { formatDate, formatMonth, formatMonthShort } from './format.js';

// ── Helpers ───────────────────────────────────────────────────

const THB = v => parseFloat((v / 100).toFixed(2));   // minor → decimal number
const PCT = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

function colWidths(...wchs) {
  return wchs.map(w => ({ wch: w }));
}

// Append an AoA block to a worksheet starting at a given row
function appendAoA(XLSX, ws, data, startRow) {
  XLSX.utils.sheet_add_aoa(ws, data, { origin: { r: startRow, c: 0 } });
}

// ── Main export ───────────────────────────────────────────────

/**
 * @param {Object[]} transactions
 * @param {Object[]} accounts     — ALL accounts (active + hidden + archived)
 * @param {Object[]} categories
 * @param {Object[]} budgets      — ALL budgets (monthly + templates, non-deleted)
 * @param {string}   [filename]
 */
export function exportTransactions(
  transactions,
  accounts,
  categories,
  budgets = [],
  filename = 'finance-export'
) {
  if (typeof globalThis.XLSX === 'undefined') {
    alert('SheetJS ยังไม่ได้โหลด');
    return;
  }
  const XLSX = globalThis.XLSX;

  // ── Lookup maps ──────────────────────────────────────────────
  const accMap = new Map(accounts.map(a => [a.id, a]));
  const catMap = new Map(categories.map(c => [c.id, c]));

  const activeTxs = transactions
    .filter(t => !t.deletedAt)
    .sort((a, b) => {
      const d = (b.date ?? '').localeCompare(a.date ?? '');
      return d !== 0 ? d : (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });

  const TYPE_LABEL = { income: 'รายรับ', expense: 'รายจ่าย', transfer: 'โอน' };

  const wb = XLSX.utils.book_new();

  // ════════════════════════════════════════════════════════════
  //  SHEET 1: รายการ
  // ════════════════════════════════════════════════════════════
  {
    const rows = activeTxs.map(tx => {
      const accCol = tx.type === 'transfer'
        ? `${accMap.get(tx.fromAccountId)?.name ?? '?'} → ${accMap.get(tx.toAccountId)?.name ?? '?'}`
        : (accMap.get(tx.accountId)?.name ?? '—');
      const cat = tx.type === 'transfer' ? '—' : (catMap.get(tx.categoryId)?.name ?? '—');
      return {
        'วันที่':       formatDate(tx.date),
        'ประเภท':       TYPE_LABEL[tx.type] ?? tx.type,
        'บัญชี':        accCol,
        'หมวดหมู่':     cat,
        'จำนวน (฿)':   THB(tx.amountMinor),
        'โน้ต':         tx.note ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = colWidths(18, 10, 26, 18, 14, 30);
    XLSX.utils.book_append_sheet(wb, ws, 'รายการ');
  }

  // ════════════════════════════════════════════════════════════
  //  SHEET 2: สรุปรายเดือน
  // ════════════════════════════════════════════════════════════
  {
    // Aggregate by month
    const monthMap = new Map(); // YYYY-MM → { income, expense, txCount }
    for (const tx of activeTxs) {
      const m = tx.date?.slice(0, 7);
      if (!m) continue;
      if (!monthMap.has(m)) monthMap.set(m, { income: 0, expense: 0, txCount: 0 });
      const e = monthMap.get(m);
      if (tx.type === 'income')  e.income  += tx.amountMinor;
      if (tx.type === 'expense') e.expense += tx.amountMinor;
      e.txCount++;
    }

    const sortedMonths = [...monthMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    const rows = sortedMonths.map(([month, { income, expense, txCount }]) => {
      const net = income - expense;
      const savingRate = income > 0 ? Math.round((net / income) * 100) : 0;
      return {
        'เดือน':          formatMonth(month),
        'รายรับ (฿)':     THB(income),
        'รายจ่าย (฿)':    THB(expense),
        'คงเหลือ (฿)':    THB(net),
        'อัตราออม (%)':   savingRate,
        'จำนวนรายการ':    txCount,
      };
    });

    if (rows.length > 0) {
      const totInc  = sortedMonths.reduce((s, [, e]) => s + e.income,  0);
      const totExp  = sortedMonths.reduce((s, [, e]) => s + e.expense, 0);
      const totTx   = sortedMonths.reduce((s, [, e]) => s + e.txCount, 0);
      const totNet  = totInc - totExp;
      rows.push({
        'เดือน':          '── รวมทั้งหมด ──',
        'รายรับ (฿)':     THB(totInc),
        'รายจ่าย (฿)':    THB(totExp),
        'คงเหลือ (฿)':    THB(totNet),
        'อัตราออม (%)':   totInc > 0 ? Math.round((totNet / totInc) * 100) : 0,
        'จำนวนรายการ':    totTx,
      });
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = colWidths(22, 16, 16, 16, 16, 14);
    XLSX.utils.book_append_sheet(wb, ws, 'สรุปรายเดือน');
  }

  // ════════════════════════════════════════════════════════════
  //  SHEET 3: วิเคราะห์หมวดรายจ่าย  (pivot: month × category)
  // ════════════════════════════════════════════════════════════
  {
    // Collect expense cats that actually appear
    const catTotals = new Map(); // catId → { cat, byMonth: Map<YYYY-MM, minor> }
    const monthsSet = new Set();

    for (const tx of activeTxs) {
      if (tx.type !== 'expense') continue;
      const m = tx.date?.slice(0, 7);
      if (!m) continue;
      monthsSet.add(m);

      const cat = catMap.get(tx.categoryId);
      if (!cat) continue;

      if (!catTotals.has(tx.categoryId)) {
        catTotals.set(tx.categoryId, { cat, byMonth: new Map() });
      }
      const e = catTotals.get(tx.categoryId);
      e.byMonth.set(m, (e.byMonth.get(m) ?? 0) + tx.amountMinor);
    }

    const sortedCats  = [...catTotals.values()].sort((a, b) => {
      const ta = [...a.byMonth.values()].reduce((s, v) => s + v, 0);
      const tb = [...b.byMonth.values()].reduce((s, v) => s + v, 0);
      return tb - ta;
    });
    const sortedMs = [...monthsSet].sort((a, b) => b.localeCompare(a));

    // Header row
    const header = ['เดือน', ...sortedCats.map(e => `${e.cat.icon ?? ''} ${e.cat.name}`.trim()), 'รวม (฿)'];
    const dataRows = sortedMs.map(m => {
      let rowTotal = 0;
      const cells = sortedCats.map(e => {
        const v = THB(e.byMonth.get(m) ?? 0);
        rowTotal += v;
        return v;
      });
      return [formatMonthShort(m), ...cells, parseFloat(rowTotal.toFixed(2))];
    });

    // Total row
    const totRow = ['── รวมทุกเดือน ──', ...sortedCats.map(e => {
      return parseFloat(THB([...e.byMonth.values()].reduce((s, v) => s + v, 0)).toFixed(2));
    })];
    const grandTotal = totRow.slice(1).reduce((s, v) => s + v, 0);
    totRow.push(parseFloat(grandTotal.toFixed(2)));

    const aoa = [header, ...dataRows, totRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 18 }, ...sortedCats.map(() => ({ wch: 16 })), { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'วิเคราะห์หมวด');
  }

  // ════════════════════════════════════════════════════════════
  //  SHEET 4: งบประมาณ  (budget vs actual, grouped by month)
  // ════════════════════════════════════════════════════════════
  {
    // Separate monthly budgets from templates
    const monthlyBudgets = budgets.filter(b => b.month != null && !b.deletedAt);
    const templates      = budgets.filter(b => b.month == null && !b.deletedAt);

    // Group monthly budgets by month
    const budgetsByMonth = new Map();
    for (const b of monthlyBudgets) {
      if (!budgetsByMonth.has(b.month)) budgetsByMonth.set(b.month, []);
      budgetsByMonth.get(b.month).push(b);
    }

    // Compute expense spend by month × category
    const spendMap = new Map(); // `${month}|${catId}` → minor
    for (const tx of activeTxs) {
      if (tx.type !== 'expense') continue;
      const m = tx.date?.slice(0, 7);
      if (!m) continue;
      const key = `${m}|${tx.categoryId}`;
      spendMap.set(key, (spendMap.get(key) ?? 0) + tx.amountMinor);
    }

    const sortedBudgetMonths = [...budgetsByMonth.keys()].sort((a, b) => b.localeCompare(a));

    // Build AoA for the sheet
    const aoa = [];
    const COL_HEADER = ['หมวดหมู่', 'งบตั้งไว้ (฿)', 'ใช้จริง (฿)', 'คงเหลือ (฿)', 'ใช้ไป (%)', 'สถานะ'];

    for (const month of sortedBudgetMonths) {
      const bList = budgetsByMonth.get(month);

      // Add categories from templates that are not overridden in this month
      const budgetedCatIds = new Set(bList.map(b => b.categoryId));
      const templateItems  = templates
        .filter(t => !budgetedCatIds.has(t.categoryId))
        .map(t => ({ ...t, isTemplate: true }));

      const allItems = [
        ...bList.map(b => ({ ...b, isTemplate: false })),
        ...templateItems,
      ];

      // Month heading
      aoa.push([`── ${formatMonth(month)} ──`]);
      aoa.push(COL_HEADER);

      let monthBudgetTotal = 0;
      let monthSpentTotal  = 0;

      for (const item of allItems) {
        const cat     = catMap.get(item.categoryId);
        const catName = `${cat?.icon ?? ''} ${cat?.name ?? 'ไม่ระบุ'}`.trim();
        const spent   = spendMap.get(`${month}|${item.categoryId}`) ?? 0;
        const limit   = item.limitMinor;
        const remain  = limit - spent;
        const pct     = PCT(spent, limit);
        const status  = spent > limit ? 'เกินงบ' : pct >= 80 ? 'ใกล้เกิน' : 'ปกติ';
        const label   = item.isTemplate ? `${catName} (ทุกเดือน)` : catName;

        monthBudgetTotal += limit;
        monthSpentTotal  += spent;

        aoa.push([label, THB(limit), THB(spent), THB(remain), pct, status]);
      }

      // Month total row
      const monthRemain = monthBudgetTotal - monthSpentTotal;
      const monthPct    = PCT(monthSpentTotal, monthBudgetTotal);
      aoa.push([
        'รวม',
        THB(monthBudgetTotal),
        THB(monthSpentTotal),
        THB(monthRemain),
        monthPct,
        '',
      ]);

      aoa.push([]); // blank separator
    }

    // Templates section (if any)
    if (templates.length > 0) {
      aoa.push(['── งบทุกเดือน (Template) ──']);
      aoa.push(['หมวดหมู่', 'งบตั้งไว้ (฿)']);
      for (const t of templates) {
        const cat = catMap.get(t.categoryId);
        aoa.push([
          `${cat?.icon ?? ''} ${cat?.name ?? 'ไม่ระบุ'}`.trim(),
          THB(t.limitMinor),
        ]);
      }
      aoa.push([]);
    }

    if (aoa.length === 0) aoa.push(['ยังไม่มีการตั้งงบประมาณ']);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = colWidths(32, 16, 16, 16, 12, 10);
    XLSX.utils.book_append_sheet(wb, ws, 'งบประมาณ');
  }

  // ════════════════════════════════════════════════════════════
  //  SHEET 5: บัญชี  (all accounts with computed balances)
  // ════════════════════════════════════════════════════════════
  {
    // Compute balance for every account
    const balMap = new Map(); // id → balance minor
    for (const acc of accounts) {
      if (acc.deletedAt) continue;
      balMap.set(acc.id, acc.initialBalanceMinor ?? 0);
    }
    for (const tx of activeTxs) {
      if (tx.type === 'income') {
        if (balMap.has(tx.accountId)) balMap.set(tx.accountId, balMap.get(tx.accountId) + tx.amountMinor);
      } else if (tx.type === 'expense') {
        if (balMap.has(tx.accountId)) balMap.set(tx.accountId, balMap.get(tx.accountId) - tx.amountMinor);
      } else if (tx.type === 'transfer') {
        if (balMap.has(tx.fromAccountId)) balMap.set(tx.fromAccountId, balMap.get(tx.fromAccountId) - tx.amountMinor);
        if (balMap.has(tx.toAccountId))   balMap.set(tx.toAccountId,   balMap.get(tx.toAccountId)   + tx.amountMinor);
      }
    }

    const active   = accounts.filter(a => !a.deletedAt && !a.archived && !a.hidden);
    const hidden   = accounts.filter(a => !a.deletedAt && !a.archived &&  a.hidden);
    const archived = accounts.filter(a => !a.deletedAt &&  a.archived);

    const aoa = [];

    const accountRow = acc => {
      const bal = balMap.get(acc.id) ?? 0;
      return [
        `${acc.icon ?? ''} ${acc.name}`.trim(),
        THB(acc.initialBalanceMinor ?? 0),
        THB(bal),
      ];
    };

    const COL_H = ['ชื่อบัญชี', 'ยอดเริ่มต้น (฿)', 'ยอดปัจจุบัน (฿)'];

    // Active
    aoa.push(['── บัญชีใช้งาน ──']);
    aoa.push(COL_H);
    active.forEach(a => aoa.push(accountRow(a)));
    if (active.length > 0) {
      const total = active.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0);
      aoa.push(['รวม', '', THB(total)]);
    }
    aoa.push([]);

    // Hidden
    if (hidden.length > 0) {
      aoa.push(['── บัญชีซ่อน (ไม่แสดงใน Dashboard) ──']);
      aoa.push(COL_H);
      hidden.forEach(a => aoa.push(accountRow(a)));
      const total = hidden.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0);
      aoa.push(['รวม', '', THB(total)]);
      aoa.push([]);
    }

    // Archived
    if (archived.length > 0) {
      aoa.push(['── บัญชีที่จัดเก็บ ──']);
      aoa.push(COL_H);
      archived.forEach(a => aoa.push(accountRow(a)));
      const total = archived.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0);
      aoa.push(['รวม', '', THB(total)]);
      aoa.push([]);
    }

    // Grand total (all non-archived)
    const allActive = [...active, ...hidden];
    if (allActive.length > 0) {
      const grand = allActive.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0);
      aoa.push(['── ยอดรวมทุกบัญชีที่ใช้งาน ──', '', THB(grand)]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = colWidths(30, 20, 20);
    XLSX.utils.book_append_sheet(wb, ws, 'บัญชี');
  }

  // ── Download ───────────────────────────────────────────────
  XLSX.writeFile(wb, `${filename}.xlsx`);
}
