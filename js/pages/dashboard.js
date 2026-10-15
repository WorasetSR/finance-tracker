// ─────────────────────────────────────────────────────────────
//  pages/dashboard.js
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonth, formatDateRelative } from '../format.js';
import { currentMonth, makeTransaction, todayStr } from '../schema.js';
import { syncTransaction } from '../supabase-client.js';
import { getUpcomingBills, paySubscription } from '../subscriptions.js';

let chartInstance = null;

const ORDER_KEY     = 'ft_account_order';
const SUM_SEL_KEY   = 'ft_sum_selection';

function getAccountOrder() {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) || '[]'); } catch { return []; }
}
function saveAccountOrder(ids) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}
function getSumSelection() {
  try { return JSON.parse(localStorage.getItem(SUM_SEL_KEY) || '{}'); } catch { return {}; }
}
function saveSumSelection(sel) {
  localStorage.setItem(SUM_SEL_KEY, JSON.stringify(sel));
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

export async function initDashboard(container, store, { openTxModal, showToast, showConfirm }) {
  let month = currentMonth();

  async function render() {
    const [summary, accounts, txs, categories, pendingAdvances] = await Promise.all([
      store.getMonthSummary(month),
      store.getAccounts(),
      store.getTransactions({ month }),
      store.getCategories(),
      store.getPendingAdvances(),
    ]);

    const balancePromises = accounts.map(a => store.computeBalance(a.id).then(b => ({ ...a, balance: b })));
    const accountsWithBalance = await Promise.all(balancePromises);
    const visibleAccounts = sortByOrder(accountsWithBalance.filter(a => !a.hidden));

    // Ensure order is initialised for any new accounts
    const storedOrder = getAccountOrder();
    const allIds = accountsWithBalance.map(a => a.id);
    const newIds = allIds.filter(id => !storedOrder.includes(id));
    if (newIds.length) saveAccountOrder([...storedOrder, ...newIds]);

    // Sum selection state (default: all selected)
    const sel = getSumSelection();
    visibleAccounts.forEach(a => { if (!(a.id in sel)) sel[a.id] = true; });

    const selectedSum = visibleAccounts
      .filter(a => sel[a.id] !== false)
      .reduce((s, a) => s + a.balance, 0);
    const allSelected = visibleAccounts.every(a => sel[a.id] !== false);

    // Category spending breakdown
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const catTotals = {};
    for (const tx of txs) {
      if (tx.type !== 'expense' || tx.isAdvance) continue;
      const cat = catMap[tx.categoryId];
      if (!cat) continue;
      catTotals[tx.categoryId] = (catTotals[tx.categoryId] || { cat, total: 0 });
      catTotals[tx.categoryId].total += tx.amountMinor;
    }
    const topCats = Object.values(catTotals).sort((a, b) => b.total - a.total).slice(0, 5);

    const recent = txs.slice(0, 8);
    const upcomingBills = getUpcomingBills(14);

    const savingRate = summary.income > 0
      ? Math.round((summary.net / summary.income) * 100)
      : 0;

    container.innerHTML = `
      <div class="page-header">
        <h1 class="page-title">${formatMonth(month)}</h1>
        <div class="month-nav">
          <button class="icon-btn" id="prev-month" title="เดือนก่อน">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="icon-btn" id="next-month" title="เดือนถัดไป">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      </div>

      <div class="page-body">
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-label">รายรับ</span>
            <span class="stat-value income">${formatTHB(summary.income)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">รายจ่าย</span>
            <span class="stat-value expense">${formatTHB(summary.expense)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">คงเหลือ</span>
            <span class="stat-value ${summary.net >= 0 ? 'income' : 'expense'}">${formatTHB(Math.abs(summary.net))}</span>
            <span class="stat-sub">${summary.net >= 0 ? '▲ บวก' : '▼ ลบ'}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">อัตราออม</span>
            <span class="stat-value ${savingRate >= 0 ? 'income' : 'expense'}">${savingRate}%</span>
            <span class="stat-sub">จากรายรับทั้งหมด</span>
          </div>
        </div>

        <div class="dashboard-grid">
          <!-- Account balances with checkboxes and reorder -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">บัญชี</h2>
            </div>
            <div class="account-list" id="dash-account-list">
              ${visibleAccounts.length > 0 ? visibleAccounts.map(a => `
                <div class="account-row" draggable="true" data-account-id="${a.id}">
                  <span class="drag-handle" title="ลาก เพื่อจัดเรียง">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><circle cx="4.5" cy="2.5" r="1"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="9.5" r="1"/><circle cx="7.5" cy="2.5" r="1"/><circle cx="7.5" cy="6" r="1"/><circle cx="7.5" cy="9.5" r="1"/></svg>
                  </span>
                  <input type="checkbox" class="account-check" data-acc-id="${a.id}" ${sel[a.id] !== false ? 'checked' : ''} title="รวมใน sum">
                  <span class="account-icon">${a.icon || '💳'}</span>
                  <span class="account-name">${a.name}</span>
                  <span class="account-balance mono ${a.balance < 0 ? 'expense' : ''}">${formatTHB(a.balance)}</span>
                </div>
              `).join('') : '<div class="empty-state-sm">ยังไม่มีบัญชี</div>'}
            </div>
            ${visibleAccounts.length > 0 ? `
              <div class="account-sum-row">
                <span class="account-sum-label">รวมที่เลือก</span>
                <span class="account-sum-value" id="dash-sum-value">${formatTHB(selectedSum)}</span>
              </div>
            ` : ''}
          </div>

          <!-- Spending by category chart -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">รายจ่ายตามหมวด</h2>
            </div>
            ${topCats.length > 0 ? `
              <div class="chart-wrap chart-wrap-donut">
                <canvas id="donut-chart"></canvas>
              </div>
              <div class="cat-legend">
                ${topCats.map((e, i) => `
                  <div class="legend-item">
                    <span class="legend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
                    <span class="legend-label">${e.cat.icon || ''} ${e.cat.name}</span>
                    <span class="legend-value mono">${formatTHB(e.total)}</span>
                  </div>
                `).join('')}
              </div>
            ` : '<div class="empty-state-sm">ยังไม่มีรายจ่ายเดือนนี้</div>'}
          </div>
        </div>

        ${pendingAdvances && pendingAdvances.length > 0 ? `
          <!-- Receivables (ยอดรอเพื่อนเคลียร์) -->
          <div class="card" id="card-receivables">
            <div class="card-header">
              <h2 class="card-title">🤝 ยอดรอเพื่อนเคลียร์ (${pendingAdvances.length})</h2>
              <span class="mono" style="font-weight:700;color:#D97706">
                รวม ${formatTHB(pendingAdvances.reduce((s, a) => s + a.amountMinor, 0))}
              </span>
            </div>
            <div class="receivables-container">
              ${pendingAdvances.map(adv => `
                <div class="receivable-row" data-adv-id="${adv.id}">
                  <div class="receivable-left">
                    <span class="receivable-name">
                      <span class="badge-advance">รอเคลียร์</span>
                      <strong>${adv.advanceTo || 'เพื่อน'}</strong>
                    </span>
                    <span class="receivable-meta">${formatDateRelative(adv.date)}${adv.note ? ' · ' + adv.note : ''}</span>
                  </div>
                  <div class="receivable-right">
                    <span class="mono" style="font-weight:700;color:#D97706">${formatTHB(adv.amountMinor)}</span>
                    <button type="button" class="btn-primary btn-sm btn-settle-adv" data-adv-id="${adv.id}" style="padding:4px 10px;font-size:12px">
                      ✓ คืนแล้ว
                    </button>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${upcomingBills && upcomingBills.length > 0 ? `
          <!-- Subscriptions & Upcoming Bills -->
          <div class="card" id="card-subscriptions">
            <div class="card-header">
              <h2 class="card-title">🔔 รอบบิลประจำที่ใกล้ถึง (${upcomingBills.filter(b => !b.isPaid).length})</h2>
              <button class="link-btn" data-page="budget">ดูทั้งหมด / จัดการ →</button>
            </div>
            <div class="subs-list">
              ${upcomingBills.slice(0, 4).map(b => `
                <div class="sub-item-card" data-sub-id="${b.sub.id}">
                  <div class="sub-left">
                    <span class="sub-icon">${b.sub.icon || '📱'}</span>
                    <div class="sub-details">
                      <span class="sub-name">
                        ${b.sub.name}
                        <span class="sub-urgency-badge ${b.urgency}">${b.label}</span>
                      </span>
                      <span class="sub-meta">ตัดทุกวันที่ ${b.dueDay} ของเดือน</span>
                    </div>
                  </div>
                  <div class="sub-right">
                    <span class="mono" style="font-weight:700">${formatTHB(b.sub.amountMinor)}</span>
                    ${!b.isPaid ? `
                      <button type="button" class="btn-primary btn-sm btn-pay-sub" data-sub-id="${b.sub.id}" style="padding:4px 10px;font-size:12px">
                        ✓ ชำระแล้ว
                      </button>
                    ` : `
                      <span style="font-size:12px;color:var(--income);font-weight:600">✓ จ่ายแล้ว</span>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Recent transactions -->
        <div class="card">
          <div class="card-header">
            <h2 class="card-title">รายการล่าสุด</h2>
            <button class="link-btn" data-page="transactions">ดูทั้งหมด →</button>
          </div>
          ${recent.length > 0 ? `
            <div class="tx-list">
              ${recent.map(tx => {
                const cat = catMap[tx.categoryId];
                const acc = accountsWithBalance.find(a => a.id === (tx.accountId || tx.fromAccountId));
                return `
                  <div class="tx-row" data-tx-id="${tx.id}">
                    <span class="tx-icon">${cat?.icon || (tx.type === 'transfer' ? '↔️' : tx.type === 'income' ? '💰' : '💸')}</span>
                    <div class="tx-info">
                      <span class="tx-name">
                        ${cat?.name || (tx.type === 'transfer' ? 'โอนเงิน' : 'ไม่ระบุ')}
                        ${tx.isAdvance ? `<span class="badge-advance ${tx.advanceStatus === 'settled' ? 'settled' : ''}" style="margin-left:6px">${tx.advanceStatus === 'settled' ? '✓ คืนแล้ว: ' : 'รอคืน: '}${tx.advanceTo || 'เพื่อน'}</span>` : ''}
                        ${tx.isAdvanceSettlement ? `<span class="badge-advance settled" style="margin-left:6px">✓ รับเงินคืน</span>` : ''}
                      </span>
                      <span class="tx-meta">${formatDateRelative(tx.date)}${tx.note ? ' · ' + tx.note : ''}</span>
                    </div>
                    <span class="tx-amount mono ${tx.type === 'income' ? 'income' : tx.type === 'expense' ? 'expense' : ''}">
                      ${tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}${formatTHB(tx.amountMinor)}
                    </span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div class="empty-state-sm">ยังไม่มีรายการเดือนนี้</div>'}
        </div>
      </div>
    `;

    // Draw donut chart
    if (topCats.length > 0) {
      requestAnimationFrame(() => drawDonut(topCats));
    }

    // Month nav
    document.getElementById('prev-month')?.addEventListener('click', () => {
      month = offsetMonth(month, -1); render();
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
      month = offsetMonth(month, 1); render();
    });

    // Tx row clicks
    container.querySelectorAll('.tx-row[data-tx-id]').forEach(row => {
      row.addEventListener('click', () => openTxModal(row.dataset.txId));
    });

    // Advance settlement clicks
    container.querySelectorAll('.btn-settle-adv').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const advId = btn.dataset.advId;
        const adv = await store.get('transactions', advId);
        if (!adv) return;

        const friendName = adv.advanceTo || 'เพื่อน';
        const ok = await showConfirm(
          'บันทึกว่าได้รับเงินคืน',
          `ยืนยันว่าได้รับเงินคืนจาก ${friendName} จำนวน ${formatTHB(adv.amountMinor)} เรียบร้อยแล้ว?`
        );
        if (!ok) return;

        // 1. Mark original advance as settled
        adv.advanceStatus = 'settled';
        adv.settledAt = new Date().toISOString();
        adv.updatedAt = new Date().toISOString();
        await store.put('transactions', adv);
        await store.addToPendingQueue({ id: adv.id, store: 'transactions', op: 'update' });
        syncTransaction(adv).catch(console.error);

        // 2. Create settlement income transaction into the same account
        const settleTx = makeTransaction({
          type: 'income',
          amountMinor: adv.amountMinor,
          date: todayStr(),
          accountId: adv.accountId,
          categoryId: 'cat_settle',
          note: `รับเงินคืนจาก ${friendName}` + (adv.note ? ` (${adv.note})` : ''),
          isAdvanceSettlement: true,
        });
        await store.put('transactions', settleTx);
        await store.addToPendingQueue({ id: settleTx.id, store: 'transactions', op: 'create' });
        syncTransaction(settleTx).catch(console.error);

        showToast(`บันทึกรับเงินคืนจาก ${friendName} เรียบร้อยแล้ว 🎉`);
        render();
      });
    });

    // 1-Click Pay Subscription Bill
    container.querySelectorAll('.btn-pay-sub').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const subId = btn.dataset.subId;
        const ok = await showConfirm('ยืนยันชำระบิล', 'ต้องการบันทึกการชำระเงินสำหรับรอบบิลนี้เข้าบัญชีหรือไม่?');
        if (!ok) return;

        try {
          await paySubscription(subId, store);
          showToast('บันทึกการชำระบิลเรียบร้อยแล้ว ✓');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // Checkbox sum
    container.querySelectorAll('.account-check').forEach(cb => {
      cb.addEventListener('change', () => {
        const s = getSumSelection();
        s[cb.dataset.accId] = cb.checked;
        saveSumSelection(s);
        const visIds = visibleAccounts.map(a => a.id);
        const total = visibleAccounts
          .filter(a => s[a.id] !== false)
          .reduce((sum, a) => sum + a.balance, 0);
        const el = document.getElementById('dash-sum-value');
        if (el) el.textContent = formatTHB(total);
      });
    });

    // Drag-to-reorder
    bindDragReorder(
      document.getElementById('dash-account-list'),
      '.account-row[data-account-id]',
      'data-account-id',
      visibleAccounts.map(a => a.id)
    );
  }

  await render();

  return () => {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  };
}

// ── Drag-to-reorder helper ────────────────────────────────────

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

// Export for accounts.js to reuse
export { bindDragReorder };

// ── Chart ─────────────────────────────────────────────────────

const CHART_COLORS = ['#0D9488','#14B8A6','#2DD4BF','#5EEAD4','#99F6E4','#6366F1','#8B5CF6','#EC4899'];

function drawDonut(topCats) {
  const canvas = document.getElementById('donut-chart');
  if (!canvas) return;
  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }

  chartInstance = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: topCats.map(e => e.cat.name),
      datasets: [{
        data:            topCats.map(e => e.total / 100),
        backgroundColor: CHART_COLORS.slice(0, topCats.length),
        borderWidth:     2,
        borderColor:     '#fff',
        hoverOffset:     4,
      }],
    },
    options: {
      cutout:   '70%',
      plugins:  { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ฿${ctx.parsed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
      }},
      animation: { duration: 400 },
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────

function offsetMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
