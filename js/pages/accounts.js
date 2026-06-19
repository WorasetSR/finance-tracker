// ─────────────────────────────────────────────────────────────
//  pages/accounts.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB } from '../format.js';

const ORDER_KEY = 'ft_account_order';

function getAccountOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch { return []; }
}
function saveAccountOrder(ids) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}
function sortByOrder(accounts) {
  const order = getAccountOrder();
  if (!order.length) return accounts;
  return [...accounts].sort((a, b) => {
    const ia = order.indexOf(a.id);
    const ib = order.indexOf(b.id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export async function initAccounts(container, store, { showToast }) {
  async function render() {
    const [activeAccounts, archivedAccounts, categories] = await Promise.all([
      store.getAccounts(),
      store.getArchivedAccounts(),
      store.getCategories(),
    ]);

    const balancePromises = activeAccounts.map(a =>
      store.computeBalance(a.id).then(b => ({ ...a, balance: b }))
    );
    const accountsWithBalance = await Promise.all(balancePromises);
    const sortedAccounts = sortByOrder(accountsWithBalance);

    // Ensure order tracks new accounts
    const storedOrder = getAccountOrder();
    const newIds = sortedAccounts.map(a => a.id).filter(id => !storedOrder.includes(id));
    if (newIds.length) saveAccountOrder([...storedOrder, ...newIds]);

    const totalBalance = sortedAccounts.reduce((s, a) => s + a.balance, 0);

    const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
    const incomeCats  = categories.filter(c => c.type === 'income'  || c.type === 'both');

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

          ${sortedAccounts.length > 0 ? `
            <!-- Total bar -->
            <div class="accounts-total-bar">
              <span class="accounts-total-label">ยอดรวมทั้งหมด</span>
              <span class="accounts-total-value ${totalBalance < 0 ? 'expense' : ''}">${formatTHB(totalBalance)}</span>
            </div>

            <!-- Account rows (draggable) -->
            <div class="account-table" id="accounts-list">
              ${sortedAccounts.map(a => `
                <div class="account-manage-row" draggable="true" data-account-id="${a.id}">
                  <span class="drag-handle" title="ลาก เพื่อจัดเรียง">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4.5" cy="2.5" r="1"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="9.5" r="1"/><circle cx="7.5" cy="2.5" r="1"/><circle cx="7.5" cy="6" r="1"/><circle cx="7.5" cy="9.5" r="1"/></svg>
                  </span>
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

            ${archivedAccounts.length > 0 ? `
              <div class="archive-section" id="archive-section">
                <button class="archive-toggle" id="archive-toggle">
                  <span class="archive-toggle-arrow">▶</span>
                  บัญชีที่จัดเก็บ (${archivedAccounts.length})
                </button>
                <div class="archived-list" id="archived-list">
                  ${archivedAccounts.map(a => `
                    <div class="account-manage-row archived-row" data-account-id="${a.id}">
                      <span class="account-icon">${a.icon || '💳'}</span>
                      <div class="account-info">
                        <span class="account-name">${a.name}</span>
                        <span class="badge badge-neutral">จัดเก็บ</span>
                      </div>
                      <button class="restore-btn" data-account-id="${a.id}">กู้คืน</button>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          ` : `
            <div class="empty-state-sm"><p>ยังไม่มีบัญชี</p></div>
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

    // Add account
    document.getElementById('btn-add-account')?.addEventListener('click', () => {
      window.openAccountModal?.();
    });

    // Add categories
    document.getElementById('btn-add-expense-cat')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });
    document.getElementById('btn-add-income-cat')?.addEventListener('click', () => {
      window.openCategoryModal?.();
    });

    // Edit account buttons
    container.querySelectorAll('.edit-btn[data-account-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.openAccountModal?.(btn.dataset.accountId);
      });
    });

    // Category chips
    container.querySelectorAll('.cat-chip[data-cat-id]').forEach(chip => {
      chip.addEventListener('click', () => window.openCategoryModal?.(chip.dataset.catId));
    });

    // Archive section toggle
    const archiveToggle = document.getElementById('archive-toggle');
    const archivedList  = document.getElementById('archived-list');
    if (archiveToggle && archivedList) {
      archiveToggle.addEventListener('click', () => {
        const isOpen = archivedList.classList.toggle('visible');
        archiveToggle.classList.toggle('open', isOpen);
      });
    }

    // Restore buttons
    container.querySelectorAll('.restore-btn[data-account-id]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const acc = await store.get('accounts', btn.dataset.accountId);
        if (!acc) return;
        Object.assign(acc, { archived: false, updatedAt: new Date().toISOString(), synced: false });
        await store.put('accounts', acc);
        showToast('กู้คืนบัญชีแล้ว');
        render();
      });
    });

    // Drag-to-reorder active accounts
    bindDragReorder(
      document.getElementById('accounts-list'),
      '.account-manage-row[data-account-id]',
      'data-account-id',
      sortedAccounts.map(a => a.id)
    );
  }

  await render();

  return undefined;
}

// ── Drag-to-reorder ───────────────────────────────────────────

function bindDragReorder(list, rowSelector, dataAttr, initialOrder) {
  if (!list) return;
  let dragSrcId = null;
  let currentOrder = [...initialOrder];

  list.querySelectorAll(rowSelector).forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = row.getAttribute(dataAttr);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => row.classList.add('dragging'), 0);
    });
    row.addEventListener('dragend', () => row.classList.remove('dragging'));
    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    });
    row.addEventListener('dragleave', e => {
      if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over');
    });
    row.addEventListener('drop', e => {
      e.preventDefault();
      row.classList.remove('drag-over');
      const dstId = row.getAttribute(dataAttr);
      if (!dragSrcId || dragSrcId === dstId) return;
      const srcIdx = currentOrder.indexOf(dragSrcId);
      const dstIdx = currentOrder.indexOf(dstId);
      if (srcIdx === -1 || dstIdx === -1) return;
      currentOrder.splice(srcIdx, 1);
      currentOrder.splice(dstIdx, 0, dragSrcId);
      saveAccountOrder(currentOrder);
      const srcEl = list.querySelector(`[${dataAttr}="${dragSrcId}"]`);
      const dstEl = list.querySelector(`[${dataAttr}="${dstId}"]`);
      if (srcEl && dstEl) {
        if (srcIdx < dstIdx) dstEl.after(srcEl);
        else dstEl.before(srcEl);
      }
    });
  });
}
