// ─────────────────────────────────────────────────────────────
//  pages/transactions.js — List, Daily Calendar View & Smart Search
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatDate, formatDateRelative, formatMonth } from '../format.js';
import { currentMonth, todayStr } from '../schema.js';
import { exportTransactions } from '../export.js';

export async function initTransactions(container, store, { openTxModal, showToast }) {
  let month        = currentMonth();
  let filterType   = 'all';  // 'all' | 'income' | 'expense' | 'transfer'
  let filterAccId  = '';
  let filterCatId  = '';
  let searchQuery  = '';
  let activeTag    = '';
  let viewMode     = 'list'; // 'list' | 'calendar'
  let selectedDate = todayStr().startsWith(month) ? todayStr() : `${month}-01`;

  async function render(preserveSearchFocus = false) {
    const [allMonthTxs, accounts, categories] = await Promise.all([
      store.getTransactions({ month, type: filterType === 'all' ? undefined : filterType, accountId: filterAccId || undefined, categoryId: filterCatId || undefined }),
      store.getAccounts(),
      store.getCategories(),
    ]);

    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const accMap = Object.fromEntries(accounts.map(a => [a.id, a]));

    // Extract hashtags from all month transactions
    const allTags = extractTags(allMonthTxs);

    // Apply Real-Time Search & Tag Filtering
    let txs = allMonthTxs;
    if (activeTag) {
      txs = txs.filter(t => (t.note || '').includes(activeTag));
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      txs = txs.filter(t => {
        const cat = catMap[t.categoryId]?.name?.toLowerCase() || '';
        const acc = accMap[t.accountId || t.fromAccountId]?.name?.toLowerCase() || '';
        const toAcc = accMap[t.toAccountId]?.name?.toLowerCase() || '';
        const note = (t.note || '').toLowerCase();
        const amt = (t.amountMinor / 100).toString();
        const friend = (t.advanceTo || '').toLowerCase();
        return note.includes(q) || cat.includes(q) || acc.includes(q) || toAcc.includes(q) || amt.includes(q) || friend.includes(q);
      });
    }

    // Group by date
    const groups = groupByDate(txs);
    const groupKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    const accOptions = accounts.map(a => `<option value="${a.id}">${a.icon || ''} ${a.name}</option>`).join('');
    const catOptions = categories.map(c => `<option value="${c.id}">${c.icon || ''} ${c.name}</option>`).join('');

    // Ensure selected date stays within active month
    if (!selectedDate.startsWith(month)) {
      selectedDate = `${month}-01`;
    }

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${formatMonth(month)}</h1>
        <div class="header-actions">
          <div class="view-mode-toggle">
            <button type="button" class="view-mode-btn ${viewMode === 'list' ? 'active' : ''}" data-view="list">📋 รายการ</button>
            <button type="button" class="view-mode-btn ${viewMode === 'calendar' ? 'active' : ''}" data-view="calendar">📅 ปฏิทิน</button>
          </div>
          <button class="icon-btn" id="prev-month" title="เดือนก่อน">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="icon-btn" id="next-month" title="เดือนถัดไป">
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
        <!-- Search & Tag Bar -->
        <div class="tx-search-bar" style="margin-bottom:12px">
          <div class="search-input-wrap">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="search" id="tx-search-input" placeholder="ค้นหารายการ, โน้ต, #แท็ก, หมวด, หรือจำนวนเงิน..." value="${searchQuery}" autocomplete="off" />
            ${searchQuery ? `<button type="button" id="btn-clear-search" class="search-clear-btn" title="ล้างการค้นหา">×</button>` : ''}
          </div>
          ${allTags.length > 0 ? `
            <div class="tag-chips-wrap">
              ${allTags.map(tag => `
                <button type="button" class="tag-chip ${activeTag === tag ? 'active' : ''}" data-tag="${tag}">
                  ${tag}
                </button>
              `).join('')}
            </div>
          ` : ''}
        </div>

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
          <span class="tx-count">${txs.length} รายการ ${searchQuery || activeTag ? '(ผลการค้นหา)' : ''}</span>
        </div>

        ${viewMode === 'calendar' ? renderCalendarView(month, txs, selectedDate, catMap, accMap) : renderListView(groupKeys, groups, catMap, accMap, searchQuery || activeTag)}
      </div>
    `;

    // Restore filter values
    if (filterAccId) document.getElementById('filter-acc').value = filterAccId;
    if (filterCatId) document.getElementById('filter-cat').value = filterCatId;

    // Preserve search focus if requested
    if (preserveSearchFocus) {
      const searchInp = document.getElementById('tx-search-input');
      if (searchInp) {
        searchInp.focus();
        searchInp.setSelectionRange(searchInp.value.length, searchInp.value.length);
      }
    }

    // Search input handler
    const searchInp = document.getElementById('tx-search-input');
    searchInp?.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      render(true);
    });

    document.getElementById('btn-clear-search')?.addEventListener('click', () => {
      searchQuery = '';
      activeTag = '';
      render();
    });

    // Tag chips click
    container.querySelectorAll('.tag-chip[data-tag]').forEach(chip => {
      chip.addEventListener('click', () => {
        const clickedTag = chip.dataset.tag;
        activeTag = (activeTag === clickedTag) ? '' : clickedTag;
        render();
      });
    });

    // Reset filters button in empty search state
    document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
      searchQuery = '';
      activeTag = '';
      filterType = 'all';
      filterAccId = '';
      filterCatId = '';
      render();
    });

    // Bind navigation & filters
    document.getElementById('prev-month')?.addEventListener('click', () => { month = offsetMonth(month, -1); render(); });
    document.getElementById('next-month')?.addEventListener('click', () => { month = offsetMonth(month, 1); render(); });

    document.getElementById('btn-add-tx-page')?.addEventListener('click', () => openTxModal());
    document.getElementById('btn-add-empty')?.addEventListener('click', () => openTxModal());

    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        viewMode = btn.dataset.view;
        render();
      });
    });

    document.querySelectorAll('.filter-tab').forEach(btn => {
      btn.addEventListener('click', () => { filterType = btn.dataset.filterType; render(); });
    });

    document.getElementById('filter-acc')?.addEventListener('change', (e) => { filterAccId = e.target.value; render(); });
    document.getElementById('filter-cat')?.addEventListener('change', (e) => { filterCatId = e.target.value; render(); });

    // Calendar day cell click
    container.querySelectorAll('.cal-cell[data-date]').forEach(cell => {
      cell.addEventListener('click', () => {
        selectedDate = cell.dataset.date;
        render();
      });
    });

    // Add transaction for selected calendar date
    document.getElementById('btn-add-cal-date')?.addEventListener('click', () => {
      openTxModal();
      const dateInp = document.getElementById('tx-date');
      if (dateInp) dateInp.value = selectedDate;
    });

    // Transaction click -> open modal
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

// ── Render Views ──────────────────────────────────────────────

function renderListView(groupKeys, groups, catMap, accMap, isFiltered = false) {
  if (!groupKeys.length) {
    if (isFiltered) {
      return `
        <div class="empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <p>ไม่พบรายการที่ตรงกับคำค้นหาหรือตัวกรอง</p>
          <button type="button" class="btn-ghost" id="btn-reset-filters" style="border:1px solid var(--border);margin-top:8px">ล้างคำค้นหา</button>
        </div>
      `;
    }
    return `
      <div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text-muted)"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg>
        <p>ยังไม่มีรายการในเดือนนี้</p>
        <button class="btn-primary" id="btn-add-empty">เพิ่มรายการแรก</button>
      </div>
    `;
  }

  return groupKeys.map(date => {
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
          ${dayTxs.map(tx => renderTxRow(tx, catMap, accMap)).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderCalendarView(month, txs, selectedDate, catMap, accMap) {
  const [yStr, mStr] = month.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1; // 0-based
  const firstDay = new Date(y, m, 1).getDay(); // 0 = Sun
  const totalDays = new Date(y, m + 1, 0).getDate();
  const today = todayStr();

  const dayTotals = {};
  for (const t of txs) {
    if (!t.date) continue;
    if (!dayTotals[t.date]) dayTotals[t.date] = { income: 0, expense: 0, count: 0 };
    if (t.type === 'income') dayTotals[t.date].income += t.amountMinor;
    if (t.type === 'expense') dayTotals[t.date].expense += t.amountMinor;
    dayTotals[t.date].count++;
  }

  let cellsHtml = '';
  // Empty leading cells
  for (let i = 0; i < firstDay; i++) {
    cellsHtml += `<div class="cal-cell empty"></div>`;
  }

  // Days 1..totalDays
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${month}-${String(d).padStart(2, '0')}`;
    const isToday = dateStr === today;
    const isSelected = dateStr === selectedDate;
    const stat = dayTotals[dateStr];

    cellsHtml += `
      <div class="cal-cell ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        <div class="cal-badges">
          ${stat && stat.income > 0 ? `<span class="cal-badge income">+${formatTHB(stat.income, { compact: true })}</span>` : ''}
          ${stat && stat.expense > 0 ? `<span class="cal-badge expense">-${formatTHB(stat.expense, { compact: true })}</span>` : ''}
        </div>
      </div>
    `;
  }

  // Selected Day Details
  const selTxs = txs.filter(t => t.date === selectedDate);
  const selIncome  = selTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amountMinor, 0);
  const selExpense = selTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amountMinor, 0);

  return `
    <div class="calendar-card">
      <div class="calendar-week-header">
        <span>อา.</span><span>จ.</span><span>อ.</span><span>พ.</span><span>พฤ.</span><span>ศ.</span><span>ส.</span>
      </div>
      <div class="calendar-grid">
        ${cellsHtml}
      </div>
    </div>

    <!-- Selected Day Detail Card -->
    <div class="calendar-day-detail">
      <div class="calendar-day-header">
        <div>
          <h2 style="font-size:16px;font-weight:700">${formatDate(selectedDate)}</h2>
          <span style="font-size:12px;color:var(--text-muted)">
            ${selTxs.length} รายการ ·
            ${selIncome > 0 ? `<span style="color:var(--income);font-weight:600">+${formatTHB(selIncome)}</span> ` : ''}
            ${selExpense > 0 ? `<span style="color:var(--expense);font-weight:600">-${formatTHB(selExpense)}</span>` : ''}
          </span>
        </div>
        <button type="button" class="btn-primary btn-sm" id="btn-add-cal-date" style="font-size:12px;padding:6px 12px">
          + เพิ่มรายการวันนี้
        </button>
      </div>

      ${selTxs.length > 0 ? `
        <div class="tx-list">
          ${selTxs.map(tx => renderTxRow(tx, catMap, accMap)).join('')}
        </div>
      ` : `
        <div style="text-align:center;padding:24px 16px;color:var(--text-muted);font-size:13px">
          ไม่มีรายการในวันนี้
        </div>
      `}
    </div>
  `;
}

function renderTxRow(tx, catMap, accMap) {
  const cat = catMap[tx.categoryId];
  const acc = accMap[tx.accountId || tx.fromAccountId];
  const isTransfer = tx.type === 'transfer';
  const toAcc = isTransfer ? accMap[tx.toAccountId] : null;

  return `
    <div class="tx-row" data-tx-id="${tx.id}">
      <span class="tx-icon">${cat?.icon || (isTransfer ? '↔️' : tx.type === 'income' ? '💰' : '💸')}</span>
      <div class="tx-info">
        <span class="tx-name">
          ${cat?.name || (isTransfer ? 'โอนเงิน' : 'ไม่ระบุ')}
          ${tx.isAdvance ? `<span class="badge-advance ${tx.advanceStatus === 'settled' ? 'settled' : ''}" style="margin-left:6px">${tx.advanceStatus === 'settled' ? '✓ คืนแล้ว: ' : 'รอคืน: '}${tx.advanceTo || 'เพื่อน'}</span>` : ''}
          ${tx.isAdvanceSettlement ? `<span class="badge-advance settled" style="margin-left:6px">✓ รับเงินคืน</span>` : ''}
        </span>
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
}

// ── Helpers ───────────────────────────────────────────────────

function extractTags(txs) {
  const tagSet = new Set();
  const tagRegex = /#([\wก-๙]+)/g;
  for (const tx of txs) {
    if (!tx.note) continue;
    let match;
    while ((match = tagRegex.exec(tx.note)) !== null) {
      tagSet.add('#' + match[1]);
    }
  }
  return Array.from(tagSet);
}

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
