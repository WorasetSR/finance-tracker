import { supabase } from "./auth.js";

let uid;
const _data  = {};
const _ready = {};

export function initDB(_client, userId) {
  if (uid === userId) return;
  uid = userId;
  Object.keys(_data).forEach(k => delete _data[k]);
  Object.keys(_ready).forEach(k => delete _ready[k]);
  _fetchAll();
  _listenVisibility();
}

export function clearDB() {
  uid = null;
  Object.keys(_data).forEach(k => delete _data[k]);
  Object.keys(_ready).forEach(k => delete _ready[k]);
}

// ── Fetch ─────────────────────────────────────────────────
async function _fetchAll() {
  const [acc, cat, txs] = await Promise.all([
    supabase.from("accounts").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("categories").select("*").eq("user_id", uid).order("created_at"),
    supabase.from("transactions").select("*").eq("user_id", uid).order("date", { ascending: false })
  ]);

  if (acc.error)  _dispatchError("accounts",     acc.error);
  else            { _data.accounts     = acc.data.map(_mapAccount);     _ready.accounts     = true; }

  if (cat.error)  _dispatchError("categories",   cat.error);
  else            { _data.categories   = cat.data.map(_mapCategory);   _ready.categories   = true; }

  if (txs.error)  _dispatchError("transactions", txs.error);
  else            { _data.transactions = txs.data.map(_mapTransaction); _ready.transactions = true; }

  _notify();
}

let _visibilityBound = false;
function _listenVisibility() {
  if (_visibilityBound) return;
  _visibilityBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && uid) _fetchAll();
  });
}

// ── Row mapping ───────────────────────────────────────────
function _mapAccount(r) {
  return { id: r.id, name: r.name, icon: r.icon, initialBalance: r.initial_balance, hidden: r.hidden };
}
function _mapCategory(r) {
  return { id: r.id, name: r.name, icon: r.icon, budget: r.budget };
}
function _mapTransaction(r) {
  return {
    id: r.id, type: r.type, amount: r.amount, date: r.date, note: r.note,
    accountId: r.account_id, categoryId: r.category_id, categoryCustom: r.category_custom,
    fromAccountId: r.from_account_id, toAccountId: r.to_account_id,
  };
}

// ── Notify / waitFor ──────────────────────────────────────
let _notifyTimer = null;
function _notify() {
  clearTimeout(_notifyTimer);
  _notifyTimer = setTimeout(() => window.dispatchEvent(new Event("dbChanged")), 150);
}

function _dispatchError(name, error) {
  console.error(`❌ ${name}:`, error.code, error.message);
  window.dispatchEvent(new CustomEvent("dbError", { detail: { collection: name, code: error.code, message: error.message } }));
}

function waitFor(name) {
  if (_ready[name]) return Promise.resolve();
  return new Promise(resolve => {
    const h = () => { if (_ready[name]) { window.removeEventListener("dbChanged", h); resolve(); } };
    window.addEventListener("dbChanged", h);
  });
}

// ── Force sync ────────────────────────────────────────────
export async function forceSync() {
  if (!uid) return Promise.reject(new Error("Not initialized"));
  await _fetchAll();
}

// ── READ ──────────────────────────────────────────────────
export async function getAccounts() {
  await waitFor("accounts");
  return _data.accounts ?? [];
}
export async function getCategories() {
  await waitFor("categories");
  return _data.categories ?? [];
}
export async function getTransactions(fromDate, toDate) {
  await waitFor("transactions");
  let txs = _data.transactions ?? [];
  if (fromDate) txs = txs.filter(tx => tx.date >= fromDate && tx.date <= toDate);
  return txs;
}

// ── WRITE — accounts ──────────────────────────────────────
export async function saveAccount(data) {
  if (data.id) {
    const { id, ...rest } = data;
    const { error } = await supabase.from("accounts")
      .update({ name: rest.name, icon: rest.icon, initial_balance: rest.initialBalance, hidden: rest.hidden ?? false })
      .eq("id", id).eq("user_id", uid);
    if (error) throw error;
    _data.accounts = _data.accounts.map(a => a.id === id ? { ...a, ...rest } : a);
    _notify();
    return id;
  }
  const { data: rows, error } = await supabase.from("accounts")
    .insert({ user_id: uid, name: data.name, icon: data.icon, initial_balance: data.initialBalance ?? 0, hidden: data.hidden ?? false })
    .select();
  if (error) throw error;
  _data.accounts = [...(_data.accounts ?? []), _mapAccount(rows[0])];
  _notify();
  return rows[0].id;
}

export async function deleteAccount(id) {
  const { error } = await supabase.from("accounts").delete().eq("id", id).eq("user_id", uid);
  if (error) throw error;
  _data.accounts = _data.accounts.filter(a => a.id !== id);
  _notify();
}

// ── WRITE — categories ────────────────────────────────────
export async function saveCategory(data) {
  if (data.id) {
    const { id, ...rest } = data;
    const { error } = await supabase.from("categories")
      .update({ name: rest.name, icon: rest.icon, budget: rest.budget ?? null })
      .eq("id", id).eq("user_id", uid);
    if (error) throw error;
    _data.categories = _data.categories.map(c => c.id === id ? { ...c, ...rest } : c);
    _notify();
    return id;
  }
  const { data: rows, error } = await supabase.from("categories")
    .insert({ user_id: uid, name: data.name, icon: data.icon, budget: data.budget ?? null })
    .select();
  if (error) throw error;
  _data.categories = [...(_data.categories ?? []), _mapCategory(rows[0])];
  _notify();
  return rows[0].id;
}

export async function deleteCategory(id) {
  const { error } = await supabase.from("categories").delete().eq("id", id).eq("user_id", uid);
  if (error) throw error;
  _data.categories = _data.categories.filter(c => c.id !== id);
  _notify();
}

// ── WRITE — transactions ──────────────────────────────────
export async function saveTransaction(data) {
  const row = {
    user_id:          uid,
    type:             data.type,
    amount:           data.amount,
    date:             data.date,
    note:             data.note ?? null,
    account_id:       data.accountId       ?? null,
    category_id:      data.categoryId      ?? null,
    category_custom:  data.categoryCustom  ?? null,
    from_account_id:  data.fromAccountId   ?? null,
    to_account_id:    data.toAccountId     ?? null,
  };

  if (data.id) {
    const { error } = await supabase.from("transactions")
      .update(row).eq("id", data.id).eq("user_id", uid);
    if (error) throw error;
    const mapped = _mapTransaction({ ...row, id: data.id });
    _data.transactions = _data.transactions
      .map(t => t.id === data.id ? mapped : t)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
    _notify();
    return data.id;
  }

  const { data: rows, error } = await supabase.from("transactions").insert(row).select();
  if (error) throw error;
  const mapped = _mapTransaction(rows[0]);
  _data.transactions = [mapped, ...(_data.transactions ?? [])]
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  _notify();
  return rows[0].id;
}

export async function deleteTransaction(id) {
  const { error } = await supabase.from("transactions").delete().eq("id", id).eq("user_id", uid);
  if (error) throw error;
  _data.transactions = _data.transactions.filter(t => t.id !== id);
  _notify();
}

// ── Seed defaults (first login) ───────────────────────────
export async function seedDefaults() {
  await waitFor("accounts");
  if ((_data.accounts ?? []).length > 0) return;

  const defaultAccounts = [
    { name: "เงินสด", icon: "💵", initialBalance: 0 },
  ];
  const defaultCategories = [
    { name: "อาหาร",    icon: "🍔", budget: null },
    { name: "เดินทาง",  icon: "🚗", budget: null },
    { name: "ช้อปปิ้ง", icon: "🛍", budget: null },
    { name: "สุขภาพ",   icon: "💊", budget: null },
    { name: "บันเทิง",  icon: "🎮", budget: null },
    { name: "ที่อยู่",   icon: "🏠", budget: null },
    { name: "อื่นๆ",    icon: "📦", budget: null },
  ];

  for (const a of defaultAccounts)   await saveAccount(a);
  for (const c of defaultCategories) await saveCategory(c);
}
