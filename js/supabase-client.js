// ─────────────────────────────────────────────────────────────
//  supabase-client.js — Native PostgREST Cloud Sync for Supabase
//  Finance Tracker v3
//  High-performance, zero-external-dependency cloud database client.
// ─────────────────────────────────────────────────────────────

export const DEFAULT_SUPABASE_URL = 'https://jywdntrfthhzivrgfawo.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_bknfSJR5POxeJTYy-0LK4A_PUw_ukbU';

export function getSupabaseConfig() {
  const url = localStorage.getItem('ft_supabase_url') || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem('ft_supabase_key') || DEFAULT_SUPABASE_KEY;
  return { url: url.trim(), key: key.trim() };
}

export function saveSupabaseConfig(url, key) {
  if (url) localStorage.setItem('ft_supabase_url', url.trim());
  else localStorage.removeItem('ft_supabase_url');

  if (key) localStorage.setItem('ft_supabase_key', key.trim());
  else localStorage.removeItem('ft_supabase_key');
}

export function isSupabaseConfigured() {
  const { url, key } = getSupabaseConfig();
  return Boolean(url && key);
}

function getHeaders() {
  const { key } = getSupabaseConfig();
  return {
    'apikey': key,
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates',
  };
}

function getEndpoint(table, query = '') {
  const { url } = getSupabaseConfig();
  const cleanUrl = url.replace(/\/+$/, '');
  return `${cleanUrl}/rest/v1/${table}${query ? `?${query}` : ''}`;
}

// ── Test Connection ──────────────────────────────────────────

export async function testSupabaseConnection() {
  try {
    const res = await fetch(getEndpoint('accounts', 'select=id&limit=1'), {
      headers: getHeaders(),
    });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Transformers: Local <-> Supabase Row ─────────────────────

function toAccountRow(a) {
  return {
    id: a.id,
    name: a.name,
    icon: a.icon || '💳',
    initial_balance_minor: a.initialBalanceMinor ?? 0,
    hidden: Boolean(a.hidden),
    archived: Boolean(a.archived),
    created_at: a.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fromAccountRow(r) {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    initialBalanceMinor: Number(r.initial_balance_minor || 0),
    currency: 'THB',
    hidden: Boolean(r.hidden),
    archived: Boolean(r.archived),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    synced: true,
  };
}

function toCategoryRow(c) {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon || '📦',
    type: c.type || 'expense',
    created_at: c.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fromCategoryRow(r) {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    type: r.type,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    synced: true,
  };
}

function toBudgetRow(b) {
  return {
    id: b.id,
    category_id: b.categoryId,
    amount_minor: b.limitMinor ?? b.amountMinor ?? 0,
    month: b.month,
    created_at: b.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function fromBudgetRow(r) {
  return {
    id: r.id,
    categoryId: r.category_id,
    limitMinor: Number(r.amount_minor || 0),
    amountMinor: Number(r.amount_minor || 0),
    month: r.month,
    currency: 'THB',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    synced: true,
  };
}

export function toTxRow(t) {
  let note = t.note || '';
  if (t.isAdvance) {
    const tag = `[ฝากจ่าย:${t.advanceTo || 'เพื่อน'}:${t.advanceStatus || 'pending'}]`;
    if (/\[ฝากจ่าย:.*?\]/.test(note)) {
      note = note.replace(/\[ฝากจ่าย:.*?\]/, tag);
    } else {
      note = note ? `${note} ${tag}` : tag;
    }
  }
  if (t.isAdvanceSettlement) {
    const tag = `[เคลียร์ฝากจ่าย]`;
    if (!note.includes(tag)) {
      note = note ? `${note} ${tag}` : tag;
    }
  }
  if (t.splitGroupId) {
    const tag = `[split:${t.splitGroupId}]`;
    if (!note.includes('[split:')) {
      note = note ? `${note} ${tag}` : tag;
    }
  }
  if (t.isPoolDeposit) {
    const tag = `[pool-deposit:${t.poolId || ''}:${t.poolMemberId || ''}]`;
    if (!note.includes('[pool-deposit:')) {
      note = note ? `${note} ${tag}` : tag;
    }
  }
  if (t.isPoolExpense) {
    const tag = `[pool-expense:${t.poolId || ''}]`;
    if (!note.includes('[pool-expense:')) {
      note = note ? `${note} ${tag}` : tag;
    }
  }
  if (t.isPoolFunding) {
    const tag = `[pool-funding:${t.poolId || ''}:${t.poolMemberId || ''}]`;
    if (!note.includes('[pool-funding:')) {
      note = note ? `${note} ${tag}` : tag;
    }
  }
  if (t.isPoolSelfShare) {
    const tag = `[pool-self-share:${t.poolId || ''}]`;
    if (!note.includes('[pool-self-share:')) {
      note = note ? `${note} ${tag}` : tag;
    }
  }

  return {
    id: t.id,
    type: t.type,
    amount_minor: t.amountMinor,
    date: t.date,
    note,
    account_id: t.accountId || null,
    category_id: t.categoryId || null,
    from_account_id: t.fromAccountId || null,
    to_account_id: t.toAccountId || null,
    created_at: t.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function fromTxRow(r) {
  const rawNote = r.note || '';
  let note = rawNote;
  let isAdvance = false;
  let advanceTo = '';
  let advanceStatus = null;
  let isAdvanceSettlement = false;
  let splitGroupId = null;
  let isPoolDeposit = false;
  let isPoolExpense = false;
  let isPoolFunding = false;
  let isPoolSelfShare = false;
  let poolId = null;
  let poolMemberId = null;

  const advMatch = rawNote.match(/\[ฝากจ่าย:(.*?):(pending|settled)\]/);
  if (advMatch) {
    isAdvance = true;
    advanceTo = advMatch[1];
    advanceStatus = advMatch[2];
    note = note.replace(advMatch[0], '').trim();
  }

  if (rawNote.includes('[เคลียร์ฝากจ่าย]')) {
    isAdvanceSettlement = true;
    note = note.replace('[เคลียร์ฝากจ่าย]', '').trim();
  }

  const splitMatch = rawNote.match(/\[split:(.*?)\]/);
  if (splitMatch) {
    splitGroupId = splitMatch[1];
    note = note.replace(splitMatch[0], '').trim();
  }

  const poolDepMatch = rawNote.match(/\[pool-deposit:(.*?):(.*?)]/);
  if (poolDepMatch || rawNote.includes('[เติมเงินตี้')) {
    isPoolDeposit = true;
    if (poolDepMatch) {
      poolId = poolDepMatch[1] || null;
      poolMemberId = poolDepMatch[2] || null;
      note = note.replace(poolDepMatch[0], '').trim();
    }
  }

  const poolExpMatch = rawNote.match(/\[pool-expense:(.*?)]/);
  if (poolExpMatch || (rawNote.includes('[ชำระบิลตี้') && !rawNote.includes('ส่วนของเรา'))) {
    isPoolExpense = true;
    if (poolExpMatch) {
      poolId = poolExpMatch[1] || null;
      note = note.replace(poolExpMatch[0], '').trim();
    }
  }

  const poolFundMatch = rawNote.match(/\[pool-funding:(.*?):(.*?)]/);
  if (poolFundMatch || rawNote.includes('[จ่ายค่าตี้')) {
    isPoolFunding = true;
    if (poolFundMatch) {
      poolId = poolFundMatch[1] || null;
      poolMemberId = poolFundMatch[2] || null;
      note = note.replace(poolFundMatch[0], '').trim();
    }
  }

  const poolSelfMatch = rawNote.match(/\[pool-self-share:(.*?)]/);
  if (poolSelfMatch || rawNote.includes('[ชำระบิลตี้ - ส่วนของเรา]')) {
    isPoolSelfShare = true;
    if (poolSelfMatch) {
      poolId = poolSelfMatch[1] || null;
      note = note.replace(poolSelfMatch[0], '').trim();
    }
  }

  return {
    id: r.id,
    type: r.type,
    amountMinor: Number(r.amount_minor || 0),
    date: r.date,
    note,
    rawNote,
    isAdvance,
    advanceTo,
    advanceStatus,
    isAdvanceSettlement,
    splitGroupId,
    isPoolDeposit,
    isPoolExpense,
    isPoolFunding,
    isPoolSelfShare,
    poolId,
    poolMemberId,
    accountId: r.account_id || null,
    categoryId: r.category_id || null,
    fromAccountId: r.from_account_id || null,
    toAccountId: r.to_account_id || null,
    currency: 'THB',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    synced: true,
  };
}

// ── Auto-Sync CRUD Operations ────────────────────────────────

export async function syncAccount(account) {
  if (!isSupabaseConfigured()) return;
  const row = toAccountRow(account);
  const res = await fetch(getEndpoint('accounts'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) console.warn('Supabase syncAccount error:', res.status);
}

export async function deleteAccount(id) {
  if (!isSupabaseConfigured() || !id) return;
  const res = await fetch(getEndpoint('accounts', `id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) console.warn('Supabase deleteAccount error:', res.status);
}

export async function syncCategory(category) {
  if (!isSupabaseConfigured()) return;
  const row = toCategoryRow(category);
  const res = await fetch(getEndpoint('categories'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) console.warn('Supabase syncCategory error:', res.status);
}

export async function deleteCategory(id) {
  if (!isSupabaseConfigured() || !id) return;
  const res = await fetch(getEndpoint('categories', `id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) console.warn('Supabase deleteCategory error:', res.status);
}

export async function syncBudget(budget) {
  if (!isSupabaseConfigured()) return;
  const row = toBudgetRow(budget);
  const res = await fetch(getEndpoint('budgets'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) console.warn('Supabase syncBudget error:', res.status);
}

export async function deleteBudget(id) {
  if (!isSupabaseConfigured() || !id) return;
  const res = await fetch(getEndpoint('budgets', `id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) console.warn('Supabase deleteBudget error:', res.status);
}

export async function syncTransaction(tx) {
  if (!isSupabaseConfigured()) return;
  const row = toTxRow(tx);
  const res = await fetch(getEndpoint('transactions'), {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Supabase syncTransaction error:', res.status, errText);
  }
}

export async function deleteTransaction(id) {
  if (!isSupabaseConfigured() || !id) return;
  const res = await fetch(getEndpoint('transactions', `id=eq.${encodeURIComponent(id)}`), {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('Supabase deleteTransaction error:', res.status, errText);
  }
}

// ── Pull All: Download latest state from Supabase to local ───

export async function pullAllFromSupabase(store) {
  if (!isSupabaseConfigured()) return { ok: false, error: 'Not configured' };

  try {
    const headers = getHeaders();
    const [accRes, catRes, bgtRes, txRes] = await Promise.all([
      fetch(getEndpoint('accounts', 'select=*'), { headers }),
      fetch(getEndpoint('categories', 'select=*'), { headers }),
      fetch(getEndpoint('budgets', 'select=*'), { headers }),
      fetch(getEndpoint('transactions', 'select=*&order=date.desc'), { headers }),
    ]);

    if (!accRes.ok || !catRes.ok || !bgtRes.ok || !txRes.ok) {
      throw new Error(`Failed to fetch from Supabase (HTTP ${accRes.status})`);
    }

    const [accRows, catRows, bgtRows, txRows] = await Promise.all([
      accRes.json(),
      catRes.json(),
      bgtRes.json(),
      txRes.json(),
    ]);

    // If Supabase is totally empty, but local store has records, auto-migrate local data to Supabase once!
    if (accRows.length === 0 && catRows.length === 0 && txRows.length === 0) {
      const localAccs = await store.getAll('accounts');
      if (localAccs.length > 0) {
        console.log('Supabase is empty, performing initial auto-migration from local store...');
        await migrateAllToSupabase(store);
        return { ok: true, count: 0 };
      }
    }

    // Get pending operations from sync queue to know what local items are legitimately unsynced
    const pendingQueue = await store.getPendingQueue().catch(() => []);
    const pendingItemIds = new Set(pendingQueue.map(q => q.id));

    // 1. Safe Reconcile transactions:
    // - If created/updated offline (synced === false or in pending queue): upload to cloud
    // - Else if already synced previously (synced === true): deleted remotely, hardDelete locally
    const remoteTxIds = new Set(txRows.map(r => r.id));
    const localTxs = await store.getAllRaw('transactions');
    for (const ltx of localTxs) {
      if (!remoteTxIds.has(ltx.id)) {
        if (!ltx.deletedAt && (ltx.synced === false || pendingItemIds.has(ltx.id))) {
          syncTransaction(ltx).catch(console.error);
        } else if (ltx.synced === true) {
          await store.hardDelete('transactions', ltx.id);
        }
      }
    }
    for (const r of txRows) {
      await store.put('transactions', fromTxRow(r));
    }

    // 2. Safe Reconcile accounts:
    if (accRows.length > 0) {
      const defaultAccIds = new Set(['acc_cash', 'acc_bank']);
      const remoteAccIds = new Set(accRows.map(r => r.id));
      const localAccs = await store.getAllRaw('accounts');
      for (const lacc of localAccs) {
        if (!remoteAccIds.has(lacc.id)) {
          if (defaultAccIds.has(lacc.id) && !pendingItemIds.has(lacc.id)) {
            await store.hardDelete('accounts', lacc.id);
          } else if (!lacc.deletedAt && (lacc.synced === false || pendingItemIds.has(lacc.id))) {
            syncAccount(lacc).catch(console.error);
          } else if (lacc.synced === true) {
            await store.hardDelete('accounts', lacc.id);
          }
        }
      }
      for (const r of accRows) {
        await store.put('accounts', fromAccountRow(r));
      }
    }

    // 3. Safe Reconcile categories:
    if (catRows.length > 0) {
      const defaultCatIds = new Set([
        'cat_food', 'cat_travel', 'cat_shopping', 'cat_health', 'cat_entertain',
        'cat_housing', 'cat_education', 'cat_other_exp', 'cat_salary', 'cat_freelance',
        'cat_invest', 'cat_other_inc'
      ]);
      const remoteCatIds = new Set(catRows.map(r => r.id));
      const localCats = await store.getAllRaw('categories');
      for (const lcat of localCats) {
        if (!remoteCatIds.has(lcat.id)) {
          if (defaultCatIds.has(lcat.id) && !pendingItemIds.has(lcat.id)) {
            await store.hardDelete('categories', lcat.id);
          } else if (!lcat.deletedAt && (lcat.synced === false || pendingItemIds.has(lcat.id))) {
            syncCategory(lcat).catch(console.error);
          } else if (lcat.synced === true) {
            await store.hardDelete('categories', lcat.id);
          }
        }
      }
      for (const r of catRows) {
        await store.put('categories', fromCategoryRow(r));
      }
    }

    // 4. Safe Reconcile budgets:
    if (bgtRows.length > 0) {
      const remoteBgtIds = new Set(bgtRows.map(r => r.id));
      const localBgts = await store.getAllRaw('budgets');
      for (const lbgt of localBgts) {
        if (!remoteBgtIds.has(lbgt.id)) {
          if (!lbgt.deletedAt && (lbgt.synced === false || pendingItemIds.has(lbgt.id))) {
            syncBudget(lbgt).catch(console.error);
          } else if (lbgt.synced === true) {
            await store.hardDelete('budgets', lbgt.id);
          }
        }
      }
      for (const r of bgtRows) {
        await store.put('budgets', fromBudgetRow(r));
      }
    }

    localStorage.setItem('ft_last_sync', new Date().toISOString());
    localStorage.setItem('ft_sync_state', 'synced');
    return { ok: true, count: txRows.length };
  } catch (err) {
    console.error('pullAllFromSupabase error:', err);
    localStorage.setItem('ft_sync_state', 'error');
    return { ok: false, error: err.message };
  }
}


// ── One-Click Migration: Push all local records to Supabase ──

export async function migrateAllToSupabase(store) {
  if (!isSupabaseConfigured()) throw new Error('ยังไม่ได้กำหนดค่า Supabase');

  const [accounts, categories, budgets, transactions] = await Promise.all([
    store.getAll('accounts'),
    store.getAll('categories'),
    store.getAll('budgets'),
    store.getAll('transactions'),
  ]);

  const headers = getHeaders();

  // 1. Accounts
  if (accounts.length) {
    const rows = accounts.map(toAccountRow);
    const res = await fetch(getEndpoint('accounts'), {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`ล้มเหลวในการส่งข้อมูลบัญชี (HTTP ${res.status})`);
  }

  // 2. Categories
  if (categories.length) {
    const rows = categories.map(toCategoryRow);
    const res = await fetch(getEndpoint('categories'), {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`ล้มเหลวในการส่งข้อมูลหมวดหมู่ (HTTP ${res.status})`);
  }

  // 3. Budgets
  if (budgets.length) {
    const rows = budgets.map(toBudgetRow);
    const res = await fetch(getEndpoint('budgets'), {
      method: 'POST',
      headers,
      body: JSON.stringify(rows),
    });
    if (!res.ok) throw new Error(`ล้มเหลวในการส่งข้อมูลงบประมาณ (HTTP ${res.status})`);
  }

  // 4. Transactions (in chunks of 100)
  if (transactions.length) {
    const rows = transactions.map(toTxRow);
    const CHUNK_SIZE = 100;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const res = await fetch(getEndpoint('transactions'), {
        method: 'POST',
        headers,
        body: JSON.stringify(chunk),
      });
      if (!res.ok) throw new Error(`ล้มเหลวในการส่งข้อมูลรายการ (HTTP ${res.status})`);
    }
  }

  localStorage.setItem('ft_last_sync', new Date().toISOString());
  localStorage.setItem('ft_sync_state', 'synced');
  return {
    accounts: accounts.length,
    categories: categories.length,
    budgets: budgets.length,
    transactions: transactions.length,
  };
}
