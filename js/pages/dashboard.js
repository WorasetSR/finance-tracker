// ─────────────────────────────────────────────────────────────
//  pages/dashboard.js — Compact Mobile-First Dashboard
//  Finance Tracker v4.0 (Zero-Emoji SVG Icons)
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonth, formatDateRelative } from '../format.js';
import { currentMonth, makeTransaction, todayStr } from '../schema.js';
import { syncTransaction } from '../supabase-client.js';
import { getUpcomingBills, paySubscription } from '../subscriptions.js';
import { renderIcon } from '../icons.js';

let chartInstance = null;

const ORDER_KEY   = 'ft_account_order';
const SUM_SEL_KEY = 'ft_sum_selection';

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

export async function initDashboard(container, store, { openTxModal, showToast, showConfirm, navigate }) {
  let month = currentMonth();
  let receivablesExpanded = false;
  let billsExpanded = false;

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

    const storedOrder = getAccountOrder();
    const allIds = accountsWithBalance.map(a => a.id);
    const newIds = allIds.filter(id => !storedOrder.includes(id));
    if (newIds.length) saveAccountOrder([...storedOrder, ...newIds]);

    const sel = getSumSelection();
    visibleAccounts.forEach(a => { if (!(a.id in sel)) sel[a.id] = true; });

    const selectedSum = visibleAccounts
      .filter(a => sel[a.id] !== false)
      .reduce((s, a) => s + a.balance, 0);

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
    const unpaidBills = upcomingBills.filter(b => !b.isPaid);

    const savingRate = summary.income > 0
      ? Math.round((summary.net / summary.income) * 100)
      : 0;

    container.innerHTML = `
      <div class="page-header">
        <div class="month-nav">
          <button class="icon-btn" id="prev-month" title="เดือนก่อน" aria-label="เดือนก่อน">
            ${renderIcon('chevron-left', 16)}
          </button>
          <h1 class="page-title" style="min-width:120px;text-align:center">${formatMonth(month)}</h1>
          <button class="icon-btn" id="next-month" title="เดือนถัดไป" aria-label="เดือนถัดไป">
            ${renderIcon('chevron-right', 16)}
          </button>
        </div>
        <button type="button" class="link-btn" data-page="analytics">
          วิเคราะห์ละเอียด →
        </button>
      </div>

      <div class="page-body">
        <!-- Hero Net Summary Card -->
        <div class="hero-summary-card">
          <div class="hero-top-row">
            <div>
              <div class="hero-net-label">คงเหลือสุทธิเดือนนี้</div>
              <div class="hero-net-value ${summary.net >= 0 ? 'income' : 'expense'}">
                ${summary.net < 0 ? '-' : ''}${formatTHB(Math.abs(summary.net))}
              </div>
            </div>
            <span class="hero-saving-pill">
              อัตราออม ${savingRate}%
            </span>
          </div>
          <div class="hero-metrics-row">
            <div class="hero-metric-box">
              <span class="hero-metric-lbl">รายรับเดือนนี้</span>
              <span class="hero-metric-val income">+${formatTHB(summary.income)}</span>
            </div>
            <div class="hero-metric-box">
              <span class="hero-metric-lbl">รายจ่ายเดือนนี้</span>
              <span class="hero-metric-val expense">-${formatTHB(summary.expense)}</span>
            </div>
          </div>
        </div>

        <!-- Horizontal Account Strip (1-Tap Sum Toggle) -->
        <div class="accounts-strip-wrap">
          <div class="accounts-strip-header">
            <span class="accounts-strip-title">
              บัญชี · รวมที่เลือก <strong class="mono" id="dash-sum-value" style="color:var(--text)">${formatTHB(selectedSum)}</strong>
            </span>
            <button type="button" class="link-btn" data-page="accounts">จัดการบัญชี →</button>
          </div>
          ${visibleAccounts.length > 0 ? `
            <div class="accounts-horizontal-scroll" id="dash-account-list">
              ${visibleAccounts.map(a => {
                const isIncluded = sel[a.id] !== false;
                return `
                  <div class="acc-mini-card ${isIncluded ? '' : 'excluded'}" data-account-id="${a.id}" title="แตะเพื่อรวม/แยกจากยอดรวม">
                    <div class="acc-mini-top">
                      <span class="acc-mini-icon">${renderIcon(a.icon || 'credit-card', 15)}</span>
                      <span class="acc-mini-check">${isIncluded ? renderIcon('check', 11) : ''}</span>
                    </div>
                    <div class="acc-mini-name">${a.name}</div>
                    <div class="acc-mini-bal ${a.balance < 0 ? 'expense' : ''}">${formatTHB(a.balance)}</div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : '<div class="empty-state-sm">ยังไม่มีบัญชี</div>'}
        </div>

        <!-- Collapsible Alert Banner: Pending Receivables -->
        ${pendingAdvances && pendingAdvances.length > 0 ? `
          <div class="compact-banner ${receivablesExpanded ? 'open' : ''}" id="card-receivables">
            <div class="compact-banner-header" id="toggle-receivables">
              <div class="compact-banner-left">
                <span class="compact-banner-icon warn">${renderIcon('users', 16)}</span>
                <span class="compact-banner-title">ยอดรอเพื่อนเคลียร์ (${pendingAdvances.length})</span>
              </div>
              <div class="compact-banner-right">
                <span class="mono" style="font-size:13px;font-weight:700;color:var(--warning)">
                  ${formatTHB(pendingAdvances.reduce((s, a) => s + a.amountMinor, 0))}
                </span>
                <span class="compact-banner-chevron">${renderIcon('chevron-down', 16)}</span>
              </div>
            </div>
            <div class="compact-banner-body">
              <div class="receivables-container">
                ${pendingAdvances.map(adv => `
                  <div class="receivable-row" data-adv-id="${adv.id}">
                    <div class="receivable-left">
                      <span class="receivable-name">
                        <span class="badge-advance">รอคืน</span>
                        <strong>${adv.advanceTo || 'เพื่อน'}</strong>
                      </span>
                      <span class="receivable-meta">${formatDateRelative(adv.date)}${adv.note ? ' · ' + adv.note : ''}</span>
                    </div>
                    <div class="receivable-right">
                      <span class="mono" style="font-weight:700;color:var(--warning)">${formatTHB(adv.amountMinor)}</span>
                      <button type="button" class="btn-primary btn-xs btn-settle-adv" data-adv-id="${adv.id}">
                        ${renderIcon('check', 12)} คืนแล้ว
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <!-- Collapsible Alert Banner: Upcoming Subscriptions -->
        ${upcomingBills && upcomingBills.length > 0 ? `
          <div class="compact-banner ${billsExpanded || unpaidBills.some(b => b.urgency === 'overdue' || b.urgency === 'due_today') ? 'open' : ''}" id="card-subscriptions">
            <div class="compact-banner-header" id="toggle-subscriptions">
              <div class="compact-banner-left">
                <span class="compact-banner-icon info">${renderIcon('bell', 16)}</span>
                <span class="compact-banner-title">รอบบิลประจำ (${unpaidBills.length} รอจ่าย)</span>
              </div>
              <div class="compact-banner-right">
                <button type="button" class="link-btn" id="btn-go-subs" data-page="budget" data-tab="subscriptions">จัดการบิล →</button>
                <span class="compact-banner-chevron">${renderIcon('chevron-down', 16)}</span>
              </div>
            </div>
            <div class="compact-banner-body">
              <div class="subs-list">
                ${upcomingBills.slice(0, 4).map(b => `
                  <div class="sub-item-card" data-sub-id="${b.sub.id}">
                    <div class="sub-left">
                      <span class="sub-icon">${renderIcon(b.sub.icon || 'tv', 17)}</span>
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
                        <button type="button" class="btn-primary btn-xs btn-pay-sub" data-sub-id="${b.sub.id}">
                          ${renderIcon('check', 12)} ชำระ
                        </button>
                      ` : `
                        <span style="font-size:11.5px;color:var(--income);font-weight:600">จ่ายแล้ว</span>
                      `}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        ` : ''}

        <div class="dashboard-grid">
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
                  const fallbackIcon = tx.type === 'transfer' ? 'arrow-left-right' : (tx.type === 'income' ? 'coins' : 'arrow-up-right');
                  return `
                    <div class="tx-row" data-tx-id="${tx.id}">
                      <span class="tx-icon">${renderIcon(cat?.icon || fallbackIcon, 17)}</span>
                      <div class="tx-info">
                        <span class="tx-name">
                          ${cat?.name || (tx.type === 'transfer' ? 'โอนเงิน' : 'ไม่ระบุ')}
                          ${tx.isAdvance ? `<span class="badge-advance ${tx.advanceStatus === 'settled' ? 'settled' : ''}">${tx.advanceStatus === 'settled' ? 'คืนแล้ว: ' : 'รอคืน: '}${tx.advanceTo || 'เพื่อน'}</span>` : ''}
                          ${tx.isAdvanceSettlement ? `<span class="badge-advance settled">รับเงินคืน</span>` : ''}
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
            ` : '<div class="empty-state-sm">ยังไม่มีรายการในเดือนนี้</div>'}
          </div>

          <!-- Spending by category chart -->
          <div class="card">
            <div class="card-header">
              <h2 class="card-title">สัดส่วนรายจ่าย</h2>
            </div>
            ${topCats.length > 0 ? `
              <div class="chart-wrap chart-wrap-donut">
                <canvas id="donut-chart"></canvas>
              </div>
              <div class="cat-legend">
                ${topCats.map((e, i) => `
                  <div class="legend-item">
                    <span class="legend-dot" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>
                    <span class="legend-label">${renderIcon(e.cat.icon || 'box', 14)} ${e.cat.name}</span>
                    <span class="legend-value mono">${formatTHB(e.total)}</span>
                  </div>
                `).join('')}
              </div>
            ` : '<div class="empty-state-sm">ยังไม่มีรายจ่ายเดือนนี้</div>'}
          </div>
        </div>
      </div>
    `;

    if (topCats.length > 0) {
      requestAnimationFrame(() => drawDonut(topCats));
    }

    document.getElementById('prev-month')?.addEventListener('click', () => {
      month = offsetMonth(month, -1);
      render();
    });
    document.getElementById('next-month')?.addEventListener('click', () => {
      month = offsetMonth(month, 1);
      render();
    });

    // Collapsible banners
    document.getElementById('toggle-receivables')?.addEventListener('click', () => {
      receivablesExpanded = !receivablesExpanded;
      document.getElementById('card-receivables')?.classList.toggle('open', receivablesExpanded);
    });

    document.getElementById('toggle-subscriptions')?.addEventListener('click', (e) => {
      if (e.target.closest('#btn-go-subs')) {
        e.stopPropagation();
        navigate?.('budget', { tab: 'subscriptions' });
        return;
      }
      const card = document.getElementById('card-subscriptions');
      billsExpanded = !card?.classList.contains('open');
      card?.classList.toggle('open', billsExpanded);
    });

    // 1-Tap Account Sum Toggle on Mini Cards
    container.querySelectorAll('.acc-mini-card[data-account-id]').forEach(card => {
      card.addEventListener('click', () => {
        const accId = card.dataset.accountId;
        const s = getSumSelection();
        const currentlySelected = s[accId] !== false;
        s[accId] = !currentlySelected;
        saveSumSelection(s);

        card.classList.toggle('excluded', currentlySelected);
        const checkEl = card.querySelector('.acc-mini-check');
        if (checkEl) checkEl.innerHTML = !currentlySelected ? renderIcon('check', 11) : '';

        const total = visibleAccounts
          .filter(a => s[a.id] !== false)
          .reduce((sum, a) => sum + a.balance, 0);
        const el = document.getElementById('dash-sum-value');
        if (el) el.textContent = formatTHB(total);
      });
    });

    // Tx row clicks
    container.querySelectorAll('.tx-row[data-tx-id]').forEach(row => {
      row.addEventListener('click', () => openTxModal(row.dataset.txId));
    });

    // Click subscription card -> edit subscription modal
    container.querySelectorAll('.sub-item-card[data-sub-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-pay-sub')) return;
        window.openSubscriptionModal?.(card.dataset.subId);
      });
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

        adv.advanceStatus = 'settled';
        adv.settledAt = new Date().toISOString();
        adv.updatedAt = new Date().toISOString();
        await store.put('transactions', adv);
        await store.addToPendingQueue({ id: adv.id, store: 'transactions', op: 'update' });
        syncTransaction(adv).catch(console.error);

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

        showToast(`บันทึกรับเงินคืนจาก ${friendName} เรียบร้อยแล้ว`);
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
          showToast('บันทึกการชำระบิลเรียบร้อยแล้ว');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  await render();

  return () => {
    if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  };
}

// ── Drag-to-reorder helper ────────────────────────────────────

export function bindDragReorder(list, rowSelector, dataAttr, initialOrder) {
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

// ── Chart ─────────────────────────────────────────────────────

const CHART_COLORS = ['#18181B','#0D9488','#6366F1','#F59E0B','#EC4899','#3B82F6','#8B5CF6','#64748B'];

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
        borderColor:     document.documentElement.dataset.theme === 'dark' ? '#121215' : '#ffffff',
        hoverOffset:     4,
      }],
    },
    options: {
      cutout:   '72%',
      plugins:  { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => ` ฿${ctx.parsed.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` },
      }},
      animation: { duration: 350 },
    },
  });
}

function offsetMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
