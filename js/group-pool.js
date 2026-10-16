// ─────────────────────────────────────────────────────────────
//  group-pool.js — Group Subscription Pool & Member Ledger
//  Finance Tracker v4.1  |  All amounts in minor units (THB × 100)
// ─────────────────────────────────────────────────────────────

import { genId, nowISO, todayStr, currentMonth, makeTransaction } from './schema.js';
import { syncTransaction } from './supabase-client.js';

export const STORAGE_KEY_POOLS = 'ft_group_pools';

/**
 * @typedef {Object} PoolMember
 * @property {string} id
 * @property {string} name
 * @property {boolean} isSelf
 * @property {number} shareAmountMinor
 * @property {number} balanceMinor - Positive: prepaid; Negative: in arrears/debt; 0: settled
 * @property {string} [phone]
 * @property {string} [promptpay]
 */

/**
 * @typedef {Object} GroupPool
 * @property {string} id
 * @property {string} name
 * @property {string} icon
 * @property {string} accountId
 * @property {number} amountMinor
 * @property {number} dueDay
 * @property {'monthly'|'yearly'} cycle
 * @property {string} [lastCycleMonth]
 * @property {string} [note]
 * @property {PoolMember[]} members
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * Factory for a new pool member.
 */
export function makePoolMember({
  id = genId('pmem'),
  name = '',
  isSelf = false,
  shareAmountMinor = 0,
  balanceMinor = 0,
  phone = '',
  promptpay = '',
} = {}) {
  return {
    id,
    name: name.trim(),
    isSelf: Boolean(isSelf),
    shareAmountMinor: Math.max(0, Math.round(Number(shareAmountMinor) || 0)),
    balanceMinor: Math.round(Number(balanceMinor) || 0),
    phone: phone.trim(),
    promptpay: promptpay.trim(),
  };
}

/**
 * Factory for a new group pool.
 */
export function makeGroupPool({
  id = genId('pool'),
  name = '',
  icon = 'users',
  accountId = '',
  amountMinor = 0,
  dueDay = 1,
  cycle = 'monthly',
  lastCycleMonth = '',
  note = '',
  members = [],
} = {}) {
  const now = nowISO();
  return {
    id,
    name: name.trim(),
    icon,
    accountId,
    amountMinor: Math.max(0, Math.round(Number(amountMinor) || 0)),
    dueDay: Math.min(31, Math.max(1, Math.round(Number(dueDay) || 1))),
    cycle,
    lastCycleMonth,
    note: note.trim(),
    members: members.map(m => makePoolMember(m)),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Retrieve all group pools from local storage.
 * @returns {GroupPool[]}
 */
export function getGroupPools() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POOLS);
    if (!raw) return [];
    const pools = JSON.parse(raw);
    return Array.isArray(pools) ? pools : [];
  } catch (e) {
    console.error('Failed to load group pools:', e);
    return [];
  }
}

/**
 * Save or update a group pool.
 * @param {GroupPool} pool
 */
export function saveGroupPool(pool) {
  const all = getGroupPools();
  const now = nowISO();
  const idx = all.findIndex(p => p.id === pool.id);

  if (idx >= 0) {
    all[idx] = { ...pool, updatedAt: now };
  } else {
    all.push({ ...pool, createdAt: pool.createdAt || now, updatedAt: now });
  }

  localStorage.setItem(STORAGE_KEY_POOLS, JSON.stringify(all));
}

/**
 * Delete a group pool by ID.
 * @param {string} id
 */
export function deleteGroupPool(id) {
  const all = getGroupPools().filter(p => p.id !== id);
  localStorage.setItem(STORAGE_KEY_POOLS, JSON.stringify(all));
}

/**
 * Record a member top-up/transfer into the pool account.
 * Updates the member's balance and creates an income transaction marked with isPoolDeposit: true.
 *
 * @param {Object} opts
 * @param {string} opts.poolId
 * @param {string} opts.memberId
 * @param {number} opts.amountMinor
 * @param {string} [opts.date]
 * @param {string} [opts.note]
 * @param {Object} opts.store
 */
export async function topUpMember({
  poolId,
  memberId,
  amountMinor,
  date = todayStr(),
  note = '',
  store,
}) {
  const pools = getGroupPools();
  const pool = pools.find(p => p.id === poolId);
  if (!pool) throw new Error('ไม่พบข้อมูลตี้หารบิล');

  const member = pool.members.find(m => m.id === memberId);
  if (!member) throw new Error('ไม่พบข้อมูลสมาชิกในตี้');

  const topUpMinor = Math.max(0, Math.round(Number(amountMinor) || 0));
  if (topUpMinor <= 0) throw new Error('จำนวนเงินเติมต้องมากกว่า 0 บาท');

  // Update member balance
  member.balanceMinor += topUpMinor;
  pool.updatedAt = nowISO();
  saveGroupPool(pool);

  // Create pool deposit transaction in the pool account
  const tx = makeTransaction({
    type: 'income',
    amountMinor: topUpMinor,
    date,
    accountId: pool.accountId,
    categoryId: 'cat_settle',
    note: `[เติมเงินตี้ ${pool.name}] จาก ${member.name}${note ? ' (' + note + ')' : ''}`,
    isPoolDeposit: true,
    poolId: pool.id,
    poolMemberId: member.id,
  });

  if (store) {
    await store.put('transactions', tx);
    await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
    try {
      syncTransaction(tx).catch(console.error);
    } catch {}
  }

  return { pool, member, tx };
}

/**
 * Fund the user's own share into the pool account via transfer from personal account.
 * Updates the user member's balance and creates a transfer transaction from personal account -> pool account.
 *
 * @param {Object} opts
 * @param {string} opts.poolId
 * @param {string} opts.memberId
 * @param {string} opts.fromAccountId - Personal source account
 * @param {number} opts.amountMinor
 * @param {string} [opts.date]
 * @param {string} [opts.note]
 * @param {Object} opts.store
 */
export async function fundMyShare({
  poolId,
  memberId,
  fromAccountId,
  amountMinor,
  date = todayStr(),
  note = '',
  store,
}) {
  const pools = getGroupPools();
  const pool = pools.find(p => p.id === poolId);
  if (!pool) throw new Error('ไม่พบข้อมูลตี้หารบิล');

  const member = pool.members.find(m => m.id === memberId);
  if (!member) throw new Error('ไม่พบข้อมูลสมาชิกในตี้');

  const fundingMinor = Math.max(0, Math.round(Number(amountMinor) || 0));
  if (fundingMinor <= 0) throw new Error('จำนวนเงินโอนต้องมากกว่า 0 บาท');
  if (!fromAccountId) throw new Error('กรุณาเลือกบัญชีต้นทางส่วนตัว');

  // Update member balance
  member.balanceMinor += fundingMinor;
  pool.updatedAt = nowISO();
  saveGroupPool(pool);

  // Create transfer transaction from personal account to pool account
  const tx = makeTransaction({
    type: 'transfer',
    amountMinor: fundingMinor,
    date,
    fromAccountId,
    toAccountId: pool.accountId,
    note: note ? note : `[จ่ายค่าตี้ ${pool.name}] ส่วนของ ${member.name}`,
    isPoolFunding: true,
    poolId: pool.id,
    poolMemberId: member.id,
  });

  if (store) {
    await store.put('transactions', tx);
    await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
    try {
      syncTransaction(tx).catch(console.error);
    } catch {}
  }

  return { pool, member, tx };
}

/**
 * Execute monthly cycle deduction for all members and record pool bill payment expense.
 *
 * @param {Object} opts
 * @param {string} opts.poolId
 * @param {string} [opts.monthStr] - YYYY-MM
 * @param {string} [opts.date] - YYYY-MM-DD
 * @param {Object} opts.store
 */
export async function runPoolCycle({
  poolId,
  monthStr = currentMonth(),
  date = todayStr(),
  store,
}) {
  const pools = getGroupPools();
  const pool = pools.find(p => p.id === poolId);
  if (!pool) throw new Error('ไม่พบข้อมูลตี้หารบิล');

  // Deduct each member's share amount
  for (const member of pool.members) {
    member.balanceMinor -= member.shareAmountMinor;
  }

  const selfMember = pool.members.find(m => m.isSelf);
  const selfShareMinor = selfMember ? (selfMember.shareAmountMinor || 0) : 0;
  const friendsShareMinor = Math.max(0, pool.amountMinor - selfShareMinor);

  pool.lastCycleMonth = monthStr;
  pool.updatedAt = nowISO();
  saveGroupPool(pool);

  const createdTxs = [];

  // 1. ส่วนของเรา: นับเป็นรายจ่ายส่วนตัว (Personal Expense) เพื่อสะท้อนค่าใช้จ่ายจริงใน Dashboard
  if (selfShareMinor > 0) {
    const selfTx = makeTransaction({
      type: 'expense',
      amountMinor: selfShareMinor,
      date,
      accountId: pool.accountId,
      categoryId: 'cat_bills',
      note: `[ชำระบิลตี้ - ส่วนของเรา] ${pool.name} ประจำรอบเดือน ${monthStr}`,
      isPoolSelfShare: true,
      poolId: pool.id,
      poolMemberId: selfMember?.id || null,
    });
    createdTxs.push(selfTx);
  }

  // 2. ส่วนของสมาชิกคนอื่น: ตัดออกจากบัญชีกองกลาง แต่ไม่นับเป็นรายจ่ายส่วนตัวคุณ (isPoolExpense: true)
  if (friendsShareMinor > 0) {
    const friendsTx = makeTransaction({
      type: 'expense',
      amountMinor: friendsShareMinor,
      date,
      accountId: pool.accountId,
      categoryId: 'cat_bills',
      note: `[ชำระบิลตี้ - ส่วนของสมาชิก] ${pool.name} ประจำรอบเดือน ${monthStr}`,
      isPoolExpense: true,
      poolId: pool.id,
    });
    createdTxs.push(friendsTx);
  }

  if (createdTxs.length === 0) {
    const zeroTx = makeTransaction({
      type: 'expense',
      amountMinor: 0,
      date,
      accountId: pool.accountId,
      categoryId: 'cat_bills',
      note: `[ชำระบิลตี้] ${pool.name} ประจำรอบเดือน ${monthStr}`,
      isPoolExpense: true,
      poolId: pool.id,
    });
    createdTxs.push(zeroTx);
  }

  if (store) {
    for (const tx of createdTxs) {
      await store.put('transactions', tx);
      await store.addToPendingQueue({ id: tx.id, store: 'transactions', op: 'create' });
      try {
        syncTransaction(tx).catch(console.error);
      } catch {}
    }
  }

  return { pool, createdTxs, tx: createdTxs[0] };
}

/**
 * Format member balance status into readable Thai labels and months count.
 * @param {PoolMember} member
 */
export function formatMemberBalanceStatus(member) {
  const bal = member.balanceMinor;
  const share = member.shareAmountMinor || 1;

  if (bal > 0) {
    const months = Math.floor(bal / share);
    return {
      type: 'prepaid',
      label: months >= 1 ? `จ่ายล่วงหน้า ${months} ด.` : `เครดิตคงเหลือ`,
      amountMinor: bal,
      months,
      colorClass: 'status-prepaid',
    };
  }

  if (bal < 0) {
    const debt = Math.abs(bal);
    const months = Math.ceil(debt / share);
    return {
      type: 'debt',
      label: months >= 1 ? `ค้างชำระ ${months} ด.` : `ค้างชำระ`,
      amountMinor: debt,
      months,
      colorClass: 'status-debt',
    };
  }

  return {
    type: 'settled',
    label: 'ครบถ้วน',
    amountMinor: 0,
    months: 0,
    colorClass: 'status-settled',
  };
}

/**
 * Generate a friendly Thai reminder message to copy to LINE / chat.
 * @param {Object} opts
 * @param {GroupPool} opts.pool
 * @param {PoolMember} opts.member
 * @param {string} [opts.accountInfo]
 */
export function generateReminderMessage({ pool, member, accountInfo = '' }) {
  const status = formatMemberBalanceStatus(member);
  if (status.type !== 'debt') {
    return `สวัสดีครับ ${member.name} ยอดค่าตี้ ${pool.name} ปัจจุบันเคลียร์ครบถ้วนแล้วครับ ขอบคุณครับ! 🙏`;
  }

  const baht = (status.amountMinor / 100).toLocaleString('th-TH', {
    minimumFractionDigits: status.amountMinor % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  let msg = `สวัสดีครับ ${member.name} ขออนุญาตแจ้งเตือนค่าตี้ "${pool.name}" รอบบิลนี้ครับ 🎬\n`;
  msg += `• ยอดค้างชำระ: ${baht} บาท (ค้างประมาณ ${status.months} เดือน)\n`;
  if (accountInfo) {
    msg += `• โอนเข้าบัญชี: ${accountInfo}\n`;
  }
  msg += `รบกวนโอนแล้วส่งสลิปให้หน่อยนะครับ ขอบคุณมากครับ! 🙏`;

  return msg;
}

/**
 * Calculate financial totals across all members in a pool.
 * @param {GroupPool} pool
 */
export function calculatePoolStats(pool) {
  let totalPrepaidMinor = 0;
  let totalDebtMinor = 0;
  let netPoolBalanceMinor = 0;

  for (const m of pool.members) {
    netPoolBalanceMinor += m.balanceMinor;
    if (m.balanceMinor > 0) {
      totalPrepaidMinor += m.balanceMinor;
    } else if (m.balanceMinor < 0) {
      totalDebtMinor += Math.abs(m.balanceMinor);
    }
  }

  return {
    totalPrepaidMinor,
    totalDebtMinor,
    netPoolBalanceMinor,
    memberCount: pool.members.length,
    inDebtCount: pool.members.filter(m => m.balanceMinor < 0).length,
  };
}
