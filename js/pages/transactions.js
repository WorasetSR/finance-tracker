// ─────────────────────────────────────────────────────────────
//  pages/transactions.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatDate, formatDateRelative, formatMonth } from '../format.js';
import { currentMonth } from '../schema.js';
import { exportTransactions } from '../export.js';

export async function initTransactions(container, store, { openTxModal, showToast }) {
  let month      = currentMonth();
  let filterType = 'all';  // 'all' | 'income' | 'expense' | 'transfer'
  let filterAccId = '';
  let filterCatId = '';

  async function render() {
    const [txs, accounts, categories] = await Promise.all([
      store.getTransactions({ month, type: filterType === 'all' ? undefined : filterType, accountId: filterAccId || undefined, categoryId: filterCatId || undefined }),
      store.getAccounts(),
      store.getCategories(),
    ]);

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const accMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    // Group by date
    const groups = groupByDate(txs);
    const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    const accOptions = accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name}</option>`).join('');
    const catOptions = categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');

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
          <button class="btn-ghost" id="btn-export">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export
          </button>
          <button class="btn-primary" id="btn-add-tx-page">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            เพิ่มรายการ
          </button>
        </div>
      </div>

      <div class="page-body">
        <!-- Filters -->
        <div class="filters-bar">
          <div class="filter-tabs">
            <button class="filter-tab ${filterType === 'all' ? 'active' : ''}" data-filter-type="all">ทั้งหมด</button>
            <button class="filter-tab ${filterType === 'income' ? 'active' : ''}" data-filter-type="income">รายรับ</button>
            <button class="filter-tab ${filterType === 'expense' ? 'active' : ''}" data-filter-type="expense">รายจ่าย</button>
            <button class="filter-tab ${filterType === 'transfer' ? 'active' : ''}" data-filter-type="transfer">โอน</button>
          </div>
          <div class="filter-selects">
            <select id="filter-acc" class="filter-select">
              <option value="">ทุกบัญชี</option>
              ${accOptions}
            </select>
            <select id="filter-cat" class="filter-select">
              <option value="">ทุกหมวด</option>
              ${catOptions}
            </select>
          </div>
        </div>

        <!-- Summary bar -->
        <div class="tx-summary">
          <span class="income">+${formatTHB(txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amountMinor, 0))}</span>
          <span class="divider">|</span>
          <span class="expense">-${formatTHB(txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountMinor, 0))}</span>
          <span class="tx-count">${txs.length} รายการ</span>
        </div>

        <!-- Transaction groups -->
        ${groupKeys.length > 0 ? groupKeys.map(date => {
          const dayTxs = groups[date];
          const dayIncome  = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amountMinor, 0);
          const dayExpense = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountMinor, 0);

          return `
            <div class="tx-group">
              <div class="tx-date-header">
                <span class="tx-date-label">${formatDateRelative(date)}</span>
                <span class="tx-date-full">${formatDate(date)}</span>
                <span class="tx-day-total">
                  ${dayIncome > 0 ? `<span class="income">+${formatTHB(dayIncome)}</span>` : ''}
                  ${dayExpense > 0 ? `<span class="expense">-${formatTHB(dayExpense)}</span>` : ''}
                </span>
              </div>
              <div class="tx-list">
                ${dayTxs.map(tx => {
                  const cat = catMap[tx.categoryId];
                  const acc = accMap[tx.accountId || tx.fromAccountId];
                  const isTransfer = tx.type === 'transfer';
                  const toAcc = isTransfer ? accMap[tx.toAccountId] : null;
                  return `
                    <div class="tx-row" data-tx-id="${tx.id}">
                      <span class="tx-icon">${cat?.icon || (isTransfer ? '↔️' : tx.type === 'income' ? '💰' : '💸')}</span>
                      <div class="tx-info">
                        <span class="tx-name">${cat?.name || (isTransfer ? 'โอนเงิน' : 'ไม่ระบุ')}</span>
                        <span class="tx-meta">
                          ${acc?.name || ''}${isTransfer && toAcc ? ' → ' + toAcc.name : ''}
                          ${tx.note ? ' · ' + tx.note : ''}
                        </span>
                      </div>
                      <div class="tx-right">
                        <span class="tx-amount mono ${tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : ''}">
                          ${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${formatTHB(tx.amountMinor)}
                        </span>
                        ${!tx.synced ? '<span class="sync-badge">●</span>' : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('') : `
          <div class="empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
            <p>ยังไม่มีรายการในเดือนนี้</p>
            <button class="btn-primary" id="btn-add-empty">เพิ่มรายการแรก</button>
          </div>
        `}
      </div>
    `;

    // Restore filter values
    if (filterAccId) document.getElementById('filter-acc').value = filterAccId;
    if (filterCatId) document.getElementById('filter-cat').value = filterCatId;

    // Bind events
    document.getElementById('prev-month')?.addEventListener('click', () => { month = offsetMonth(month, -1); render(); });
    document.getElementById('next-month')?.addEventListener('click', () => { month = offsetMonth(month, 1); render(); });

    document.getElementById('btn-add-tx-page')?.addEventListener('click', () => openTxModal());
    document.getElementById('btn-add-empty')?.addEventListener('click', () => openTxModal());

    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => { filterType = btn.dataset.filterType; render(); });
    });

    document.getElementById('filter-acc')?.addEventListener('change', (e) => { filterAccId = e.target.value; render(); });
    document.getElementById('filter-cat')?.addEventListener('change', (e) => { filterCatId = e.target.value; render(); });

    container.querySelectorAll('.tx-row[data-tx-id]').forEach(row => {
      row.addEventListener('click', () => openTxModal(row.dataset.txId));
    });

    document.getElementById('btn-export')?.addEventListener('click', async () => {
      const [allTxs, accs, cats] = await Promise.all([
        store.getTransactions({ month }),
        store.getAccounts(),
        store.getCategories(),
      ]);
      exportTransactions(allTxs, accs, cats, `finance-${month}`);
    });
  }

  await render();
}

// ── Helpers ───────────────────────────────────────────────────

function groupByDate(txs) {
  return txs.reduce((acc, tx) => {
    const d = tx.date || 'unknown';
    if (!acc[d]) acc[d] = [];
    acc[d].push(tx);
    return acc;
  }, {});
}

function offsetMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
