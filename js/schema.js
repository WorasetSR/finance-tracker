// ─────────────────────────────────────────────────────────────
//  schema.js — ID helpers + factory functions + seed data
//  Finance Tracker v2  |  all amounts stored as integer minor units
// ─────────────────────────────────────────────────────────────

// ── ID / time helpers ────────────────────────────────────────

/**
 * Generate a unique ID.
 * Format: {prefix}_{YYYYMMDD}_{HHMMSS}_{4hex}
 * Example: tx_20260617_103000_ab12
 */
export function genId(prefix) {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const MM   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  const hh   = String(now.getHours()).padStart(2, '0');
  const mm   = String(now.getMinutes()).padStart(2, '0');
  const ss   = String(now.getSeconds()).padStart(2, '0');
  const rand = Math.random().toString(16).slice(2, 6).padEnd(4, '0');
  return `${prefix}_${yyyy}${MM}${dd}_${hh}${mm}${ss}_${rand}`;
}

/**
 * Return (or create) a stable client identifier stored in localStorage.
 * Key: ft_client_id
 */
export function genClientId() {
  const KEY = 'ft_client_id';
  try {
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem(KEY);
      if (!id) {
        const a = Math.random().toString(16).slice(2, 10);
        const b = Math.random().toString(16).slice(2, 10);
        id = `client_${a}${b}`;
        localStorage.setItem(KEY, id);
      }
      return id;
    }
  } catch {}
  return 'client_node_default';
}

/** Current ISO datetime string. */
export function nowISO() {
  return new Date().toISOString();
}

/** Today as YYYY-MM-DD (local time). */
export function todayStr() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0')
  );
}

/** Current month as YYYY-MM (local time). */
export function currentMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// ── Factory functions ────────────────────────────────────────

/**
 * Create a complete transaction object.
 *
 * @param {Object} opts
 * @param {'income'|'expense'|'transfer'} opts.type
 * @param {number}  opts.amountMinor   — THB × 100, integer
 * @param {string}  [opts.date]        — YYYY-MM-DD, defaults to today
 * @param {string}  [opts.note]
 * @param {string}  [opts.accountId]
 * @param {string}  [opts.categoryId]
 * @param {string}  [opts.fromAccountId]
 * @param {string}  [opts.toAccountId]
 */
export function makeTransaction({
  type,
  amountMinor,
  date,
  note       = '',
  accountId  = null,
  categoryId = null,
  fromAccountId = null,
  toAccountId   = null,
  splitGroupId  = null,
  isAdvance     = false,
  advanceTo     = '',
  advanceStatus = null,
  settledAt     = null,
  isAdvanceSettlement = false,
  isPoolDeposit = false,
  isPoolExpense = false,
  isPoolFunding = false,
  poolId = null,
  poolMemberId = null,
} = {}) {
  const now = nowISO();
  return {
    id:             genId('tx'),
    type,
    amountMinor,
    currency:       'THB',
    date:           date ?? todayStr(),
    note:           note ?? '',
    accountId:      accountId     ?? null,
    categoryId:     categoryId    ?? null,
    fromAccountId:  fromAccountId ?? null,
    toAccountId:    toAccountId   ?? null,
    transferId:     null,
    splitGroupId:   splitGroupId  ?? null,
    isAdvance:      Boolean(isAdvance),
    advanceTo:      advanceTo     ?? '',
    advanceStatus:  advanceStatus ?? (isAdvance ? 'pending' : null),
    settledAt:      settledAt     ?? null,
    isAdvanceSettlement: Boolean(isAdvanceSettlement),
    isPoolDeposit:  Boolean(isPoolDeposit),
    isPoolExpense:  Boolean(isPoolExpense),
    isPoolFunding:  Boolean(isPoolFunding),
    poolId:         poolId        ?? null,
    poolMemberId:   poolMemberId  ?? null,
    createdAt:      now,
    updatedAt:      now,
    deletedAt:      null,
    clientId:       genClientId(),
    synced:         false,
    pendingOp:      'create',
  };
}

/**
 * Create a complete account object.
 *
 * @param {Object} opts
 * @param {string} opts.name
 * @param {string} [opts.icon]
 * @param {number} [opts.initialBalanceMinor]
 */
export function makeAccount({
  name,
  icon                 = 'credit-card',
  initialBalanceMinor  = 0,
} = {}) {
  const now = nowISO();
  return {
    id:                  genId('acc'),
    name,
    icon,
    initialBalanceMinor,
    currency:            'THB',
    archived:            false,
    createdAt:           now,
    updatedAt:           now,
    deletedAt:           null,
    clientId:            genClientId(),
    synced:              false,
    pendingOp:           'create',
  };
}

/**
 * Create a complete category object.
 *
 * @param {Object} opts
 * @param {string} opts.name
 * @param {string} [opts.icon]
 * @param {'expense'|'income'|'both'} [opts.type]
 */
export function makeCategory({
  name,
  icon = 'box',
  type = 'expense',
} = {}) {
  const now = nowISO();
  return {
    id:        genId('cat'),
    name,
    icon,
    type,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    clientId:  genClientId(),
    synced:    false,
    pendingOp: 'create',
  };
}

/**
 * Create a complete budget object.
 *
 * @param {Object} opts
 * @param {string} opts.month       — YYYY-MM
 * @param {string} opts.categoryId
 * @param {number} opts.limitMinor  — THB × 100, integer
 */
export function makeBudget({ month, categoryId, limitMinor } = {}) {
  const now = nowISO();
  return {
    id:         genId('bgt'),
    month,
    categoryId,
    limitMinor,
    currency:   'THB',
    createdAt:  now,
    updatedAt:  now,
    deletedAt:  null,
    clientId:   genClientId(),
    synced:     false,
    pendingOp:  'create',
  };
}

// ── Default seed data ────────────────────────────────────────

const _SEED_TS = '2026-01-01T00:00:00.000Z';
const _SEED_COMMON = {
  createdAt: _SEED_TS,
  updatedAt: _SEED_TS,
  deletedAt: null,
  synced:    false,
  pendingOp: 'create',
};

export const DEFAULT_ACCOUNTS = [
  {
    id: 'acc_cash',
    name: 'เงินสด',
    icon: 'banknote',
    initialBalanceMinor: 0,
    currency: 'THB',
    archived: false,
    ..._SEED_COMMON,
  },
  {
    id: 'acc_bank',
    name: 'ธนาคาร',
    icon: 'landmark',
    initialBalanceMinor: 0,
    currency: 'THB',
    archived: false,
    ..._SEED_COMMON,
  },
];

export const DEFAULT_CATEGORIES = [
  // ── Expense ──────────────────────────────────────────────
  { id: 'cat_food',      name: 'อาหาร',       icon: 'utensils',     type: 'expense', ..._SEED_COMMON },
  { id: 'cat_travel',    name: 'เดินทาง',     icon: 'car',          type: 'expense', ..._SEED_COMMON },
  { id: 'cat_shopping',  name: 'ช้อปปิ้ง',   icon: 'shopping-bag', type: 'expense', ..._SEED_COMMON },
  { id: 'cat_health',    name: 'สุขภาพ',      icon: 'heart-pulse',  type: 'expense', ..._SEED_COMMON },
  { id: 'cat_entertain', name: 'บันเทิง',     icon: 'gamepad',      type: 'expense', ..._SEED_COMMON },
  { id: 'cat_housing',   name: 'ที่พัก',      icon: 'home',         type: 'expense', ..._SEED_COMMON },
  { id: 'cat_education', name: 'การศึกษา',    icon: 'book-open',    type: 'expense', ..._SEED_COMMON },
  { id: 'cat_advance',   name: 'ออกให้คนอื่นก่อน', icon: 'users',   type: 'expense', ..._SEED_COMMON },
  { id: 'cat_other_exp', name: 'อื่นๆ',       icon: 'box',          type: 'expense', ..._SEED_COMMON },
  // ── Income ───────────────────────────────────────────────
  { id: 'cat_salary',    name: 'เงินเดือน',    icon: 'briefcase',    type: 'income', ..._SEED_COMMON },
  { id: 'cat_freelance', name: 'รายได้พิเศษ', icon: 'sparkles',     type: 'income', ..._SEED_COMMON },
  { id: 'cat_invest',    name: 'ลงทุน',        icon: 'trending-up',  type: 'income', ..._SEED_COMMON },
  { id: 'cat_settle',    name: 'ได้รับเงินคืน', icon: 'arrow-up-right', type: 'income', ..._SEED_COMMON },
  { id: 'cat_other_inc', name: 'อื่นๆ',        icon: 'coins',        type: 'income', ..._SEED_COMMON },
];
