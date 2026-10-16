// ─────────────────────────────────────────────────────────────
//  pages/budget.js — Budgets & Subscriptions (Recurring Bills)
//  Finance Tracker v4.0 (Zero-Emoji SVG Icons)
// ─────────────────────────────────────────────────────────────

import { formatTHB, formatMonth } from '../format.js';
import { currentMonth } from '../schema.js';
import { getSubscriptions, getUpcomingBills, paySubscription } from '../subscriptions.js';
import {
  getGroupPools,
  formatMemberBalanceStatus,
  generateReminderMessage,
  calculatePoolStats,
  runPoolCycle,
} from '../group-pool.js';
import { renderIcon } from '../icons.js';

export async function initBudget(container, store, { showToast, showConfirm, tab = 'budget' }) {
  let month = currentMonth();
  let activeTab = tab || 'budget'; // 'budget' | 'subscriptions' | 'pools'

  async function render() {
    const [budgets, templates, txs, categories, accounts] = await Promise.all([
      store.getBudgets(month),
      store.getBudgetTemplates(),
      store.getTransactions({ month, type: 'expense' }),
      store.getCategories('expense'),
      store.getAccounts(),
    ]);

    const accountsWithBalance = await Promise.all(accounts.map(async a => {
      const balance = await store.computeBalance(a.id);
      return { ...a, balance };
    }));
    const catMap = Object.fromEntries(categories.map(c => [c.id, c]));
    const accMap = Object.fromEntries(accountsWithBalance.map(a => [a.id, a]));

    const spendMap = {};
    for (const tx of txs) {
      if (tx.isAdvance || tx.isPoolExpense) continue;
      spendMap[tx.categoryId] = (spendMap[tx.categoryId] || 0) + tx.amountMinor;
    }

    const budgetItems = budgets.map(b => {
      const spent     = spendMap[b.categoryId] || 0;
      const pct       = b.limitMinor > 0 ? Math.round((spent / b.limitMinor) * 100) : 0;
      const remaining = b.limitMinor - spent;
      const cat       = catMap[b.categoryId];
      const over      = spent > b.limitMinor;
      const near      = !over && pct >= 80;
      return { b, cat, spent, pct, remaining, over, near, isTemplate: false };
    });

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

    const allBudgetedCatIds = new Set(allItems.map(i => i.b.categoryId));
    const unbudgeted = Object.entries(spendMap)
      .filter(([catId]) => !allBudgetedCatIds.has(catId))
      .map(([catId, spent]) => ({ cat: catMap[catId], spent }))
      .filter(e => e.cat);

    const totalBudget = allItems.reduce((s, i) => s + i.b.limitMinor, 0);
    const totalSpent  = allItems.reduce((s, i) => s + i.spent, 0);
    const totalPct    = totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0;

    const upcomingBills = getUpcomingBills(31);
    const allSubs = getSubscriptions();
    const totalSubMinor = allSubs.reduce((s, sub) => s + sub.amountMinor, 0);
    const paidSubsCount = upcomingBills.filter(b => b.isPaid).length;

    container.innerHTML = `
      <div class="page-header">
        <div class="month-nav">
          <button class="icon-btn" id="prev-month" title="เดือนก่อน">
            ${renderIcon('chevron-left', 16)}
          </button>
          <h1 class="page-title" style="min-width:120px;text-align:center">${formatMonth(month)}</h1>
          <button class="icon-btn" id="next-month" title="เดือนถัดไป">
            ${renderIcon('chevron-right', 16)}
          </button>
        </div>
        <div class="header-actions">
          <div class="view-mode-toggle">
            <button type="button" class="view-mode-btn ${activeTab === 'budget' ? 'active' : ''}" data-tab="budget">
              ${renderIcon('pie-chart', 14)} งบประมาณ
            </button>
            <button type="button" class="view-mode-btn ${activeTab === 'subscriptions' ? 'active' : ''}" data-tab="subscriptions">
              ${renderIcon('repeat', 14)} บิลประจำ
            </button>
            <button type="button" class="view-mode-btn ${activeTab === 'pools' ? 'active' : ''}" data-tab="pools">
              ${renderIcon('users', 14)} ตี้หารบิล
            </button>
          </div>
          ${activeTab === 'budget' ? `
            <button class="btn-primary btn-sm" id="btn-add-budget">
              ${renderIcon('plus', 14)} ตั้งงบ
            </button>
          ` : activeTab === 'subscriptions' ? `
            <button class="btn-primary btn-sm" id="btn-add-sub">
              ${renderIcon('plus', 14)} เพิ่มบิล
            </button>
          ` : `
            <button class="btn-primary btn-sm" id="btn-add-pool">
              ${renderIcon('plus', 14)} เพิ่มตี้
            </button>
          `}
        </div>
      </div>

      <div class="page-body">
        ${activeTab === 'budget'
          ? renderBudgetView(totalBudget, totalSpent, totalPct, allItems, unbudgeted, templates)
          : activeTab === 'subscriptions'
          ? renderSubscriptionsView(allSubs, upcomingBills, totalSubMinor, paidSubsCount, catMap, accMap)
          : renderGroupPoolsView(month, accMap)}
      </div>
    `;

    document.getElementById('prev-month')?.addEventListener('click', () => { month = offsetMonth(month, -1); render(); });
    document.getElementById('next-month')?.addEventListener('click', () => { month = offsetMonth(month, 1); render(); });

    document.querySelectorAll('.view-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeTab = btn.dataset.tab;
        render();
      });
    });

    document.getElementById('btn-add-budget')?.addEventListener('click', () => openBudgetModal(null, month));
    document.getElementById('btn-add-budget-empty')?.addEventListener('click', () => openBudgetModal(null, month));
    document.getElementById('btn-add-sub')?.addEventListener('click', () => window.openSubscriptionModal?.());
    document.getElementById('btn-add-sub-empty')?.addEventListener('click', () => window.openSubscriptionModal?.());

    // Click budget row -> edit modal
    container.querySelectorAll('.budget-row[data-budget-id]').forEach(row => {
      row.addEventListener('click', () => openBudgetModal(row.dataset.budgetId));
    });

    // Click unbudgeted row -> open budget modal pre-selecting this category! (Zero Dead Buttons)
    container.querySelectorAll('.budget-row.unbudgeted[data-unbudgeted-cat-id]').forEach(row => {
      row.addEventListener('click', () => {
        const catId = row.dataset.unbudgetedCatId;
        openBudgetModal(null, month, catId);
      });
    });

    // Subscriptions actions: clicking card or edit button opens subscription modal
    container.querySelectorAll('.sub-item-card[data-sub-id]').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-pay-sub-budget')) return;
        window.openSubscriptionModal?.(card.dataset.subId);
      });
    });

    container.querySelectorAll('.btn-edit-sub').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.openSubscriptionModal?.(btn.dataset.subId);
      });
    });

    container.querySelectorAll('.btn-pay-sub-budget').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const subId = btn.dataset.subId;
        try {
          await paySubscription(subId, store);
          showToast('บันทึกการชำระบิลเรียบร้อยแล้ว');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    // ── Group Pool Listeners ─────────────────────────────────
    document.getElementById('btn-add-pool')?.addEventListener('click', () => window.openGroupPoolModal?.());
    document.getElementById('btn-add-pool-empty')?.addEventListener('click', () => window.openGroupPoolModal?.());

    container.querySelectorAll('.btn-edit-pool').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.openGroupPoolModal?.(btn.dataset.poolId);
      });
    });

    container.querySelectorAll('.btn-cycle-pool').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const poolId = btn.dataset.poolId;
        const pools = getGroupPools();
        const pool = pools.find(p => p.id === poolId);
        if (!pool) return;
        const acc = accMap[pool.accountId];

        const memberShareMsg = pool.members.map(m => `  • ${m.name}: หัก ${formatTHB(m.shareAmountMinor)}`).join('\n');

        const selfMember = pool.members.find(m => m.isSelf);
        const selfShareMinor = selfMember ? (selfMember.shareAmountMinor || 0) : 0;
        const friendsShareMinor = Math.max(0, pool.amountMinor - selfShareMinor);

        const ok = await showConfirm(
          `ยืนยันตัดรอบบิล "${pool.name}" (${formatMonth(month)})`,
          `ระบบจะดำเนินการแยกบันทึกให้โดยอัตโนมัติ:\n` +
          `1. 💸 บันทึกรายจ่ายส่วนตัวคุณ (ส่วนของเรา): ${formatTHB(selfShareMinor)} (สะท้อนใน Dashboard)\n` +
          `2. 👥 บันทึกรายจ่ายกองกลาง (ส่วนสมาชิก): ${formatTHB(friendsShareMinor)} (ไม่นับเป็นรายจ่ายส่วนตัวคุณ)\n` +
          `3. 💳 รวมตัดยอดจากบัญชี "${acc?.name || 'กองกลาง'}": ${formatTHB(pool.amountMinor)}\n` +
          `4. 👥 หักโควตาสมาชิกทุกคน:\n${memberShareMsg}\n\n` +
          `ยืนยันดำเนินการหรือไม่?`
        );
        if (!ok) return;

        try {
          await runPoolCycle({ poolId, monthStr: month, store });
          showToast('ตัดรอบบิลและอัปเดตยอดสมาชิกเรียบร้อยแล้ว');
          render();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-fund-my-share').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { poolId, memberId } = btn.dataset;
        window.openFundMyShareModal?.(poolId, memberId, render);
      });
    });

    container.querySelectorAll('.btn-topup-member').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const { poolId, memberId } = btn.dataset;
        window.openPoolTopUpModal?.(poolId, memberId, render);
      });
    });

    container.querySelectorAll('.btn-remind-member').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const { poolId, memberId } = btn.dataset;
        const pools = getGroupPools();
        const pool = pools.find(p => p.id === poolId);
        if (!pool) return;
        const member = pool.members.find(m => m.id === memberId);
        if (!member) return;

        const acc = accMap[pool.accountId];
        const accountInfo = acc ? acc.name : '';
        const msg = generateReminderMessage({ pool, member, accountInfo });

        try {
          await navigator.clipboard.writeText(msg);
          showToast(`คัดลอกข้อความทวงเงินของ ${member.name} แล้ว (ส่ง LINE ได้ทันที)`);
        } catch {
          showToast('ไม่สามารถคัดลอกได้อัตโนมัติ กรุณาลองใหม่', 'error');
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
      if (count > 0) { showToast(`ใช้มาตรฐาน ${count} หมวดสำเร็จ`); render(); }
      else showToast('มีงบครบทุกหมวดแล้ว');
    });
  }

  await render();
}

// ── Render Sub-Views ──────────────────────────────────────────

function renderBudgetView(totalBudget, totalSpent, totalPct, allItems, unbudgeted, templates) {
  return `
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

    <!-- Budgeted categories -->
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
                  <span class="budget-icon">${renderIcon(cat?.icon || 'box', 16)}</span>
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
        ${renderIcon('pie-chart', 36)}
        <p>ยังไม่ได้ตั้งงบประมาณ</p>
        <button class="btn-primary btn-sm" id="btn-add-budget-empty">ตั้งงบประมาณแรก</button>
      </div>
    `}

    <!-- Unbudgeted spending -->
    ${unbudgeted.length > 0 ? `
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">ใช้จ่ายโดยไม่ตั้งงบ (${unbudgeted.length})</h2>
          <span class="card-subtitle" style="font-size:11.5px;color:var(--text-muted)">แตะเพื่อตั้งงบหมวดนี้ทันที</span>
        </div>
        <div class="budget-list">
          ${unbudgeted.map(({ cat, spent }) => `
            <div class="budget-row unbudgeted" data-unbudgeted-cat-id="${cat.id}" title="แตะเพื่อตั้งงบประมาณหมวด ${cat.name}">
              <div class="budget-row-header">
                <div class="budget-cat">
                  <span class="budget-icon">${renderIcon(cat?.icon || 'box', 16)}</span>
                  <span class="budget-name">${cat?.name || 'ไม่ระบุ'}</span>
                  <span class="badge badge-neutral" style="font-size:10px">+ ตั้งงบ</span>
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
          <h2 class="card-title">งบมาตรฐานทุกเดือน</h2>
        </div>
        <div class="budget-list">
          ${templates.map(t => {
            const cat = catMap[t.categoryId];
            return `
              <div class="budget-row" data-budget-id="${t.id}" data-is-template="true">
                <div class="budget-row-header">
                  <div class="budget-cat">
                    <span class="budget-icon">${renderIcon(cat?.icon || 'box', 16)}</span>
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
        <h2 class="card-title">เครื่องมือจัดการงบ</h2>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="button" class="btn-ghost btn-sm" id="btn-copy-last-month">คัดลอกงบจากเดือนที่แล้ว</button>
        ${templates.length > 0 ? `<button type="button" class="btn-ghost btn-sm" id="btn-apply-templates">ใช้มาตรฐานเดือนนี้</button>` : ''}
      </div>
    </div>
  `;
}

function renderSubscriptionsView(allSubs, upcomingBills, totalSubMinor, paidSubsCount, catMap, accMap) {
  if (!allSubs.length) {
    return `
      <div class="empty-state">
        ${renderIcon('bell', 36)}
        <p>ยังไม่มีรายการรายจ่ายประจำหรือ Subscriptions</p>
        <button class="btn-primary btn-sm" id="btn-add-sub-empty">+ เพิ่มบิลประจำรายการแรก</button>
      </div>
    `;
  }

  return `
    <div class="card budget-overview">
      <div class="budget-overview-header">
        <div>
          <div class="stat-label">ยอดคงที่ประจำเดือน</div>
          <div class="budget-big-num mono">${formatTHB(totalSubMinor)}</div>
        </div>
        <div style="text-align:right">
          <div class="stat-label">สถานะรอบบิลเดือนนี้</div>
          <div style="font-size:14px;font-weight:700;margin-top:4px">
            <span style="color:var(--income)">จ่ายแล้ว ${paidSubsCount}</span> / ${allSubs.length} บิล
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <h2 class="card-title">รายการรายจ่ายประจำ (${allSubs.length})</h2>
      </div>
      <div class="subs-list">
        ${upcomingBills.map(b => {
          const sub = b.sub;
          const cat = catMap[sub.categoryId];
          const acc = accMap[sub.accountId];

          return `
            <div class="sub-item-card" data-sub-id="${sub.id}">
              <div class="sub-left">
                <span class="sub-icon">${renderIcon(sub.icon || 'tv', 17)}</span>
                <div class="sub-details">
                  <span class="sub-name">
                    ${sub.name}
                    <span class="sub-urgency-badge ${b.urgency}">${b.label}</span>
                  </span>
                  <span class="sub-meta">
                    ตัดทุกวันที่ ${b.dueDay} · ${acc?.name || 'บัญชีทั่วไป'}${cat ? ' · ' + cat.name : ''}
                    ${sub.note ? ' · ' + sub.note : ''}
                  </span>
                </div>
              </div>
              <div class="sub-right">
                <span class="mono" style="font-weight:700;font-size:14px">${formatTHB(sub.amountMinor)}</span>
                <div style="display:flex;gap:6px">
                  ${!b.isPaid ? `
                    <button type="button" class="btn-primary btn-xs btn-pay-sub-budget" data-sub-id="${sub.id}">
                      ${renderIcon('check', 12)} ชำระ
                    </button>
                  ` : ''}
                  <button type="button" class="btn-ghost btn-xs btn-edit-sub" data-sub-id="${sub.id}">
                    แก้ไข
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderGroupPoolsView(month, accMap) {
  const pools = getGroupPools();
  const allStats = pools.map(p => calculatePoolStats(p));
  const totalNetBalanceMinor = allStats.reduce((s, st) => s + st.netPoolBalanceMinor, 0);
  const totalPrepaidMinor = allStats.reduce((s, st) => s + st.totalPrepaidMinor, 0);
  const totalDebtMinor = allStats.reduce((s, st) => s + st.totalDebtMinor, 0);

  if (pools.length === 0) {
    return `
      <div class="card empty-state-card" style="text-align:center;padding:48px 20px">
        <div style="font-size:36px;margin-bottom:12px">${renderIcon('users', 36)}</div>
        <h3 style="font-size:16px;font-weight:700;margin-bottom:6px">ยังไม่มีตี้หารบิล</h3>
        <p style="font-size:13px;color:var(--text-secondary);max-width:340px;margin:0 auto 16px">
          รวมเงินเพื่อนจ่ายบิลประจำ จัดการยอดโอนล่วงหน้า และติดตามยอดค้างชำระรายคนได้ง่ายๆ
        </p>
        <button type="button" class="btn-primary" id="btn-add-pool-empty">
          ${renderIcon('plus', 14)} สร้างตี้หารบิล
        </button>
      </div>
    `;
  }

  return `
    <div class="card budget-overview">
      <div class="budget-overview-header">
        <div>
          <div class="stat-label">เงินกองกลางสุทธิ (ทุกตี้)</div>
          <div class="budget-big-num mono" style="color:${totalNetBalanceMinor >= 0 ? 'var(--income)' : 'var(--expense)'}">
            ${formatTHB(totalNetBalanceMinor)}
          </div>
        </div>
        <div style="text-align:right">
          <div class="stat-label">สถานะเพื่อนร่วมตี้</div>
          <div style="font-size:13px;font-weight:600;margin-top:4px">
            <span style="color:var(--income)">โอนล่วงหน้า +${formatTHB(totalPrepaidMinor)}</span>
            ${totalDebtMinor > 0 ? `<br><span style="color:var(--expense)">ค้างจ่าย -${formatTHB(totalDebtMinor)}</span>` : ''}
          </div>
        </div>
      </div>
    </div>

    ${pools.map(pool => {
      const acc = accMap[pool.accountId];
      const isCycleDone = pool.lastCycleMonth === month;

      return `
        <div class="card pool-card" data-pool-id="${pool.id}">
          <div class="pool-card-header">
            <div class="pool-title-group">
              <span class="pool-icon">${renderIcon(pool.icon || 'users', 20)}</span>
              <div>
                <div class="pool-name">
                  ${pool.name}
                  ${isCycleDone ? '<span class="badge-advance settled">ตัดรอบบิลแล้ว</span>' : ''}
                </div>
                <div class="pool-meta">
                  ตัดทุกวันที่ ${pool.dueDay} · บัญชี: ${acc?.name || 'บัญชีกองกลาง'} · บิลรวม: ${formatTHB(pool.amountMinor)}
                </div>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center">
              ${!isCycleDone ? `
                <button type="button" class="btn-primary btn-xs btn-cycle-pool" data-pool-id="${pool.id}">
                  ${renderIcon('repeat', 12)} ตัดรอบบิล
                </button>
              ` : ''}
              <button type="button" class="btn-ghost btn-xs btn-edit-pool" data-pool-id="${pool.id}">
                แก้ไข
              </button>
            </div>
          </div>

          <!-- Central Pool Account Live Balance Strip -->
          <div class="pool-account-badge" style="display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);border-radius:var(--radius-sm);padding:8px 12px;margin:10px 0 12px;font-size:12.5px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:var(--text-muted)">${renderIcon('credit-card', 14)} บัญชีกองกลาง:</span>
              <span style="font-weight:600;color:var(--text-primary)">${acc?.name || 'บัญชีกองกลาง'}</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="color:var(--text-muted)">เงินสดในบัญชี:</span>
              <span class="mono" style="font-weight:700;color:${(acc?.balance ?? 0) >= 0 ? 'var(--income)' : 'var(--expense)'}">
                ${formatTHB(acc?.balance ?? 0)}
              </span>
            </div>
          </div>

          <div class="pool-members-list">
            ${pool.members.map(member => {
              const status = formatMemberBalanceStatus(member);
              const badgeClass = status.type === 'prepaid' ? 'badge-advance settled' : (status.type === 'debt' ? 'badge-advance debt' : 'badge-advance neutral');
              const sign = member.balanceMinor > 0 ? '+' : '';

              return `
                <div class="pool-member-row" data-member-id="${member.id}">
                  <div class="pool-member-left">
                    <span class="pool-member-name">
                      ${member.name} ${member.isSelf ? '<span class="badge badge-neutral" style="font-size:10px;padding:0 4px">เรา</span>' : ''}
                      <span class="${badgeClass}">
                        ${sign}${formatTHB(member.balanceMinor)} (${status.label})
                      </span>
                    </span>
                    <span class="pool-member-subtext">
                      ยอดหาร: ${formatTHB(member.shareAmountMinor)} / เดือน
                    </span>
                  </div>
                  <div class="pool-member-right">
                    ${member.isSelf ? `
                      <button type="button" class="btn-primary btn-xs btn-fund-my-share" data-pool-id="${pool.id}" data-member-id="${member.id}">
                        ${renderIcon('repeat', 12)} โอนเงินเราเข้ากองกลาง
                      </button>
                    ` : `
                      <button type="button" class="btn-ghost btn-xs btn-topup-member" data-pool-id="${pool.id}" data-member-id="${member.id}">
                        ${renderIcon('plus', 12)} เงินเพื่อนเข้า
                      </button>
                      ${status.type === 'debt' ? `
                        <button type="button" class="btn-ghost btn-xs btn-remind-member" data-pool-id="${pool.id}" data-member-id="${member.id}" title="คัดลอกข้อความทวงเงิน">
                          ${renderIcon('send', 12)} ทวง
                        </button>
                      ` : ''}
                    `}
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }).join('')}
  `;
}

// ── Helpers ───────────────────────────────────────────────────

function offsetMonth(monthStr, delta) {
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function openBudgetModal(id, month, prefillCategoryId = null) {
  window.openBudgetModal?.(id, month, prefillCategoryId);
}
