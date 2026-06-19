// ─────────────────────────────────────────────────────────────
//  export.js — styled Excel export via xlsx-js-style
// ─────────────────────────────────────────────────────────────

import { formatDate, formatMonth, formatMonthShort } from './format.js';

// ── Color palette ─────────────────────────────────────────────

const TEAL    = '0D9488';
const TEAL_DK = '134E4A';
const TEAL_MD = 'CCFBF1';
const WHITE   = 'FFFFFF';
const ROW_ALT = 'F0FDFB';
const GRN_B   = 'DCFCE7'; const GRN_F = '166534';
const RED_B   = 'FEE2E2'; const RED_F = '991B1B';
const AMB_B   = 'FEF3C7'; const AMB_F = '92400E';
const BLU_B   = 'DBEAFE'; const BLU_F = '1E40AF';

// ── Borders ───────────────────────────────────────────────────

const bt = { style: 'thin',   color: { rgb: 'C7F3EE' } };
const bm = { style: 'medium', color: { rgb: TEAL } };
const BD = { top: bt, bottom: bt, left: bt, right: bt };

// ── Style factories ───────────────────────────────────────────

const titleSt = () => ({
  font:      { bold: true, color: { rgb: WHITE }, sz: 12 },
  fill:      { patternType: 'solid', fgColor: { rgb: TEAL_DK } },
  alignment: { horizontal: 'center', vertical: 'center' },
});

const hdrSt = (align = 'center') => ({
  font:      { bold: true, color: { rgb: WHITE }, sz: 10 },
  fill:      { patternType: 'solid', fgColor: { rgb: TEAL } },
  alignment: { horizontal: align, vertical: 'center' },
  border:    BD,
});

const secSt = () => ({
  font:      { bold: true, color: { rgb: WHITE }, sz: 10 },
  fill:      { patternType: 'solid', fgColor: { rgb: TEAL_DK } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border:    { top: bm, bottom: bm, left: bt, right: bt },
});

const totSt = (align = 'right') => ({
  font:      { bold: true, color: { rgb: TEAL_DK }, sz: 10 },
  fill:      { patternType: 'solid', fgColor: { rgb: TEAL_MD } },
  alignment: { horizontal: align, vertical: 'center' },
  border:    { top: bm, bottom: bt, left: bt, right: bt },
});

const normSt = (i = 0, align = 'left') => ({
  font:      { sz: 10 },
  fill:      { patternType: 'solid', fgColor: { rgb: i % 2 === 0 ? WHITE : ROW_ALT } },
  alignment: { horizontal: align, vertical: 'center' },
  border:    BD,
});

const clrSt = (bg, fg, align = 'right') => ({
  font:      { bold: true, color: { rgb: fg }, sz: 10 },
  fill:      { patternType: 'solid', fgColor: { rgb: bg } },
  alignment: { horizontal: align, vertical: 'center' },
  border:    BD,
});

const emtSt = () => ({
  fill: { patternType: 'solid', fgColor: { rgb: WHITE } },
});

// ── Cell constructor ──────────────────────────────────────────

function C(v, s, z) {
  const val = (v === null || v === undefined) ? '' : v;
  const t   = typeof val === 'number' ? 'n' : 's';
  const c   = { v: val, t, s };
  if (z) c.z = z;
  return c;
}

const Cn = (v, s) => C(v, s, '#,##0.00');
const Cp = (v, s) => C(v, s, '0"%"');
const mrg = (r1, c1, r2, c2) => ({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

const THB = v => parseFloat((v / 100).toFixed(2));
const PCT = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

function titleRow(text, ncols) {
  return [C(text, titleSt()), ...Array(ncols - 1).fill(C('', titleSt()))];
}

// ── Main export ───────────────────────────────────────────────

export function exportTransactions(
  transactions,
  accounts,
  categories,
  budgets = [],
  filename = 'finance-export'
) {
  if (typeof globalThis.XLSX === 'undefined') { alert('SheetJS ยังไม่ได้โหลด'); return; }
  const XLSX = globalThis.XLSX;

  const accMap   = new Map(accounts.map(a => [a.id, a]));
  const catMap   = new Map(categories.map(c => [c.id, c]));
  const TYPE_LBL = { income: 'รายรับ', expense: 'รายจ่าย', transfer: 'โอน' };

  const activeTxs = transactions
    .filter(t => !t.deletedAt)
    .sort((a, b) => {
      const d = (b.date ?? '').localeCompare(a.date ?? '');
      return d !== 0 ? d : (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
    });

  const wb = XLSX.utils.book_new();

  // ══════════════════════════════════════════════════════════════
  //  Sheet 1 — รายการ
  // ══════════════════════════════════════════════════════════════
  {
    const NC     = 6;
    const aoa    = [titleRow('รายการธุรกรรมทั้งหมด', NC)];
    const merges = [mrg(0, 0, 0, NC - 1)];

    aoa.push([
      C('วันที่',     hdrSt('left')),
      C('ประเภท',     hdrSt('center')),
      C('บัญชี',      hdrSt('left')),
      C('หมวดหมู่',   hdrSt('left')),
      C('จำนวน (฿)', hdrSt('right')),
      C('โน้ต',       hdrSt('left')),
    ]);

    activeTxs.forEach(tx => {
      const [bb, ff] = tx.type === 'income'  ? [GRN_B, GRN_F]
                     : tx.type === 'expense' ? [RED_B, RED_F]
                     :                        [BLU_B, BLU_F];
      const rs = (align = 'left') => ({
        font:      { color: { rgb: ff }, sz: 10 },
        fill:      { patternType: 'solid', fgColor: { rgb: bb } },
        alignment: { horizontal: align, vertical: 'center' },
        border:    BD,
      });
      const acc = tx.type === 'transfer'
        ? `${accMap.get(tx.fromAccountId)?.name ?? '?'} → ${accMap.get(tx.toAccountId)?.name ?? '?'}`
        : (accMap.get(tx.accountId)?.name ?? '—');
      const cat = tx.type === 'transfer' ? '—' : (catMap.get(tx.categoryId)?.name ?? '—');

      aoa.push([
        C(formatDate(tx.date),           rs('left')),
        C(TYPE_LBL[tx.type] ?? tx.type, rs('center')),
        C(acc,                           rs('left')),
        C(cat,                           rs('left')),
        Cn(THB(tx.amountMinor),          rs('right')),
        C(tx.note ?? '',                 rs('left')),
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols']   = [{ wch: 18 }, { wch: 10 }, { wch: 26 }, { wch: 18 }, { wch: 14 }, { wch: 30 }];
    ws['!rows']   = [{ hpt: 26 }, { hpt: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'รายการ');
  }

  // ══════════════════════════════════════════════════════════════
  //  Sheet 2 — สรุปรายเดือน
  // ══════════════════════════════════════════════════════════════
  {
    const NC = 6;
    const monthMap = new Map();
    for (const tx of activeTxs) {
      const m = tx.date?.slice(0, 7);
      if (!m) continue;
      if (!monthMap.has(m)) monthMap.set(m, { income: 0, expense: 0, txCount: 0 });
      const e = monthMap.get(m);
      if (tx.type === 'income')  e.income  += tx.amountMinor;
      if (tx.type === 'expense') e.expense += tx.amountMinor;
      e.txCount++;
    }
    const sorted = [...monthMap.entries()].sort((a, b) => b[0].localeCompare(a[0]));

    const aoa    = [titleRow('สรุปรายรับ – รายจ่าย รายเดือน', NC)];
    const merges = [mrg(0, 0, 0, NC - 1)];

    aoa.push([
      C('เดือน',        hdrSt('left')),
      C('รายรับ (฿)',   hdrSt('right')),
      C('รายจ่าย (฿)',  hdrSt('right')),
      C('คงเหลือ (฿)',  hdrSt('right')),
      C('อัตราออม (%)', hdrSt('right')),
      C('จำนวนรายการ',  hdrSt('right')),
    ]);

    let totInc = 0, totExp = 0, totTx = 0;

    sorted.forEach(([month, { income, expense, txCount }], i) => {
      const net  = income - expense;
      const save = PCT(net, income);
      totInc += income; totExp += expense; totTx += txCount;

      const netSt  = net  >= 0 ? clrSt(GRN_B, GRN_F) : clrSt(RED_B, RED_F);
      const saveSt = save >= 20 ? clrSt(GRN_B, GRN_F)
                   : save >= 0  ? clrSt(AMB_B, AMB_F)
                   :              clrSt(RED_B, RED_F);

      aoa.push([
        C(formatMonth(month),  normSt(i, 'left')),
        Cn(THB(income),        clrSt(GRN_B, GRN_F)),
        Cn(THB(expense),       clrSt(RED_B, RED_F)),
        Cn(THB(net),           netSt),
        Cp(save,               saveSt),
        C(txCount,             normSt(i, 'right')),
      ]);
    });

    const totNet  = totInc - totExp;
    const totSave = PCT(totNet, totInc);
    aoa.push([
      C('รวมทั้งหมด', totSt('left')),
      Cn(THB(totInc), totSt()),
      Cn(THB(totExp), totSt()),
      Cn(THB(totNet), totSt()),
      Cp(totSave,     totSt()),
      C(totTx,        totSt()),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols']   = [{ wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
    ws['!rows']   = [{ hpt: 26 }, { hpt: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'สรุปรายเดือน');
  }

  // ══════════════════════════════════════════════════════════════
  //  Sheet 3 — วิเคราะห์หมวด  (pivot: month × expense category)
  // ══════════════════════════════════════════════════════════════
  {
    const catTotals = new Map();
    const monthsSet = new Set();

    for (const tx of activeTxs) {
      if (tx.type !== 'expense') continue;
      const m = tx.date?.slice(0, 7);
      if (!m) continue;
      monthsSet.add(m);
      const cat = catMap.get(tx.categoryId);
      if (!cat) continue;
      if (!catTotals.has(tx.categoryId))
        catTotals.set(tx.categoryId, { cat, byMonth: new Map() });
      const e = catTotals.get(tx.categoryId);
      e.byMonth.set(m, (e.byMonth.get(m) ?? 0) + tx.amountMinor);
    }

    const sortedCats = [...catTotals.values()].sort((a, b) =>
      [...b.byMonth.values()].reduce((s, v) => s + v, 0) -
      [...a.byMonth.values()].reduce((s, v) => s + v, 0)
    );
    const sortedMs = [...monthsSet].sort((a, b) => b.localeCompare(a));
    const NC = 1 + sortedCats.length + 1;

    const aoa    = [titleRow('วิเคราะห์รายจ่ายตามหมวดหมู่', NC)];
    const merges = [mrg(0, 0, 0, NC - 1)];

    aoa.push([
      C('เดือน', hdrSt('left')),
      ...sortedCats.map(e => C(`${e.cat.icon ?? ''} ${e.cat.name}`.trim(), hdrSt('center'))),
      C('รวม (฿)', hdrSt('right')),
    ]);

    sortedMs.forEach((m, i) => {
      let rowTot = 0;
      const cells = sortedCats.map(e => {
        const v = THB(e.byMonth.get(m) ?? 0);
        rowTot += v;
        return Cn(v > 0 ? v : null, normSt(i, 'right'));
      });
      aoa.push([
        C(formatMonthShort(m),                    normSt(i, 'left')),
        ...cells,
        Cn(parseFloat(rowTot.toFixed(2)),          totSt()),
      ]);
    });

    const catTots = sortedCats.map(e =>
      parseFloat(THB([...e.byMonth.values()].reduce((s, v) => s + v, 0)).toFixed(2))
    );
    aoa.push([
      C('รวมทุกเดือน', totSt('left')),
      ...catTots.map(v => Cn(v, totSt())),
      Cn(parseFloat(catTots.reduce((s, v) => s + v, 0).toFixed(2)), totSt()),
    ]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols']   = [{ wch: 18 }, ...sortedCats.map(() => ({ wch: 15 })), { wch: 16 }];
    ws['!rows']   = [{ hpt: 26 }, { hpt: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, 'วิเคราะห์หมวด');
  }

  // ══════════════════════════════════════════════════════════════
  //  Sheet 4 — งบประมาณ
  // ══════════════════════════════════════════════════════════════
  {
    const NC = 6;
    const monthlyBudgets = budgets.filter(b => b.month != null && !b.deletedAt);
    const templates      = budgets.filter(b => b.month == null && !b.deletedAt);
    const budgetsByMonth = new Map();
    for (const b of monthlyBudgets) {
      if (!budgetsByMonth.has(b.month)) budgetsByMonth.set(b.month, []);
      budgetsByMonth.get(b.month).push(b);
    }
    const spendMap = new Map();
    for (const tx of activeTxs) {
      if (tx.type !== 'expense') continue;
      const m = tx.date?.slice(0, 7);
      if (!m) continue;
      const key = `${m}|${tx.categoryId}`;
      spendMap.set(key, (spendMap.get(key) ?? 0) + tx.amountMinor);
    }

    const sortedBudgetMonths = [...budgetsByMonth.keys()].sort((a, b) => b.localeCompare(a));
    const aoa    = [titleRow('งบประมาณ vs รายจ่ายจริง', NC)];
    const merges = [mrg(0, 0, 0, NC - 1)];
    let curRow   = 1;

    const BHDRS   = ['หมวดหมู่', 'งบตั้งไว้ (฿)', 'ใช้จริง (฿)', 'คงเหลือ (฿)', 'ใช้ไป (%)', 'สถานะ'];
    const BALIGNS = ['left', 'right', 'right', 'right', 'right', 'center'];

    for (const month of sortedBudgetMonths) {
      const bList      = budgetsByMonth.get(month);
      const usedCatIds = new Set(bList.map(b => b.categoryId));
      const allItems   = [
        ...bList.map(b => ({ ...b, isTemplate: false })),
        ...templates.filter(t => !usedCatIds.has(t.categoryId)).map(t => ({ ...t, isTemplate: true })),
      ];

      // Month section header
      aoa.push([C(formatMonth(month), secSt()), ...Array(NC - 1).fill(C('', secSt()))]);
      merges.push(mrg(curRow, 0, curRow, NC - 1));
      curRow++;

      aoa.push(BHDRS.map((h, j) => C(h, hdrSt(BALIGNS[j]))));
      curRow++;

      let mBgt = 0, mSpent = 0;

      allItems.forEach((item, i) => {
        const cat    = catMap.get(item.categoryId);
        const label  = `${cat?.icon ?? ''} ${cat?.name ?? 'ไม่ระบุ'}${item.isTemplate ? ' ✦' : ''}`.trim();
        const spent  = spendMap.get(`${month}|${item.categoryId}`) ?? 0;
        const limit  = item.limitMinor;
        const remain = limit - spent;
        const pct    = PCT(spent, limit);
        const isOver = spent > limit;
        const isWarn = !isOver && pct >= 80;
        const status = isOver ? 'เกินงบ' : isWarn ? 'ใกล้เกิน' : 'ปกติ';

        mBgt += limit; mSpent += spent;

        const remainSt = remain < 0 ? clrSt(RED_B, RED_F) : normSt(i, 'right');
        const pctSt    = isOver ? clrSt(RED_B, RED_F) : isWarn ? clrSt(AMB_B, AMB_F) : normSt(i, 'right');
        const statSt   = isOver ? clrSt(RED_B, RED_F, 'center')
                       : isWarn ? clrSt(AMB_B, AMB_F, 'center')
                       :          clrSt(GRN_B, GRN_F, 'center');

        aoa.push([
          C(label,        normSt(i, 'left')),
          Cn(THB(limit),  normSt(i, 'right')),
          Cn(THB(spent),  normSt(i, 'right')),
          Cn(THB(remain), remainSt),
          Cp(pct,         pctSt),
          C(status,       statSt),
        ]);
        curRow++;
      });

      const remTot = mBgt - mSpent;
      aoa.push([
        C('รวม',              totSt('left')),
        Cn(THB(mBgt),         totSt()),
        Cn(THB(mSpent),       totSt()),
        Cn(THB(remTot),       totSt()),
        Cp(PCT(mSpent, mBgt), totSt()),
        C('',                 totSt()),
      ]);
      curRow++;

      aoa.push(Array(NC).fill(C('', emtSt())));
      curRow++;
    }

    // Templates reference
    if (templates.length > 0) {
      aoa.push([C('งบทุกเดือน (Template)', secSt()), ...Array(NC - 1).fill(C('', secSt()))]);
      merges.push(mrg(curRow, 0, curRow, NC - 1));
      curRow++;
      aoa.push([C('หมวดหมู่', hdrSt('left')), C('งบตั้งไว้ (฿)', hdrSt('right')), ...Array(NC - 2).fill(C('', hdrSt()))]);
      curRow++;
      templates.forEach((t, i) => {
        const cat = catMap.get(t.categoryId);
        aoa.push([
          C(`${cat?.icon ?? ''} ${cat?.name ?? 'ไม่ระบุ'}`.trim(), normSt(i, 'left')),
          Cn(THB(t.limitMinor), normSt(i, 'right')),
          ...Array(NC - 2).fill(C('', normSt(i))),
        ]);
        curRow++;
      });
    }

    if (aoa.length <= 1) aoa.push([C('ยังไม่มีการตั้งงบประมาณ', normSt(0))]);

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols']   = [{ wch: 32 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 12 }];
    ws['!rows']   = [{ hpt: 26 }];
    XLSX.utils.book_append_sheet(wb, ws, 'งบประมาณ');
  }

  // ══════════════════════════════════════════════════════════════
  //  Sheet 5 — บัญชี
  // ══════════════════════════════════════════════════════════════
  {
    const NC = 3;

    const balMap = new Map();
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

    const aoa    = [titleRow('สรุปยอดบัญชีทั้งหมด', NC)];
    const merges = [mrg(0, 0, 0, NC - 1)];
    let curRow   = 1;

    const addSection = (title, accs) => {
      if (!accs.length) return;

      aoa.push([C(title, secSt()), ...Array(NC - 1).fill(C('', secSt()))]);
      merges.push(mrg(curRow, 0, curRow, NC - 1));
      curRow++;

      aoa.push([
        C('ชื่อบัญชี',       hdrSt('left')),
        C('ยอดเริ่มต้น (฿)', hdrSt('right')),
        C('ยอดปัจจุบัน (฿)', hdrSt('right')),
      ]);
      curRow++;

      let secTotal = 0;
      accs.forEach((acc, i) => {
        const bal = balMap.get(acc.id) ?? 0;
        secTotal += bal;
        aoa.push([
          C(`${acc.icon ?? ''} ${acc.name}`.trim(), normSt(i, 'left')),
          Cn(THB(acc.initialBalanceMinor ?? 0),     normSt(i, 'right')),
          Cn(THB(bal), bal < 0 ? clrSt(RED_B, RED_F) : normSt(i, 'right')),
        ]);
        curRow++;
      });

      const secValSt = secTotal < 0
        ? { ...totSt(), font: { bold: true, color: { rgb: RED_F }, sz: 10 } }
        : totSt();
      aoa.push([C('รวม', totSt('left')), C('', totSt()), Cn(THB(secTotal), secValSt)]);
      curRow++;

      aoa.push(Array(NC).fill(C('', emtSt())));
      curRow++;
    };

    addSection('บัญชีใช้งาน', active);
    addSection('บัญชีซ่อน (ไม่แสดงใน Dashboard)', hidden);
    addSection('บัญชีที่จัดเก็บ', archived);

    const allActive = [...active, ...hidden];
    if (allActive.length > 0) {
      const grand = allActive.reduce((s, a) => s + (balMap.get(a.id) ?? 0), 0);
      aoa.push([
        C('ยอดรวมทุกบัญชีที่ใช้งาน', secSt()),
        C('', secSt()),
        Cn(THB(grand), { ...secSt(), alignment: { horizontal: 'right', vertical: 'center' } }),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = merges;
    ws['!cols']   = [{ wch: 30 }, { wch: 20 }, { wch: 20 }];
    ws['!rows']   = [{ hpt: 26 }];
    XLSX.utils.book_append_sheet(wb, ws, 'บัญชี');
  }

  XLSX.writeFile(wb, `${filename}.xlsx`);
}
