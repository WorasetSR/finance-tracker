// ─────────────────────────────────────────────────────────────
//  subscriptions.js — Recurring bills & subscription tracking
//  Finance Tracker v2
// ─────────────────────────────────────────────────────────────

import { makeTransaction, todayStr, currentMonth, genId } from './schema.js';
import { syncTransaction } from './supabase-client.js';

const STORAGE_KEY = 'ft_subscriptions';

/**
 * @typedef {Object} Subscription
 * @property {string} id
 * @property {string} name
 * @property {number} amountMinor
 * @property {string} categoryId
 * @property {string} accountId
 * @property {number} dueDay         - Day of month (1-31)
 * @property {'monthly'|'yearly'} cycle
 * @property {string} icon           - Emoji
 * @property {string} [lastPaidMonth] - YYYY-MM
 * @property {string} [note]
 * @property {string} createdAt
 * @property {string} updatedAt
 */

export function getSubscriptions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load subscriptions:', e);
    return [];
  }
}

export function saveSubscription(sub) {
  const all = getSubscriptions();
  const now = new Date().toISOString();
  if (sub.id) {
    const idx = all.findIndex(s => s.id === sub.id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], ...sub, updatedAt: now };
    } else {
      all.push({ ...sub, updatedAt: now });
    }
  } else {
    const newSub = {
      ...sub,
      id: genId('sub'),
      createdAt: now,
      updatedAt: now,
    };
    all.push(newSub);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteSubscription(id) {
  const all = getSubscriptions().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/**
 * Get upcoming, overdue, and paid bills for the current month
 * @param {number} [withinDays=10]
 */
export function getUpcomingBills(withinDays = 14) {
  const subs = getSubscriptions();
  const now = new Date();
  const curYear = now.getFullYear();
  const curMonthNum = now.getMonth(); // 0-based
  const curDay = now.getDate();
  const curMonthStr = currentMonth();

  const daysInMonth = new Date(curYear, curMonthNum + 1, 0).getDate();

  const results = subs.map(sub => {
    const isPaid = sub.lastPaidMonth === curMonthStr;
    const dueDay = Math.min(sub.dueDay || 1, daysInMonth);
    const diffDays = dueDay - curDay;

    let urgency = 'normal'; // 'paid' | 'overdue' | 'due_today' | 'due_soon' | 'normal'
    let label = '';

    if (isPaid) {
      urgency = 'paid';
      label = 'จ่ายแล้ว';
    } else if (diffDays === 0) {
      urgency = 'due_today';
      label = 'ครบกำหนดวันนี้';
    } else if (diffDays < 0) {
      urgency = 'overdue';
      label = `เลยกำหนด ${Math.abs(diffDays)} วัน`;
    } else if (diffDays <= 3) {
      urgency = 'due_soon';
      label = `อีก ${diffDays} วัน`;
    } else {
      label = `วันที่ ${dueDay}`;
    }

    return {
      sub,
      dueDay,
      diffDays,
      isPaid,
      urgency,
      label,
    };
  });

  // Sort: overdue first, then due today, then due soon, then later, then paid
  const priority = { overdue: 1, due_today: 2, due_soon: 3, normal: 4, paid: 5 };
  results.sort((a, b) => {
    if (priority[a.urgency] !== priority[b.urgency]) {
      return priority[a.urgency] - priority[b.urgency];
    }
    return a.dueDay - b.dueDay;
  });

  return results;
}

/**
 * 1-Click pay subscription: creates actual expense transaction and marks paid
 * @param {string} subId
 * @param {Object} store
 * @param {string} [payAccountId]
 */
export async function paySubscription(subId, store, payAccountId = null) {
  const subs = getSubscriptions();
  const sub = subs.find(s => s.id === subId);
  if (!sub) throw new Error('ไม่พบข้อมูลรายจ่ายประจำ');

  const accountId = payAccountId || sub.accountId;
  const curMonthStr = currentMonth();

  let categoryId = sub.categoryId;
  if (!categoryId && store) {
    try {
      const cats = await store.getCategories('expense');
      const matched = cats.find(c => /บิล|bill|สมาชิก|ค่าใช้จ่าย/i.test(c.name)) || cats[0];
      if (matched) categoryId = matched.id;
    } catch {}
  }

  const tx = makeTransaction({
    type: 'expense',
    amountMinor: sub.amountMinor,
    date: todayStr(),
    accountId,
    categoryId: categoryId || 'cat_other_exp',
    note: `[บิลประจำ] ${sub.name}`,
  });

  await store.put('transactions', tx);
  await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
  syncTransaction(tx).catch(console.error);

  sub.lastPaidMonth = curMonthStr;
  sub.updatedAt = new Date().toISOString();
  saveSubscription(sub);

  return tx;
}
