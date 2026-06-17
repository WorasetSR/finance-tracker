// ─────────────────────────────────────────────────────────────
//  local-store.js — IndexedDB wrapper
//  Finance Tracker v2
//  DB: finance_tracker_v2  version: 1
// ─────────────────────────────────────────────────────────────

import { DEFAULT_ACCOUNTS, DEFAULT_CATEGORIES } from './schema.js';

const DB_NAME    = 'finance_tracker_v2';
const DB_VERSION = 1;

const STORES = {
  TRANSACTIONS: 'transactions',
  ACCOUNTS:     'accounts',
  CATEGORIES:   'categories',
  BUDGETS:      'budgets',
  SYNC_QUEUE:   'sync_queue',
};

export class LocalStore {
  constructor() {
    /** @type {IDBDatabase|null} */
    this._db = null;
  }

  // ── Lifecycle ──────────────────────────────────────────────

  /**
   * Open (or upgrade) the IndexedDB database and seed defaults if empty.
   * Safe to call multiple times — resolves immediately if already open.
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this._db) return this._db;

    this._db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = /** @type {IDBDatabase} */ (e.target.result);

        // transactions
        if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
          const txStore = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
          txStore.createIndex('date',      'date',      { unique: false });
          txStore.createIndex('accountId', 'accountId', { unique: false });
          txStore.createIndex('deletedAt', 'deletedAt', { unique: false });
        }

        // accounts
        if (!db.objectStoreNames.contains(STORES.ACCOUNTS)) {
          db.createObjectStore(STORES.ACCOUNTS, { keyPath: 'id' });
        }

        // categories
        if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
          db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
        }

        // budgets
        if (!db.objectStoreNames.contains(STORES.BUDGETS)) {
          const bStore = db.createObjectStore(STORES.BUDGETS, { keyPath: 'id' });
          bStore.createIndex('month', 'month', { unique: false });
        }

        // sync_queue
        if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
          db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        }
      };

      req.onsuccess = (e) => resolve(/** @type {IDBDatabase} */ (e.target.result));
      req.onerror   = ()  => reject(req.error);
      req.onblocked = ()  => reject(new Error('IndexedDB blocked — close other tabs'));
    });

    await this.seedDefaults();
    return this._db;
  }

  // ── Low-level helpers ──────────────────────────────────────

  /** Wrap an IDBRequest in a Promise. */
  _req(idbReq) {
    return new Promise((resolve, reject) => {
      idbReq.onsuccess = () => resolve(idbReq.result);
      idbReq.onerror   = () => reject(idbReq.error);
    });
  }

  /** Open a transaction on one or more stores. */
  _tx(storeNames, mode = 'readonly') {
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    return this._db.transaction(names, mode);
  }

  /** Wrap an IDBTransaction in a Promise that resolves on complete. */
  _txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
      tx.onabort    = () => reject(tx.error ?? new Error('Transaction aborted'));
    });
  }

  // ── Generic CRUD ───────────────────────────────────────────

  /**
   * Return all non-deleted records from a store.
   * @param {string} store
   * @returns {Promise<Object[]>}
   */
  async getAll(store) {
    const tx  = this._tx(store);
    const all = await this._req(tx.objectStore(store).getAll());
    return all.filter(r => !r.deletedAt);
  }

  /**
   * Get a single record by id (may be deleted).
   * @param {string} store
   * @param {string} id
   * @returns {Promise<Object|undefined>}
   */
  async get(store, id) {
    const tx = this._tx(store);
    return this._req(tx.objectStore(store).get(id));
  }

  /**
   * Upsert a record.
   * @param {string} store
   * @param {Object} record
   * @returns {Promise<IDBValidKey>}
   */
  async put(store, record) {
    const tx = this._tx(store, 'readwrite');
    const result = await this._req(tx.objectStore(store).put(record));
    await this._txDone(tx);
    return result;
  }

  /**
   * Soft-delete a record: sets deletedAt, marks pendingOp='delete', synced=false.
   * @param {string} store
   * @param {string} id
   */
  async softDelete(store, id) {
    const record = await this.get(store, id);
    if (!record) return;

    const now         = new Date().toISOString();
    record.deletedAt  = now;
    record.updatedAt  = now;
    record.synced     = false;
    record.pendingOp  = 'delete';

    await this.put(store, record);
  }

  // ── Typed queries ──────────────────────────────────────────

  /**
   * Filtered transaction query. Excludes deleted records.
   * All filter params are optional.
   *
   * @param {Object}  [opts]
   * @param {string}  [opts.month]      — YYYY-MM prefix filter
   * @param {string}  [opts.accountId]  — matches accountId OR fromAccountId OR toAccountId
   * @param {string}  [opts.categoryId]
   * @param {'income'|'expense'|'transfer'} [opts.type]
   * @returns {Promise<Object[]>} — sorted descending by date
   */
  async getTransactions({ month, accountId, categoryId, type } = {}) {
    const tx  = this._tx(STORES.TRANSACTIONS);
    const all = await this._req(tx.objectStore(STORES.TRANSACTIONS).getAll());

    return all
      .filter(r => {
        if (r.deletedAt) return false;
        if (month && !r.date?.startsWith(month)) return false;
        if (accountId) {
          const inAcc = r.accountId === accountId;
          const inFrom = r.fromAccountId === accountId;
          const inTo   = r.toAccountId   === accountId;
          if (!inAcc && !inFrom && !inTo) return false;
        }
        if (categoryId && r.categoryId !== categoryId) return false;
        if (type && r.type !== type) return false;
        return true;
      })
      .sort((a, b) => {
        // Primary: date descending; secondary: createdAt descending
        const dateCmp = (b.date ?? '').localeCompare(a.date ?? '');
        if (dateCmp !== 0) return dateCmp;
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '');
      });
  }

  /**
   * All non-archived, non-deleted accounts.
   * @returns {Promise<Object[]>}
   */
  async getAccounts() {
    const all = await this.getAll(STORES.ACCOUNTS);
    return all.filter(a => !a.archived);
  }

  /**
   * All non-deleted categories, optionally filtered by type.
   * Categories with type='both' match any type filter.
   * @param {'expense'|'income'|'both'} [type]
   * @returns {Promise<Object[]>}
   */
  async getCategories(type) {
    const all = await this.getAll(STORES.CATEGORIES);
    if (!type) return all;
    return all.filter(c => c.type === type || c.type === 'both');
  }

  /**
   * Budgets for a specific month (or all if month omitted).
   * @param {string} [month] — YYYY-MM
   * @returns {Promise<Object[]>}
   */
  async getBudgets(month) {
    const all = await this.getAll(STORES.BUDGETS);
    if (!month) return all;
    return all.filter(b => b.month === month);
  }

  // ── Sync queue ─────────────────────────────────────────────

  /**
   * Return all pending operations in the sync queue.
   * @returns {Promise<Object[]>}
   */
  async getPendingQueue() {
    const tx = this._tx(STORES.SYNC_QUEUE);
    return this._req(tx.objectStore(STORES.SYNC_QUEUE).getAll());
  }

  /**
   * Remove a synced item from the queue.
   * @param {string} id
   */
  async clearPendingItem(id) {
    const tx = this._tx(STORES.SYNC_QUEUE, 'readwrite');
    await this._req(tx.objectStore(STORES.SYNC_QUEUE).delete(id));
    await this._txDone(tx);
  }

  /**
   * Add (or update) an operation in the sync queue.
   * The op object must have an `id` field matching the source record.
   * @param {Object} op
   */
  async addToPendingQueue(op) {
    const tx = this._tx(STORES.SYNC_QUEUE, 'readwrite');
    await this._req(tx.objectStore(STORES.SYNC_QUEUE).put(op));
    await this._txDone(tx);
  }

  // ── Computed values ────────────────────────────────────────

  /**
   * Calculate running balance for an account from all non-deleted transactions.
   * Starts from account.initialBalanceMinor.
   * @param {string} accountId
   * @returns {Promise<number>} balance in minor units (THB × 100)
   */
  async computeBalance(accountId) {
    const [account, txAll] = await Promise.all([
      this.get(STORES.ACCOUNTS, accountId),
      this._req(this._tx(STORES.TRANSACTIONS).objectStore(STORES.TRANSACTIONS).getAll()),
    ]);

    let balance = account?.initialBalanceMinor ?? 0;

    for (const t of txAll) {
      if (t.deletedAt) continue;
      switch (t.type) {
        case 'income':
          if (t.accountId === accountId) balance += t.amountMinor;
          break;
        case 'expense':
          if (t.accountId === accountId) balance -= t.amountMinor;
          break;
        case 'transfer':
          if (t.fromAccountId === accountId) balance -= t.amountMinor;
          if (t.toAccountId   === accountId) balance += t.amountMinor;
          break;
      }
    }

    return balance;
  }

  /**
   * Income, expense, and net totals for a given month.
   * @param {string} month — YYYY-MM
   * @returns {Promise<{income: number, expense: number, net: number}>}
   */
  async getMonthSummary(month) {
    const txs = await this.getTransactions({ month });
    let income  = 0;
    let expense = 0;

    for (const t of txs) {
      if (t.type === 'income')  income  += t.amountMinor;
      if (t.type === 'expense') expense += t.amountMinor;
    }

    return { income, expense, net: income - expense };
  }

  // ── Seeding ────────────────────────────────────────────────

  /**
   * Insert DEFAULT_ACCOUNTS and DEFAULT_CATEGORIES only if both stores are empty.
   * Safe to call multiple times (no-op if data already exists).
   */
  async seedDefaults() {
    // Check if accounts store already has any records (including deleted)
    const existingAccounts = await this._req(
      this._tx(STORES.ACCOUNTS).objectStore(STORES.ACCOUNTS).count()
    );
    if (existingAccounts > 0) return; // Already seeded

    const tx = this._tx(
      [STORES.ACCOUNTS, STORES.CATEGORIES],
      'readwrite'
    );

    for (const acc of DEFAULT_ACCOUNTS) {
      tx.objectStore(STORES.ACCOUNTS).put(acc);
    }
    for (const cat of DEFAULT_CATEGORIES) {
      tx.objectStore(STORES.CATEGORIES).put(cat);
    }

    await this._txDone(tx);
  }
}
