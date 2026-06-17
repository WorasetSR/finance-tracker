// ─────────────────────────────────────────────────────────────
//  pages/budget.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonth } from '../format.js';
import { currentMonth } from '../schema.js';

export async function initBudget(container, store, { showToast }) {
  let month = currentMonth();

  async function render() {
    const [budgets, txs, categories] = await Promise.all([
      store.getBudgets(month),
      store.getTransactions({ month, type: 'expense' }),
      store.getCategories('expense'),
    ]);

    // Spending per category this month
    const spendMap = {};
    for (const tx of txs) {
      spendMap[tx.categoryId] = (spendMap[tx.categoryId] || 0) + tx.amountMinor;
    }

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    // Budgeted categories
    const budgetItems = budgets.map(b => {
      const spent   = spendMap[b.categoryId] || 0;
      const pct     = b.limitMinor > 0 ? Math.round((spent / b.limitMinor) * 100) : 0;
      const remaining = b.limitMinor - spent;
      const cat     = catMap[b.categoryId];
      const over    = spent > b.limitMinor;
      const near    = !over && pct >= 80;
      return { b, cat, spent, pct, remaining, over, near };
    });

    // Unbudgeted categories that have spending
    const budgetedCatIds = new Set(budgets.map(b => b.categoryId));
    const unbudgeted = Object.entries(spendMap)
      .filter(([catId]) => !budgetedCatIds.has(catId))
      .map(([catId, spent]) => ({ cat: catMap[catId], spent }))
      .filter(e => e.cat);

    const totalBudget = budgets.reduce((s, b) => s + b.limitMinor, 0);
    const totalSpent  = budgets.reduce((s, b) => s + (spendMap[b.categoryId] || 0), 0);
    const totalPct    = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${formatMonth(month)}</h1>
        <div class="header-actions">
          <button class="icon-btn" id="prev-month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="icon-btn" id="next-month">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button class="btn-primary" id="btn-add-budget">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            ตั้งงบ
          </button>
        </div>
      </div>

      <div class="page-body">
        ${totalBudget > 0 ? `
          <!-- Overall progress -->
          <div class="card budget-overview">
            <div class="budget-overview-header">
              <div>
                <div class="stat-label">ใช้ไปแล้ว</div>
                <div class="budget-big-num mono ${totalSpent > totalBudget ? 'expense' : ''}">${formatTHB(totalSpent)}</div>
              </div>
              <div style="text-align:right">
                <div class="stat-label">งบรวม</div>
                <div class="budget-big-num mono">${formatTHB(totalBudget)}</div>
              </div>
            </div>
            <div class="progress">
              <div class="progress-bar ${totalSpent > totalBudget ? 'over' : ''}" style="width:${Math.min(totalPct, 100)}%"></div>
            </div>
            <div class="progress-labels">
              <span class="${totalSpent > totalBudget ? 'expense' : 'text-secondary'}">${totalPct}%</span>
              <span class="text-secondary">เหลือ ${formatTHB(Math.max(0, totalBudget - totalSpent))}</span>
            </div>
          </div>
        ` : ''}

        <!-- Budgeted categories -->
        ${budgetItems.length > 0 ? `
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">งบประมาณ</h2>
            </div>
            <div class="budget-list">
              ${budgetItems.map(({ b, cat, spent, pct, remaining, over, near }) => `
                <div class="budget-row" data-budget-id="${b.id}">
                  <div class="budget-row-header">
                    <div class="budget-cat">
                      <span class="budget-icon">${cat?.icon || '📦'}</span>
                      <span class="budget-name">${cat?.name || 'ไม่ระบุ'}</span>
                      ${over ? '<span class="badge badge-danger">เกินงบ</span>' : near ? '<span class="badge badge-warning">ใกล้เกิน</span>' : ''}
                    </div>
                    <div class="budget-amounts">
                      <span class="mono ${over ? 'expense' : ''}">${formatTHB(spent)}</span>
                      <span class="text-muted"> / ${formatTHB(b.limitMinor)}</span>
                    </div>
                  </div>
                  <div class="progress">
                    <div class="progress-bar ${over ? 'over' : near ? 'warning' : ''}" style="width:${Math.min(pct, 100)}%"></div>
                  </div>
                  <div class="progress-labels">
                    <span class="${over ? 'expense' : near ? 'warning' : 'text-secondary'}">${pct}%</span>
                    <span class="text-secondary">${over ? 'เกิน ' + formatTHB(Math.abs(remaining)) : 'เหลือ ' + formatTHB(remaining)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="color:var(--text-muted)"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            <p>ยังไม่ได้ตั้งงบประมาณ</p>
            <button class="btn-primary" id="btn-add-budget-empty">ตั้งงบประมาณแรก</button>
          </div>
        `}

        <!-- Unbudgeted spending -->
        ${unbudgeted.length > 0 ? `
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">ใช้จ่ายโดยไม่ตั้งงบ</h2>
            </div>
            <div class="budget-list">
              ${unbudgeted.map(({ cat, spent }) => `
                <div class="budget-row unbudgeted">
                  <div class="budget-row-header">
                    <div class="budget-cat">
                      <span class="budget-icon">${cat?.icon || '📦'}</span>
                      <span class="budget-name">${cat?.name || 'ไม่ระบุ'}</span>
                    </div>
                    <span class="mono expense">${formatTHB(spent)}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Copy last month -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">เครื่องมือ</h2>
          </div>
          <button class="btn-ghost" id="btn-copy-last-month">คัดลอกงบจากเดือนที่แล้ว</button>
        </div>
      </div>
    `;

    // Bind events
    document.getElementById('prev-month')?.addEventListener('click', () => { month = offsetMonth(month, -1); render(); });
    document.getElementById('next-month')?.addEventListener('click', () => { month = offsetMonth(month, 1); render(); });

    document.getElementById('btn-add-budget')?.addEventListener('click', () => openBudgetModal(null, month));
    document.getElementById('btn-add-budget-empty')?.addEventListener('click', () => openBudgetModal(null, month));

    container.querySelectorAll('.budget-row[data-budget-id]').forEach(row => {
      row.addEventListener('click', () => openBudgetModal(row.dataset.budgetId));
    });

    document.getElementById('btn-copy-last-month')?.addEventListener('click', async () => {
      const lastMonth = offsetMonth(month, -1);
      const lastBudgets = await store.getBudgets(lastMonth);
      if (lastBudgets.length === 0) { showToast('ไม่มีงบของเดือนที่แล้ว', 'error'); return; }
      const existingCatIds = new Set(budgets.map(b => b.categoryId));
      let count = 0;
      for (const lb of lastBudgets) {
        if (existingCatIds.has(lb.categoryId)) continue;
        const { makeBudget } = await import('../schema.js');
        await store.put('budgets', makeBudget({ month, categoryId: lb.categoryId, limitMinor: lb.limitMinor }));
        count++;
      }
      if (count > 0) { showToast(`คัดลอก ${count} หมวดสำเร็จ`); render(); }
      else showToast('มีงบครบทุกหมวดแล้ว');
    });
  }

  await render();
}

function offsetMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function openBudgetModal(id, month) {
  window.openBudgetModal?.(id, month);
}
