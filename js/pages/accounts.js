// ─────────────────────────────────────────────────────────────
//  pages/accounts.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB } from '../format.js';

export async function initAccounts(container, store, { showToast }) {
  async function render() {
    const [accounts, categories] = await Promise.all([
      store.getAll('accounts'),
      store.getAll('categories'),
    ]);

    const balancePromises = accounts.filter(a => !a.deletedAt).map(a =>
      store.computeBalance(a.id).then(b => ({ ...a, balance: b }))
    );
    const accountsWithBalance = await Promise.all(balancePromises);

    const expenseCats = categories.filter(c => !c.deletedAt && (c.type === 'expense' || c.type === 'both'));
    const incomeCats  = categories.filter(c => !c.deletedAt && (c.type === 'income'  || c.type === 'both'));
    const activeCats  = categories.filter(c => !c.deletedAt);

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">บัญชี & หมวดหมู่</h1>
      </div>

      <div class="page-body">
        <!-- Accounts -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">บัญชี</h2>
            <button class="btn-primary btn-sm" id="btn-add-account">+ เพิ่มบัญชี</button>
          </div>

          ${accountsWithBalance.length > 0 ? `
            <div class="account-table">
              ${accountsWithBalance.map(a => `
                <div class="account-manage-row" data-account-id="${a.id}">
                  <span class="account-icon">${a.icon || '💳'}</span>
                  <div class="account-info">
                    <span class="account-name">${a.name}</span>
                    ${a.hidden ? '<span class="badge badge-neutral">ซ่อน</span>' : ''}
                  </div>
                  <span class="account-balance mono ${a.balance < 0 ? 'expense' : ''}">${formatTHB(a.balance)}</span>
                  <button class="icon-btn edit-btn" data-account-id="${a.id}" title="แก้ไข">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                </div>
              `).join('')}
            </div>
          ` : `
            <div class="empty-state-sm">
              <p>ยังไม่มีบัญชี</p>
            </div>
          `}
        </div>

        <!-- Expense categories -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">หมวดรายจ่าย</h2>
            <button class="btn-primary btn-sm" id="btn-add-expense-cat">+ เพิ่มหมวด</button>
          </div>
          <div class="cat-grid">
            ${expenseCats.map(c => `
              <div class="cat-chip" data-cat-id="${c.id}">
                <span>${c.icon || '📦'}</span>
                <span>${c.name}</span>
              </div>
            `).join('') || '<div class="empty-state-sm">ยังไม่มีหมวดรายจ่าย</div>'}
          </div>
        </div>

        <!-- Income categories -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">หมวดรายรับ</h2>
            <button class="btn-primary btn-sm" id="btn-add-income-cat">+ เพิ่มหมวด</button>
          </div>
          <div class="cat-grid">
            ${incomeCats.map(c => `
              <div class="cat-chip cat-chip-income" data-cat-id="${c.id}">
                <span>${c.icon || '💡'}</span>
                <span>${c.name}</span>
              </div>
            `).join('') || '<div class="empty-state-sm">ยังไม่มีหมวดรายรับ</div>'}
          </div>
        </div>
      </div>
    `;

    // Bind events
    document.getElementById('btn-add-account')?.addEventListener('click', () => {
      window.openAccountModal?.();
    });

    document.getElementById('btn-add-expense-cat')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });

    document.getElementById('btn-add-income-cat')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });

    container.querySelectorAll('.edit-btn[data-account-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.openAccountModal?.(btn.dataset.accountId);
      });
    });

    container.querySelectorAll('.cat-chip[data-cat-id]').forEach(chip => {
      chip.addEventListener('click', () => window.openCategoryModal?.(chip.dataset.catId));
    });
  }

  await render();

  return undefined;
}
