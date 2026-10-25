// ─────────────────────────────────────────────────────────────
//  pages/accounts.js — Accounts & Categories Management
//  Finance Tracker v4.0 (Touch Reorder & Zero-Emoji SVG Icons)
// ─────────────────────────────────────────────────────────────

import { formatTHB } from '../format.js';
import { renderIcon } from '../icons.js';

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

    const storedOrder = getAccountOrder();
    const newIds = sortedAccounts.map(a => a.id).filter(id => !storedOrder.includes(id));
    if (newIds.length) saveAccountOrder([...storedOrder, ...newIds]);

    const totalBalance = sortedAccounts.reduce((s, a) => s + a.balance, 0);

    const expenseCats = categories.filter(c => c.type === 'expense' || c.type === 'both');
    const incomeCats  = categories.filter(c => c.type === 'income'  || c.type === 'both');

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">บัญชี & หมวดหมู่</h1>
        <div class="header-actions">
          <button type="button" class="btn-primary btn-sm" id="btn-add-account">
            ${renderIcon('plus', 14)} เพิ่มบัญชี
          </button>
        </div>
      </div>

      <div class="page-body">
        <!-- Accounts Section -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">บัญชีทั้งหมด (${sortedAccounts.length})</h2>
          </div>

          ${sortedAccounts.length > 0 ? `
            <!-- Total balance bar -->
            <div class="accounts-total-bar">
              <span class="accounts-total-label">ยอดรวมทุกบัญชี</span>
              <span class="accounts-total-value ${totalBalance < 0 ? 'expense' : ''}">${formatTHB(totalBalance)}</span>
            </div>

            <!-- Account rows with Drag Handle (desktop) and Touch Reorder Buttons (mobile) -->
            <div class="account-table" id="accounts-list">
              ${sortedAccounts.map((a, idx) => `
                <div class="account-manage-row" draggable="true" data-account-id="${a.id}" data-index="${idx}">
                  <span class="drag-handle" title="ลากเพื่อจัดเรียง (Desktop)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4.5" cy="2.5" r="1"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="9.5" r="1"/><circle cx="7.5" cy="2.5" r="1"/><circle cx="7.5" cy="6" r="1"/><circle cx="7.5" cy="9.5" r="1"/></svg>
                  </span>

                  <!-- Mobile Touch Reorder Buttons (Zero Dead Gesture) -->
                  <div class="touch-reorder-cluster">
                    <button type="button" class="btn-touch-move btn-move-up" data-account-id="${a.id}" ${idx === 0 ? 'disabled' : ''} aria-label="เลื่อนขึ้น">
                      ${renderIcon('chevron-up', 13)}
                    </button>
                    <button type="button" class="btn-touch-move btn-move-down" data-account-id="${a.id}" ${idx === sortedAccounts.length - 1 ? 'disabled' : ''} aria-label="เลื่อนลง">
                      ${renderIcon('chevron-down', 13)}
                    </button>
                  </div>

                  <span class="account-icon">${renderIcon(a.icon || 'credit-card', 17)}</span>
                  <div class="account-info">
                    <span class="account-name">${a.name}</span>
                    ${a.hidden ? '<span class="badge badge-neutral">ซ่อน</span>' : ''}
                  </div>
                  <span class="account-balance mono ${a.balance < 0 ? 'expense' : ''}">${formatTHB(a.balance)}</span>
                  <button type="button" class="icon-btn edit-btn" data-account-id="${a.id}" title="แก้ไขบัญชี">
                    ${renderIcon('edit', 14)}
                  </button>
                </div>
              `).join('')}
            </div>

            ${archivedAccounts.length > 0 ? `
              <div class="archive-section" id="archive-section">
                <button type="button" class="archive-toggle" id="archive-toggle">
                  <span class="archive-toggle-arrow">▶</span>
                  บัญชีที่จัดเก็บ (${archivedAccounts.length})
                </button>
                <div class="archived-list" id="archived-list">
                  ${archivedAccounts.map(a => `
                    <div class="account-manage-row archived-row" data-account-id="${a.id}">
                      <span class="account-icon">${renderIcon(a.icon || 'credit-card', 17)}</span>
                      <div class="account-info">
                        <span class="account-name">${a.name}</span>
                        <span class="badge badge-neutral">จัดเก็บ</span>
                      </div>
                      <button type="button" class="btn-ghost btn-xs restore-btn" data-account-id="${a.id}">
                        กู้คืน
                      </button>
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
            <h2 class="card-title">หมวดรายจ่าย (${expenseCats.length})</h2>
            <button type="button" class="btn-primary btn-sm" id="btn-add-expense-cat">
              ${renderIcon('plus', 14)} เพิ่มหมวด
            </button>
          </div>
          <div class="cat-grid">
            ${expenseCats.map(c => `
              <div class="cat-chip" data-cat-id="${c.id}">
                <span>${renderIcon(c.icon || 'box', 15)}</span>
                <span>${c.name}</span>
              </div>
            `).join('') || '<div class="empty-state-sm">ยังไม่มีหมวดรายจ่าย</div>'}
          </div>
        </div>

        <!-- Income categories -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">หมวดรายรับ (${incomeCats.length})</h2>
            <button type="button" class="btn-primary btn-sm" id="btn-add-income-cat">
              ${renderIcon('plus', 14)} เพิ่มหมวด
            </button>
          </div>
          <div class="cat-grid">
            ${incomeCats.map(c => `
              <div class="cat-chip cat-chip-income" data-cat-id="${c.id}">
                <span>${renderIcon(c.icon || 'sparkles', 15)}</span>
                <span>${c.name}</span>
              </div>
            `).join('') || '<div class="empty-state-sm">ยังไม่มีหมวดรายรับ</div>'}
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-add-account')?.addEventListener('click', () => {
      window.openAccountModal?.();
    });

    document.getElementById('btn-add-expense-cat')?.addEventListener('click', () => {
      window.openCategoryModal?.(null, 'expense');
    });
    document.getElementById('btn-add-income-cat')?.addEventListener('click', () => {
      window.openCategoryModal?.(null, 'income');
    });

    container.querySelectorAll('.edit-btn[data-account-id]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        window.openAccountModal?.(btn.dataset.accountId);
      });
    });

    // Touch reorder up/down handlers
    container.querySelectorAll('.btn-move-up[data-account-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const accId = btn.dataset.accountId;
        const currentOrder = sortedAccounts.map(a => a.id);
        const idx = currentOrder.indexOf(accId);
        if (idx > 0) {
          const temp = currentOrder[idx];
          currentOrder[idx] = currentOrder[idx - 1];
          currentOrder[idx - 1] = temp;
          saveAccountOrder(currentOrder);
          render();
        }
      });
    });

    container.querySelectorAll('.btn-move-down[data-account-id]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const accId = btn.dataset.accountId;
        const currentOrder = sortedAccounts.map(a => a.id);
        const idx = currentOrder.indexOf(accId);
        if (idx !== -1 && idx < currentOrder.length - 1) {
          const temp = currentOrder[idx];
          currentOrder[idx] = currentOrder[idx + 1];
          currentOrder[idx + 1] = temp;
          saveAccountOrder(currentOrder);
          render();
        }
      });
    });

    container.querySelectorAll('.cat-chip[data-cat-id]').forEach(chip => {
      chip.addEventListener('click', () => window.openCategoryModal?.(chip.dataset.catId));
    });

    const archiveToggle = document.getElementById('archive-toggle');
    const archivedList  = document.getElementById('archived-list');
    if (archiveToggle && archivedList) {
      archiveToggle.addEventListener('click', () => {
        const isOpen = archivedList.classList.toggle('visible');
        archiveToggle.classList.toggle('open', isOpen);
      });
    }

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

    bindDragReorder(
      document.getElementById('accounts-list'),
      '.account-manage-row[data-account-id]',
      'data-account-id',
      sortedAccounts.map(a => a.id)
    );
  }

  await render();
}

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
