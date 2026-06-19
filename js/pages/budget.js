// ─────────────────────────────────────────────────────────────
//  pages/budget.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonth } from '../format.js';
import { currentMonth } from '../schema.js';

export async function initBudget(container, store, { showToast }) {
  let month = currentMonth();

  async function render() {
    const [budgets, templates, txs, categories] = await Promise.all([
      store.getBudgets(month),
      store.getBudgetTemplates(),
      store.getTransactions({ month, type: 'expense' }),
      store.getCategories('expense'),
    ]);

    const spendMap = {};
    for (const tx of txs) {
      spendMap[tx.categoryId] = (spendMap[tx.categoryId] || 0) + tx.amountMinor;
    }

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));

    // Monthly budgets
    const budgetItems = budgets.map(b => {
      const spent     = spendMap[b.categoryId] || 0;
      const pct       = b.limitMinor > 0 ? Math.round((spent / b.limitMinor) * 100) : 0;
      const remaining = b.limitMinor - spent;
      const cat       = catMap[b.categoryId];
      const over      = spent > b.limitMinor;
      const near      = !over && pct >= 80;
      return { b, cat, spent, pct, remaining, over, near, isTemplate: false };
    });

    // Template items that have no monthly override for this month
    const budgetedCatIds = new Set(budgets.map(b => b.categoryId));
    const templateItems = templates
      .filter(t => !budgetedCatIds.has(t.categoryId))
      .map(t => {
        const spent     = spendMap[t.categoryId] || 0;
        const pct       = t.limitMinor > 0 ? Math.round((spent / t.limitMinor) * 100) : 0;
        const remaining = t.limitMinor - spent;
        const cat       = catMap[t.categoryId];
        const over      = spent > t.limitMinor;
        const near      = !over && pct >= 80;
        return { b: t, cat, spent, pct, remaining, over, near, isTemplate: true };
      });

    const allItems = [...budgetItems, ...templateItems];

    // Unbudgeted categories with spending (no monthly budget AND no template)
    const allBudgetedCatIds = new Set(allItems.map(i => i.b.categoryId));
    const unbudgeted = Object.entries(spendMap)
      .filter(([catId]) => !allBudgetedCatIds.has(catId))
      .map(([catId, spent]) => ({ cat: catMap[catId], spent }))
      .filter(e => e.cat);

    const totalBudget = allItems.reduce((s, i) => s + i.b.limitMinor, 0);
    const totalSpent  = allItems.reduce((s, i) => s + i.spent, 0);
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

        <!-- Budgeted categories (monthly + templates) -->
        ${allItems.length > 0 ? `
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">งบประมาณ</h2>
            </div>
            <div class="budget-list">
              ${allItems.map(({ b, cat, spent, pct, remaining, over, near, isTemplate }) => `
                <div class="budget-row ${isTemplate ? 'is-template' : ''}" data-budget-id="${b.id}" data-is-template="${isTemplate}">
                  <div class="budget-row-header">
                    <div class="budget-cat">
                      <span class="budget-icon">${cat?.icon || '📦'}</span>
                      <span class="budget-name">${cat?.name || 'ไม่ระบุ'}</span>
                      ${isTemplate ? '<span class="template-badge">ทุกเดือน</span>' : ''}
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

        <!-- Templates section -->
        ${templates.length > 0 ? `
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">งบทุกเดือน</h2>
              <span class="card-subtitle">ใช้ทุกเดือนเมื่อไม่มีงบเฉพาะ</span>
            </div>
            <div class="budget-list">
              ${templates.map(t => {
                const cat = catMap[t.categoryId];
                return `
                  <div class="budget-row" data-budget-id="${t.id}" data-is-template="true">
                    <div class="budget-row-header">
                      <div class="budget-cat">
                        <span class="budget-icon">${cat?.icon || '📦'}</span>
                        <span class="budget-name">${cat?.name || 'ไม่ระบุ'}</span>
                        <span class="template-badge">ทุกเดือน</span>
                      </div>
                      <span class="mono">${formatTHB(t.limitMinor)}</span>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Tools -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">เครื่องมือ</h2>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-ghost" id="btn-copy-last-month">คัดลอกงบจากเดือนที่แล้ว</button>
            ${templates.length > 0 ? `<button class="btn-ghost" id="btn-apply-templates">ใช้ Template เดือนนี้</button>` : ''}
          </div>
        </div>
      </div>
    `;

    // Events
    document.getElementById('prev-month')?.addEventListener('click', () => { month = offsetMonth(month, -1); render(); });
    document.getElementById('next-month')?.addEventListener('click', () => { month = offsetMonth(month, 1); render(); });

    document.getElementById('btn-add-budget')?.addEventListener('click', () => openBudgetModal(null, month));
    document.getElementById('btn-add-budget-empty')?.addEventListener('click', () => openBudgetModal(null, month));

    // Click budget row — template rows edit template, monthly rows edit monthly
    container.querySelectorAll('.budget-row[data-budget-id]').forEach(row => {
      row.addEventListener('click', () => {
        const isTemplate = row.dataset.isTemplate === 'true';
        if (isTemplate) {
          openBudgetModal(row.dataset.budgetId);
        } else {
          openBudgetModal(row.dataset.budgetId);
        }
      });
    });

    // Copy from last month
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

    // Apply templates to this month
    document.getElementById('btn-apply-templates')?.addEventListener('click', async () => {
      const existingCatIds = new Set(budgets.map(b => b.categoryId));
      let count = 0;
      for (const t of templates) {
        if (existingCatIds.has(t.categoryId)) continue;
        const { makeBudget } = await import('../schema.js');
        await store.put('budgets', makeBudget({ month, categoryId: t.categoryId, limitMinor: t.limitMinor }));
        count++;
      }
      if (count > 0) { showToast(`ใช้ Template ${count} หมวดสำเร็จ`); render(); }
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
